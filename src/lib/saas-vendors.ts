/**
 * Known SaaS Vendor Patterns for Detection
 * Used to identify recurring SaaS charges from transaction descriptions
 */

export interface SaaSVendorPattern {
    pattern: RegExp;
    name: string;
    category: string;
}

export const SAAS_PATTERNS: SaaSVendorPattern[] = [
    // Communication & Collaboration
    { pattern: /slack/i, name: 'Slack', category: 'Communication' },
    { pattern: /zoom/i, name: 'Zoom', category: 'Communication' },
    { pattern: /microsoft\s*365|office\s*365|ms\s*365/i, name: 'Microsoft 365', category: 'Productivity' },
    { pattern: /google\s*workspace|gsuite|g\s*suite/i, name: 'Google Workspace', category: 'Productivity' },
    { pattern: /teams/i, name: 'Microsoft Teams', category: 'Communication' },
    { pattern: /discord/i, name: 'Discord', category: 'Communication' },
    { pattern: /webex/i, name: 'Webex', category: 'Communication' },

    // Project Management
    { pattern: /notion/i, name: 'Notion', category: 'Productivity' },
    { pattern: /asana/i, name: 'Asana', category: 'Project Management' },
    { pattern: /trello/i, name: 'Trello', category: 'Project Management' },
    { pattern: /monday\.com|monday\s/i, name: 'Monday.com', category: 'Project Management' },
    { pattern: /clickup/i, name: 'ClickUp', category: 'Project Management' },
    { pattern: /basecamp/i, name: 'Basecamp', category: 'Project Management' },
    { pattern: /jira/i, name: 'Jira', category: 'Project Management' },
    { pattern: /confluence/i, name: 'Confluence', category: 'Documentation' },
    { pattern: /linear/i, name: 'Linear', category: 'Project Management' },

    // Design
    { pattern: /figma/i, name: 'Figma', category: 'Design' },
    { pattern: /canva/i, name: 'Canva', category: 'Design' },
    { pattern: /adobe/i, name: 'Adobe Creative Cloud', category: 'Design' },
    { pattern: /sketch/i, name: 'Sketch', category: 'Design' },
    { pattern: /invision/i, name: 'InVision', category: 'Design' },
    { pattern: /miro/i, name: 'Miro', category: 'Design' },

    // Development
    { pattern: /github/i, name: 'GitHub', category: 'DevOps' },
    { pattern: /gitlab/i, name: 'GitLab', category: 'DevOps' },
    { pattern: /bitbucket/i, name: 'Bitbucket', category: 'DevOps' },
    { pattern: /vercel/i, name: 'Vercel', category: 'DevOps' },
    { pattern: /netlify/i, name: 'Netlify', category: 'DevOps' },
    { pattern: /heroku/i, name: 'Heroku', category: 'DevOps' },
    { pattern: /digitalocean/i, name: 'DigitalOcean', category: 'Cloud' },
    { pattern: /datadog/i, name: 'Datadog', category: 'DevOps' },
    { pattern: /sentry/i, name: 'Sentry', category: 'DevOps' },
    { pattern: /pagerduty/i, name: 'PagerDuty', category: 'DevOps' },

    // Cloud Infrastructure
    { pattern: /aws|amazon\s*web\s*services/i, name: 'AWS', category: 'Cloud' },
    { pattern: /azure/i, name: 'Microsoft Azure', category: 'Cloud' },
    { pattern: /google\s*cloud|gcp/i, name: 'Google Cloud', category: 'Cloud' },

    // CRM & Sales
    { pattern: /salesforce/i, name: 'Salesforce', category: 'CRM' },
    { pattern: /hubspot/i, name: 'HubSpot', category: 'CRM' },
    { pattern: /pipedrive/i, name: 'Pipedrive', category: 'CRM' },
    { pattern: /zendesk/i, name: 'Zendesk', category: 'Support' },
    { pattern: /intercom/i, name: 'Intercom', category: 'Support' },
    { pattern: /freshdesk/i, name: 'Freshdesk', category: 'Support' },
    { pattern: /freshworks/i, name: 'Freshworks', category: 'Support' },

    // Marketing
    { pattern: /mailchimp/i, name: 'Mailchimp', category: 'Marketing' },
    { pattern: /sendgrid/i, name: 'SendGrid', category: 'Marketing' },
    { pattern: /mailgun/i, name: 'Mailgun', category: 'Marketing' },
    { pattern: /constant\s*contact/i, name: 'Constant Contact', category: 'Marketing' },
    { pattern: /hootsuite/i, name: 'Hootsuite', category: 'Marketing' },
    { pattern: /buffer/i, name: 'Buffer', category: 'Marketing' },
    { pattern: /semrush/i, name: 'SEMrush', category: 'Marketing' },
    { pattern: /ahrefs/i, name: 'Ahrefs', category: 'Marketing' },

    // Finance & Accounting
    { pattern: /quickbooks/i, name: 'QuickBooks', category: 'Finance' },
    { pattern: /xero/i, name: 'Xero', category: 'Finance' },
    { pattern: /stripe/i, name: 'Stripe', category: 'Payments' },
    { pattern: /square/i, name: 'Square', category: 'Payments' },
    { pattern: /paypal/i, name: 'PayPal', category: 'Payments' },
    { pattern: /brex/i, name: 'Brex', category: 'Finance' },
    { pattern: /ramp/i, name: 'Ramp', category: 'Finance' },
    { pattern: /bill\.com/i, name: 'Bill.com', category: 'Finance' },
    { pattern: /expensify/i, name: 'Expensify', category: 'Finance' },

    // HR & Payroll
    { pattern: /gusto/i, name: 'Gusto', category: 'HR' },
    { pattern: /rippling/i, name: 'Rippling', category: 'HR' },
    { pattern: /workday/i, name: 'Workday', category: 'HR' },
    { pattern: /bamboohr|bamboo\s*hr/i, name: 'BambooHR', category: 'HR' },
    { pattern: /deel/i, name: 'Deel', category: 'HR' },

    // Security
    { pattern: /1password|onepassword/i, name: '1Password', category: 'Security' },
    { pattern: /lastpass/i, name: 'LastPass', category: 'Security' },
    { pattern: /okta/i, name: 'Okta', category: 'Security' },
    { pattern: /auth0/i, name: 'Auth0', category: 'Security' },

    // Storage & Files
    { pattern: /dropbox/i, name: 'Dropbox', category: 'Storage' },
    { pattern: /box\.com|box\s/i, name: 'Box', category: 'Storage' },
    { pattern: /google\s*drive/i, name: 'Google Drive', category: 'Storage' },

    // Analytics
    { pattern: /mixpanel/i, name: 'Mixpanel', category: 'Analytics' },
    { pattern: /amplitude/i, name: 'Amplitude', category: 'Analytics' },
    { pattern: /segment/i, name: 'Segment', category: 'Analytics' },
    { pattern: /heap/i, name: 'Heap', category: 'Analytics' },
    { pattern: /hotjar/i, name: 'Hotjar', category: 'Analytics' },
    { pattern: /fullstory/i, name: 'FullStory', category: 'Analytics' },

    // E-commerce
    { pattern: /shopify/i, name: 'Shopify', category: 'E-commerce' },
    { pattern: /bigcommerce/i, name: 'BigCommerce', category: 'E-commerce' },
    { pattern: /woocommerce/i, name: 'WooCommerce', category: 'E-commerce' },

    // Communication APIs
    { pattern: /twilio/i, name: 'Twilio', category: 'APIs' },
    { pattern: /plivo/i, name: 'Plivo', category: 'APIs' },

    // AI & ML
    { pattern: /openai/i, name: 'OpenAI', category: 'AI' },
    { pattern: /anthropic/i, name: 'Anthropic', category: 'AI' },
    { pattern: /cohere/i, name: 'Cohere', category: 'AI' },
];

/**
 * Detect if a transaction description matches a known SaaS vendor
 */
export function detectSaaSVendor(description: string): SaaSVendorPattern | null {
    for (const pattern of SAAS_PATTERNS) {
        if (pattern.pattern.test(description)) {
            return pattern;
        }
    }
    return null;
}

/**
 * Check if a description likely represents a SaaS subscription
 * Uses both pattern matching and heuristics
 */
export function isSaaSSubscription(description: string): boolean {
    // First check known patterns
    if (detectSaaSVendor(description)) {
        return true;
    }

    // Heuristics for unknown vendors
    const saasIndicators = [
        /subscription/i,
        /monthly/i,
        /annual/i,
        /recurring/i,
        /license/i,
        /saas/i,
        /software/i,
        /\.com/i,
        /\.io/i,
        /cloud/i,
        /pro\s*plan/i,
        /enterprise/i,
        /team\s*plan/i,
        /business\s*plan/i,
    ];

    return saasIndicators.some(indicator => indicator.test(description));
}

/**
 * Normalize vendor name for consistent matching
 */
export function normalizeVendorName(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '') // Remove special characters
        .replace(/\s+/g, ' '); // Normalize whitespace
}
