/**
 * Intelligence Engine for Subscription Analysis
 * 
 * Provides cached AI analysis for all subscriptions including:
 * - Vendor classification (FIXED_PLAN vs NEGOTIABLE)
 * - Value assessment summaries
 * - Ranked alternatives
 * - Negotiation emails (for negotiable vendors)
 */

import prisma from './prisma';

// ============================================================================
// TYPES
// ============================================================================

export type VendorType = 'FIXED_PLAN' | 'NEGOTIABLE';

export interface Alternative {
    name: string;
    website: string;
    priceRange: string;
    category: string;
    strengths: string[];
    bestFor: string;
    whyBetter: string;
}

export interface IntelligenceSnapshot {
    id: string;
    subscriptionId: string;
    vendorId: string;
    vendorType: VendorType;
    valueSummary: string;
    assumptions: string[];
    alternatives: Alternative[];
    negotiationEmail: string | null;
    negotiationSubject: string | null;
    analyzedAt: Date;
    regeneratedAt: Date | null;
}

// ============================================================================
// VENDOR CLASSIFICATION
// ============================================================================

// Fallback vendors with fixed pricing that typically don't negotiate
// These are used only when vendor doesn't have vendorType set in database
const DEFAULT_FIXED_PLAN_VENDORS = [
    'spotify', 'netflix', 'disney+', 'hulu', 'amazon prime',
    'apple music', 'youtube premium', 'hbo max', 'paramount+',
];

// Fallback vendors known to be negotiable (enterprise sales, custom pricing)
// Used when vendor vendorType is not set in database
const DEFAULT_NEGOTIABLE_VENDORS = [
    'salesforce', 'hubspot', 'marketo', 'pardot',
    'workday', 'servicenow', 'snowflake', 'databricks',
    'okta', 'auth0', 'onelogin',
    'datadog', 'splunk', 'new relic', 'dynatrace',
    'aws', 'azure', 'gcp',
    'sap', 'oracle', 'ibm',
    'zendesk', 'intercom', 'freshdesk',
    'atlassian', 'jira', 'confluence',
    'slack', 'teams',
    'docusign', 'adobe', 'autodesk',
    // Removed items that are actually negotiable at enterprise scale:
    // github, gitlab, notion, figma, zoom, google workspace, microsoft 365, canva
];

/**
 * Classify a vendor as FIXED_PLAN or NEGOTIABLE
 * Priority: 1) Database vendorType, 2) Fallback lists, 3) Category heuristics, 4) Default to NEGOTIABLE
 */
export async function classifyVendor(vendorName: string, category?: string | null): Promise<VendorType> {
    const normalized = vendorName.toLowerCase().trim();

    // First, check database for explicit vendorType
    try {
        const vendor = await prisma.vendor.findFirst({
            where: {
                OR: [
                    { normalizedName: normalized.replace(/\s+/g, '') },
                    { name: { contains: vendorName, mode: 'insensitive' } },
                ],
            },
            select: { vendorType: true },
        });

        if (vendor?.vendorType) {
            return vendor.vendorType as VendorType;
        }
    } catch (error) {
        console.error('[Intelligence] Error fetching vendor type from DB:', error);
        // Fall through to fallback logic
    }

    // Fallback: Check explicit lists (only for obvious consumer subscriptions)
    if (DEFAULT_FIXED_PLAN_VENDORS.some(v => normalized.includes(v))) {
        return 'FIXED_PLAN';
    }

    if (DEFAULT_NEGOTIABLE_VENDORS.some(v => normalized.includes(v))) {
        return 'NEGOTIABLE';
    }

    // Heuristics based on category
    const negotiableCategories = [
        'Enterprise', 'CRM', 'ERP', 'Security', 'Infrastructure',
        'Analytics', 'Data', 'HR', 'Finance', 'DevOps', 'Cloud'
    ];

    if (category && negotiableCategories.some(c => category.includes(c))) {
        return 'NEGOTIABLE';
    }

    // Default: assume negotiable for B2B SaaS (conservative approach)
    return 'NEGOTIABLE';
}

/**
 * Synchronous version for cases where async is not possible
 * Uses only fallback lists, not database
 */
export function classifyVendorSync(vendorName: string, category?: string | null): VendorType {
    const normalized = vendorName.toLowerCase().trim();

    if (DEFAULT_FIXED_PLAN_VENDORS.some(v => normalized.includes(v))) {
        return 'FIXED_PLAN';
    }

    if (DEFAULT_NEGOTIABLE_VENDORS.some(v => normalized.includes(v))) {
        return 'NEGOTIABLE';
    }

    const negotiableCategories = [
        'Enterprise', 'CRM', 'ERP', 'Security', 'Infrastructure',
        'Analytics', 'Data', 'HR', 'Finance', 'DevOps', 'Cloud'
    ];

    if (category && negotiableCategories.some(c => category.includes(c))) {
        return 'NEGOTIABLE';
    }

    return 'NEGOTIABLE';
}

// ============================================================================
// AI ANALYSIS GENERATION
// ============================================================================

/**
 * Generate a value assessment summary for a subscription
 */
export async function generateValueSummary(
    vendorName: string,
    plan: string | null,
    amount: number | null,
    seats: number | null,
    billingCycle: string | null,
    category: string | null
): Promise<{ summary: string; assumptions: string[] }> {
    // Calculate per-seat cost if applicable
    let perSeatCost = '';
    if (amount && seats && seats > 0) {
        const monthly = billingCycle === 'yearly' ? amount / 12 : amount;
        const perSeat = monthly / seats;
        perSeatCost = `$${perSeat.toFixed(2)}/seat/month`;
    }

    const assumptions: string[] = [];

    // Build value summary based on available data
    let summary = '';

    if (amount && plan) {
        const monthlyAmount = billingCycle === 'yearly' ? amount / 12 : amount;

        if (monthlyAmount < 50) {
            summary = `${vendorName} ${plan} is a cost-effective choice at $${monthlyAmount.toFixed(0)}/month.`;
            assumptions.push('Low cost relative to typical SaaS pricing');
        } else if (monthlyAmount < 200) {
            summary = `${vendorName} ${plan} is moderately priced at $${monthlyAmount.toFixed(0)}/month.`;
            assumptions.push('Mid-range pricing for category');
        } else {
            summary = `${vendorName} ${plan} is a premium investment at $${monthlyAmount.toFixed(0)}/month.`;
            assumptions.push('Higher-end pricing suggests enterprise features');
        }

        if (perSeatCost) {
            summary += ` Per-seat cost: ${perSeatCost}.`;
            assumptions.push(`Based on ${seats} seats`);
        }
    } else if (vendorName) {
        summary = `${vendorName} subscription detected. Additional details needed for full assessment.`;
        assumptions.push('Limited data available for analysis');
    }

    // Add category context
    if (category) {
        assumptions.push(`Category: ${category}`);
    }

    return { summary, assumptions };
}

/**
 * Generate ranked alternatives for a vendor
 */
export async function generateAlternatives(
    vendorName: string,
    category: string | null,
    currentAmount: number | null
): Promise<Alternative[]> {
    // Curated alternatives database by category
    const alternativesDB: Record<string, Alternative[]> = {
        'Communication': [
            {
                name: 'Microsoft Teams',
                website: 'https://teams.microsoft.com',
                priceRange: '$4-12.50/user/month',
                category: 'Communication',
                strengths: ['Office 365 integration', 'Video conferencing', 'Enterprise security'],
                bestFor: 'Organizations using Microsoft ecosystem',
                whyBetter: 'Bundled with Microsoft 365, potentially reducing total cost'
            },
            {
                name: 'Discord',
                website: 'https://discord.com',
                priceRange: 'Free-$9.99/month',
                category: 'Communication',
                strengths: ['Free tier', 'Great audio quality', 'Community features'],
                bestFor: 'Small teams and developer communities',
                whyBetter: 'Generous free tier with excellent voice chat'
            },
            {
                name: 'Slack',
                website: 'https://slack.com',
                priceRange: '$7.25-15/user/month',
                category: 'Communication',
                strengths: ['Rich integrations', 'Threaded conversations', 'Workflows'],
                bestFor: 'Teams needing extensive app integrations',
                whyBetter: 'Industry-leading integration ecosystem'
            },
        ],
        'Productivity': [
            {
                name: 'Notion',
                website: 'https://notion.so',
                priceRange: 'Free-$15/user/month',
                category: 'Productivity',
                strengths: ['All-in-one workspace', 'Databases', 'Wiki'],
                bestFor: 'Teams wanting docs + projects in one place',
                whyBetter: 'Consolidates multiple tools into one'
            },
            {
                name: 'Obsidian',
                website: 'https://obsidian.md',
                priceRange: 'Free-$8/user/month',
                category: 'Productivity',
                strengths: ['Local-first', 'Markdown', 'Extensible'],
                bestFor: 'Privacy-conscious knowledge workers',
                whyBetter: 'No vendor lock-in, own your data'
            },
            {
                name: 'Coda',
                website: 'https://coda.io',
                priceRange: 'Free-$10/user/month',
                category: 'Productivity',
                strengths: ['Doc + spreadsheet hybrid', 'Automations'],
                bestFor: 'Teams needing dynamic documents',
                whyBetter: 'More powerful automation than traditional docs'
            },
        ],
        'Project Management': [
            {
                name: 'Linear',
                website: 'https://linear.app',
                priceRange: 'Free-$8/user/month',
                category: 'Project Management',
                strengths: ['Fast UI', 'Developer-focused', 'Keyboard shortcuts'],
                bestFor: 'Engineering teams',
                whyBetter: 'Purpose-built for software development workflows'
            },
            {
                name: 'Asana',
                website: 'https://asana.com',
                priceRange: 'Free-$24.99/user/month',
                category: 'Project Management',
                strengths: ['Flexible workflows', 'Timeline view', 'Goals'],
                bestFor: 'Cross-functional teams',
                whyBetter: 'Better for non-engineering project management'
            },
            {
                name: 'ClickUp',
                website: 'https://clickup.com',
                priceRange: 'Free-$12/user/month',
                category: 'Project Management',
                strengths: ['All-in-one', 'Customizable', 'Time tracking'],
                bestFor: 'Teams wanting maximum features',
                whyBetter: 'More features at lower price point'
            },
        ],
        'Design': [
            {
                name: 'Figma',
                website: 'https://figma.com',
                priceRange: 'Free-$15/editor/month',
                category: 'Design',
                strengths: ['Real-time collaboration', 'Web-based', 'Prototyping'],
                bestFor: 'Collaborative design teams',
                whyBetter: 'Industry standard for UI/UX design collaboration'
            },
            {
                name: 'Penpot',
                website: 'https://penpot.app',
                priceRange: 'Free (open source)',
                category: 'Design',
                strengths: ['Free', 'Self-hosted option', 'Open source'],
                bestFor: 'Budget-conscious or privacy-focused teams',
                whyBetter: 'Zero cost with no vendor lock-in'
            },
        ],
    };

    // Get alternatives for category or use generic
    let alternatives = category ? alternativesDB[category] : null;

    if (!alternatives) {
        // Generic alternatives
        alternatives = [
            {
                name: 'Research needed',
                website: '',
                priceRange: 'Varies',
                category: category || 'Uncategorized',
                strengths: ['Specific research recommended'],
                bestFor: 'Your specific use case',
                whyBetter: 'Direct comparison needed based on your requirements'
            },
        ];
    }

    // Filter out the current vendor and limit to top 3
    return alternatives
        .filter(a => !a.name.toLowerCase().includes(vendorName.toLowerCase()))
        .slice(0, 3);
}

/**
 * Generate a negotiation email for negotiable vendors
 */
export async function generateNegotiationEmail(
    vendorName: string,
    plan: string | null,
    amount: number | null,
    seats: number | null,
    renewalDate: Date | null,
    billingCycle: string | null
): Promise<{ subject: string; body: string }> {
    const renewalStr = renewalDate
        ? renewalDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : 'soon';

    const amountStr = amount ? `$${amount.toLocaleString()}` : 'our current rate';
    const seatsStr = seats ? `${seats} seats` : 'our licenses';
    const planStr = plan || 'current plan';

    const subject = `${vendorName} Renewal Discussion - Exploring Options`;

    const body = `Hi ${vendorName} Team,

I hope this message finds you well. I'm reaching out regarding our upcoming renewal${renewalDate ? ` on ${renewalStr}` : ''}.

We've been using ${vendorName} and appreciate the value it provides to our team. As we approach renewal, I wanted to discuss our subscription to ensure we're on the most appropriate plan for our needs.

Current subscription details:
• Plan: ${planStr}
• Seats: ${seatsStr}
• Amount: ${amountStr}${billingCycle ? ` (${billingCycle})` : ''}

As we evaluate our software stack, I'd like to understand:

1. Are there any current promotions or loyalty discounts available?
2. Would there be cost benefits to adjusting our seat count or commitment term?
3. What options exist for optimizing our plan based on our actual usage?

We value our partnership with ${vendorName} and want to ensure we're making the most of our investment. I'd appreciate the opportunity to discuss this before our renewal date.

Could we schedule a brief call to explore options?

Best regards`;

    return { subject, body };
}

// ============================================================================
// INTELLIGENCE SNAPSHOT MANAGEMENT
// ============================================================================

/**
 * Get or create intelligence snapshot for a subscription
 */
export async function getOrCreateIntelligence(
    subscriptionId: string,
    forceRegenerate: boolean = false
): Promise<IntelligenceSnapshot | null> {
    // Try to get existing snapshot
    if (!forceRegenerate) {
        const existing = await prisma.subscriptionIntelligence.findUnique({
            where: { subscriptionId },
        });

        if (existing) {
            return {
                ...existing,
                vendorType: existing.vendorType as VendorType,
                assumptions: JSON.parse(existing.assumptions || '[]'),
                alternatives: JSON.parse(existing.alternatives),
            };
        }
    }

    // Get subscription with vendor
    const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: { vendor: true },
    });

    if (!subscription) {
        console.error('[Intelligence] Subscription not found:', subscriptionId);
        return null;
    }

    // Generate all intelligence data
    const vendor = subscription.vendor;
    const vendorType = await classifyVendor(vendor.name, vendor.category);

    const { summary, assumptions } = await generateValueSummary(
        vendor.name,
        subscription.plan,
        subscription.amount ? Number(subscription.amount) : null,
        subscription.seats,
        subscription.billingCycle,
        vendor.category
    );

    const alternatives = await generateAlternatives(
        vendor.name,
        vendor.category,
        subscription.amount ? Number(subscription.amount) : null
    );

    // Generate negotiation email only for negotiable vendors
    let negotiationEmail: string | null = null;
    let negotiationSubject: string | null = null;

    if (vendorType === 'NEGOTIABLE') {
        const email = await generateNegotiationEmail(
            vendor.name,
            subscription.plan,
            subscription.amount ? Number(subscription.amount) : null,
            subscription.seats,
            subscription.renewalDate,
            subscription.billingCycle
        );
        negotiationEmail = email.body;
        negotiationSubject = email.subject;
    }

    // Upsert the intelligence snapshot
    const snapshot = await prisma.subscriptionIntelligence.upsert({
        where: { subscriptionId },
        update: {
            vendorType,
            valueSummary: summary,
            assumptions: JSON.stringify(assumptions),
            alternatives: JSON.stringify(alternatives),
            negotiationEmail,
            negotiationSubject,
            regeneratedAt: forceRegenerate ? new Date() : undefined,
        },
        create: {
            subscriptionId,
            vendorId: vendor.id,
            vendorType,
            valueSummary: summary,
            assumptions: JSON.stringify(assumptions),
            alternatives: JSON.stringify(alternatives),
            negotiationEmail,
            negotiationSubject,
        },
    });

    // Update vendor type if needed
    if (vendor.vendorType !== vendorType) {
        await prisma.vendor.update({
            where: { id: vendor.id },
            data: { vendorType },
        });
    }

    console.log('[Intelligence] Generated snapshot for:', vendor.name, { vendorType });

    return {
        ...snapshot,
        vendorType: snapshot.vendorType as VendorType,
        assumptions: JSON.parse(snapshot.assumptions || '[]'),
        alternatives: JSON.parse(snapshot.alternatives),
    };
}

/**
 * Update just the negotiation email (when user edits)
 */
export async function updateNegotiationEmail(
    subscriptionId: string,
    email: string,
    subject?: string
): Promise<void> {
    await prisma.subscriptionIntelligence.update({
        where: { subscriptionId },
        data: {
            negotiationEmail: email,
            negotiationSubject: subject,
        },
    });
}

/**
 * Generate Gmail compose URL
 */
export function getGmailComposeUrl(to: string, subject: string, body: string): string {
    const params = new URLSearchParams({
        view: 'cm',
        to,
        su: subject,
        body,
    });
    return `https://mail.google.com/mail/?${params.toString()}`;
}
