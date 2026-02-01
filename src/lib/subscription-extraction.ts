/**
 * LLM-based Subscription Extraction
 * Stage 2 of the two-stage extraction pipeline
 * 
 * Extracts structured subscription data from email content using LLM
 */

import { detectSaaSVendor } from './saas-vendors';

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractedSubscription {
    vendor_name: string;
    vendor_domain: string | null;
    plan: string | null;
    seats: number | null;
    billing_cycle: 'monthly' | 'yearly' | null;
    renewal_date: string | null; // YYYY-MM-DD format
    amount: number | null;
    currency: string | null;
    confidence: 'low' | 'medium' | 'high';
}

// Known SaaS domains for vendor normalization
const KNOWN_SAAS_DOMAINS: Record<string, { name: string; category: string }> = {
    'slack.com': { name: 'Slack', category: 'Communication' },
    'notion.so': { name: 'Notion', category: 'Productivity' },
    'github.com': { name: 'GitHub', category: 'DevOps' },
    'figma.com': { name: 'Figma', category: 'Design' },
    'zoom.us': { name: 'Zoom', category: 'Communication' },
    'atlassian.com': { name: 'Atlassian', category: 'Project Management' },
    'jira.com': { name: 'Jira', category: 'Project Management' },
    'trello.com': { name: 'Trello', category: 'Project Management' },
    'dropbox.com': { name: 'Dropbox', category: 'Storage' },
    'hubspot.com': { name: 'HubSpot', category: 'CRM' },
    'salesforce.com': { name: 'Salesforce', category: 'CRM' },
    'intercom.io': { name: 'Intercom', category: 'Customer Support' },
    'zendesk.com': { name: 'Zendesk', category: 'Customer Support' },
    'mailchimp.com': { name: 'Mailchimp', category: 'Marketing' },
    'sendgrid.com': { name: 'SendGrid', category: 'Email' },
    'stripe.com': { name: 'Stripe', category: 'Payments' },
    'aws.amazon.com': { name: 'AWS', category: 'Cloud Infrastructure' },
    'vercel.com': { name: 'Vercel', category: 'DevOps' },
    'heroku.com': { name: 'Heroku', category: 'Cloud Infrastructure' },
    'mongodb.com': { name: 'MongoDB', category: 'Database' },
    'datadog.com': { name: 'Datadog', category: 'Monitoring' },
    'sentry.io': { name: 'Sentry', category: 'Monitoring' },
    'auth0.com': { name: 'Auth0', category: 'Security' },
    'okta.com': { name: 'Okta', category: 'Security' },
    'linear.app': { name: 'Linear', category: 'Project Management' },
    'asana.com': { name: 'Asana', category: 'Project Management' },
    'monday.com': { name: 'Monday.com', category: 'Project Management' },
    'airtable.com': { name: 'Airtable', category: 'Database' },
    'canva.com': { name: 'Canva', category: 'Design' },
    'miro.com': { name: 'Miro', category: 'Collaboration' },
    'loom.com': { name: 'Loom', category: 'Communication' },
    'calendly.com': { name: 'Calendly', category: 'Scheduling' },
    'openai.com': { name: 'OpenAI', category: 'AI' },
    'anthropic.com': { name: 'Anthropic', category: 'AI' },
};

// ============================================================================
// LLM EXTRACTION PROMPT
// ============================================================================

const EXTRACTION_PROMPT = `You are a data extraction assistant. Extract subscription information from the following email.

IMPORTANT RULES:
1. Only extract information that is EXPLICITLY stated in the email
2. If a field is not mentioned, return null for that field
3. Do NOT guess or infer values that aren't clearly stated
4. For dates, always use YYYY-MM-DD format
5. For amounts, extract the numeric value only (no currency symbols)
6. For vendor_name, extract the actual product/company name, NOT the sender's display name

Email Subject: {subject}

Email Body:
{body}

Sender: {sender}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "vendor_name": "string - the SaaS product name",
  "vendor_domain": "string or null - vendor website domain if mentioned",
  "plan": "string or null - subscription plan name (e.g., Team, Pro, Enterprise)",
  "seats": "number or null - number of seats/licenses if mentioned",
  "billing_cycle": "monthly or yearly or null",
  "renewal_date": "YYYY-MM-DD or null",
  "amount": "number or null - subscription amount without currency symbol",
  "currency": "string or null - currency code like USD, EUR",
  "confidence": "low or medium or high - based on how much information was found"
}`;

// ============================================================================
// LLM PROVIDERS
// ============================================================================

async function callGemini(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    // Use gemini-2.5-flash-lite model (free tier with good limits)
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    console.log('[Gemini] Calling API with model:', model);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.1, // Low temperature for structured extraction
                maxOutputTokens: 1024,
            },
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error('[Gemini] API Error:', response.status, response.statusText, errorBody);
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('[Gemini] Response received, length:', text.length);
    return text;
}

async function callOpenAI(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 1024,
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
}

// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================

export async function extractSubscriptionFromEmail(
    subject: string | null,
    body: string | null,
    sender: string | null
): Promise<ExtractedSubscription | null> {
    // Need at least subject or body to extract anything
    if (!subject && !body) {
        console.log('[Extraction] No content to extract from');
        return null;
    }

    console.log('[Extraction] Starting extraction for:', {
        subject: subject?.substring(0, 80),
        bodyLength: body?.length || 0,
        sender: sender?.substring(0, 50)
    });

    const prompt = EXTRACTION_PROMPT
        .replace('{subject}', subject || '(no subject)')
        .replace('{body}', body || '(no body)')
        .replace('{sender}', sender || '(unknown sender)');

    const provider = process.env.LLM_PROVIDER || 'gemini';
    console.log('[Extraction] Using LLM provider:', provider);

    try {
        let response: string;

        switch (provider) {
            case 'openai':
                response = await callOpenAI(prompt);
                break;
            case 'gemini':
            default:
                response = await callGemini(prompt);
                break;
        }

        console.log('[Extraction] Raw LLM response:', response.substring(0, 500));

        // Parse JSON from response (handle markdown code blocks)
        let jsonStr = response.trim();
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.slice(7);
        }
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.slice(3);
        }
        if (jsonStr.endsWith('```')) {
            jsonStr = jsonStr.slice(0, -3);
        }
        jsonStr = jsonStr.trim();

        const extracted = JSON.parse(jsonStr) as ExtractedSubscription;

        console.log('[Extraction] Parsed result:', JSON.stringify(extracted, null, 2));

        // Validate and convert types
        if (extracted.amount && typeof extracted.amount === 'string') {
            extracted.amount = parseFloat(extracted.amount as string);
        }
        if (extracted.seats && typeof extracted.seats === 'string') {
            extracted.seats = parseInt(extracted.seats as string, 10);
        }

        return extracted;
    } catch (error) {
        console.error('[Extraction] LLM extraction failed:', error);
        console.error('[Extraction] Provider was:', provider);
        console.error('[Extraction] API Key present:', provider === 'gemini' ? !!process.env.GEMINI_API_KEY : !!process.env.OPENAI_API_KEY);

        // FALLBACK: Use regex-based extraction when LLM fails
        console.log('[Extraction] Attempting regex-based fallback extraction...');
        return extractWithRegex(subject, body);
    }
}

/**
 * Fallback regex-based extraction when LLM is unavailable
 * Parses common subscription email patterns
 */
function extractWithRegex(subject: string | null, body: string | null): ExtractedSubscription | null {
    const text = `${subject || ''} ${body || ''}`;

    // Extract vendor name from subject (e.g., "Notion Billing Plan" -> "Notion")
    let vendorName: string | null = null;
    const subjectMatch = subject?.match(/^(\w+)\s+(?:Billing|Subscription|Plan|Renewal)/i);
    if (subjectMatch) {
        vendorName = subjectMatch[1];
    }

    // Extract plan name (e.g., "Plan: Notion Team" or "Plan: Team")
    // Look for pattern like "Plan: Notion Team Seats:" in body, not subject
    let plan: string | null = null;
    const bodyText = body || '';
    const planPatterns = [
        /Plan[:\s]+([A-Za-z0-9]+(?:\s+[A-Za-z0-9]+)?)\s+Seats/i,  // "Plan: Notion Team Seats:"
        /Plan[:\s]+([A-Za-z0-9\s]+?)\s+Billing/i,  // "Plan: Team Billing"
        /your\s+([A-Za-z0-9\s]+?)\s+(?:subscription|plan)/i,  // "your Team Plan subscription"
    ];
    for (const pattern of planPatterns) {
        const match = bodyText.match(pattern);
        if (match) {
            plan = match[1].trim();
            break;
        }
    }

    // Extract seats (e.g., "Seats: 10")
    let seats: number | null = null;
    const seatsMatch = text.match(/Seats[:\s]+(\d+)/i);
    if (seatsMatch) {
        seats = parseInt(seatsMatch[1], 10);
    }

    // Extract billing cycle (e.g., "Billing cycle: Monthly")
    let billingCycle: 'monthly' | 'yearly' | null = null;
    if (/monthly|per month|\/month/i.test(text)) {
        billingCycle = 'monthly';
    } else if (/yearly|annual|per year|\/year/i.test(text)) {
        billingCycle = 'yearly';
    }

    // Extract renewal date (e.g., "Renewal date: February 15, 2026")
    let renewalDate: string | null = null;
    const datePatterns = [
        /Renewal\s+date[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,  // "Renewal date: February 15, 2026"
        /renew(?:s|ing)?\s+(?:on\s+)?([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,  // "renews on February 15, 2026"
        /date[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,  // "date: February 15, 2026"
        /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i,  // Any month date
    ];
    for (const pattern of datePatterns) {
        const match = bodyText.match(pattern);
        if (match) {
            // Get the date string - might be the full match or capture group
            const dateStr = match[1] || match[0];
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) {
                renewalDate = parsed.toISOString().split('T')[0];
                console.log('[Extraction] Found renewal date:', dateStr, '->', renewalDate);
                break;
            }
        }
    }

    // Extract amount (e.g., "$120.00" or "Amount: $120.00 USD")
    let amount: number | null = null;
    let currency: string | null = null;
    const amountPatterns = [
        /Amount[:\s]+\$?([\d,]+\.?\d*)\s*(USD|EUR|GBP|INR)?/i,
        /\$([\d,]+\.?\d*)\s*(USD)?/i,
        /([\d,]+\.?\d*)\s*(USD|EUR|GBP|INR)/i,
    ];
    for (const pattern of amountPatterns) {
        const match = text.match(pattern);
        if (match) {
            amount = parseFloat(match[1].replace(',', ''));
            currency = match[2]?.toUpperCase() || 'USD';
            break;
        }
    }

    // Only return if we found meaningful data
    if (!vendorName && !plan && !seats && !amount && !renewalDate) {
        console.log('[Extraction] Regex fallback found no data');
        return null;
    }

    const result: ExtractedSubscription = {
        vendor_name: vendorName || 'Unknown',
        vendor_domain: null,
        plan,
        seats,
        billing_cycle: billingCycle,
        renewal_date: renewalDate,
        amount,
        currency: currency || 'USD',
        confidence: amount && renewalDate ? 'medium' : 'low',
    };

    console.log('[Extraction] Regex fallback result:', JSON.stringify(result, null, 2));
    return result;
}

// ============================================================================
// VENDOR NORMALIZATION
// ============================================================================

/**
 * Resolve the correct vendor name using multiple sources
 * Priority: LLM extracted name > Known SaaS domains > Subject patterns > Domain fallback
 */
export function resolveVendorName(
    llmVendorName: string | null,
    senderDomain: string | null,
    subject: string | null
): { name: string; category: string | null } {
    // Priority 1: LLM extracted vendor name
    if (llmVendorName && llmVendorName.trim().length > 0) {
        // Check if we have category info for this vendor
        const normalizedName = llmVendorName.toLowerCase();
        for (const [, vendor] of Object.entries(KNOWN_SAAS_DOMAINS)) {
            if (vendor.name.toLowerCase() === normalizedName) {
                return { name: vendor.name, category: vendor.category };
            }
        }
        return { name: llmVendorName, category: null };
    }

    // Priority 2: Known SaaS domains lookup
    if (senderDomain) {
        const known = KNOWN_SAAS_DOMAINS[senderDomain];
        if (known) {
            return { name: known.name, category: known.category };
        }
    }

    // Priority 3: Check subject against SAAS_PATTERNS
    if (subject) {
        const detected = detectSaaSVendor(subject);
        if (detected) {
            return { name: detected.name, category: detected.category };
        }
    }

    // Fallback: Domain-based name
    if (senderDomain) {
        const domainPart = senderDomain.split('.')[0];
        const name = domainPart.charAt(0).toUpperCase() + domainPart.slice(1);
        return { name, category: null };
    }

    return { name: 'Unknown', category: null };
}

/**
 * Get category for a known vendor domain
 */
export function getVendorCategory(domain: string | null): string | null {
    if (!domain) return null;
    return KNOWN_SAAS_DOMAINS[domain]?.category || null;
}
