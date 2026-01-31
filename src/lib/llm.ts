/**
 * LLM Integration for Email Draft Generation
 * Configurable provider: Gemini, OpenAI, or Anthropic
 */

export type LLMProvider = 'gemini' | 'openai' | 'anthropic';
export type NegotiationStrategy = 'seat_reduction' | 'tier_downgrade' | 'annual_prepay';

export interface NegotiationContext {
    vendorName: string;
    currentSpend: number;
    frequency: string;
    estimatedSeats?: number;
    currentTier?: string;
    renewalDate?: Date;
    companyName?: string;
    senderName?: string;
}

export interface GeneratedEmail {
    subject: string;
    body: string;
    strategy: NegotiationStrategy;
}

// Prompt templates for each strategy
const PROMPT_TEMPLATES: Record<NegotiationStrategy, string> = {
    seat_reduction: `You are a professional procurement specialist helping a finance team reduce SaaS costs.

Draft a polite, professional email to {vendorName} requesting a seat reduction.

Context:
- Current spend: {currentSpend}/month
- Estimated seats: {estimatedSeats}
- Company: {companyName}
- Renewal date: {renewalDate}

Requirements:
1. Be professional and collaborative in tone
2. Reference that a utilization review shows underutilization
3. Request a seat reduction to match actual usage
4. Ask about options for reducing the license count
5. Do NOT make any legal commitments or promises
6. Keep the email concise (under 200 words)
7. Do not include placeholders - use reasonable assumptions

Generate a subject line and email body. Format as:
SUBJECT: [subject line]
BODY:
[email body]`,

    tier_downgrade: `You are a professional procurement specialist helping a finance team reduce SaaS costs.

Draft a polite, professional email to {vendorName} requesting a tier downgrade evaluation.

Context:
- Current spend: {currentSpend}/month
- Current tier: {currentTier}
- Company: {companyName}
- Renewal date: {renewalDate}

Requirements:
1. Be professional and collaborative in tone
2. Reference that feature utilization review suggests current tier may be more than needed
3. Ask about options for a more cost-effective tier
4. Request a meeting to discuss options
5. Do NOT make any legal commitments or promises
6. Keep the email concise (under 200 words)
7. Do not include placeholders - use reasonable assumptions

Generate a subject line and email body. Format as:
SUBJECT: [subject line]
BODY:
[email body]`,

    annual_prepay: `You are a professional procurement specialist helping a finance team reduce SaaS costs.

Draft a polite, professional email to {vendorName} offering annual prepayment in exchange for a discount.

Context:
- Current spend: {currentSpend}/month
- Company: {companyName}
- Renewal date: {renewalDate}

Requirements:
1. Be professional and collaborative in tone
2. Mention that budget availability allows for upfront annual payment
3. Request their best discount for annual commitment
4. Ask about multi-year discount options as well
5. Do NOT make any legal commitments or promises
6. Keep the email concise (under 200 words)
7. Do not include placeholders - use reasonable assumptions

Generate a subject line and email body. Format as:
SUBJECT: [subject line]
BODY:
[email body]`,
};

/**
 * Build the prompt with context
 */
function buildPrompt(strategy: NegotiationStrategy, context: NegotiationContext): string {
    let prompt = PROMPT_TEMPLATES[strategy];

    prompt = prompt.replace(/{vendorName}/g, context.vendorName);
    prompt = prompt.replace(/{currentSpend}/g, `$${context.currentSpend.toFixed(2)}`);
    prompt = prompt.replace(/{estimatedSeats}/g, context.estimatedSeats?.toString() || '10-15');
    prompt = prompt.replace(/{currentTier}/g, context.currentTier || 'Professional/Business');
    prompt = prompt.replace(/{companyName}/g, context.companyName || 'our company');
    prompt = prompt.replace(/{renewalDate}/g, context.renewalDate?.toLocaleDateString() || 'upcoming');

    return prompt;
}

/**
 * Parse LLM response into subject and body
 */
function parseEmailResponse(response: string): { subject: string; body: string } {
    // Use [\s\S] instead of . with s flag for compatibility
    const subjectMatch = response.match(/SUBJECT:\s*(.+?)(?:\n|BODY:)/i);
    const bodyMatch = response.match(/BODY:\s*([\s\S]+)$/i);

    return {
        subject: subjectMatch?.[1]?.trim() || `Regarding our ${new Date().getFullYear()} subscription renewal`,
        body: bodyMatch?.[1]?.trim() || response,
    };
}

/**
 * Call Gemini API
 */
async function callGemini(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1024,
                },
            }),
        }
    );

    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Call OpenAI API
 */
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
            temperature: 0.7,
            max_tokens: 1024,
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
}

/**
 * Call Anthropic API
 */
async function callAnthropic(prompt: string): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
        }),
    });

    if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
}

/**
 * Generate negotiation email using configured LLM provider
 */
export async function generateNegotiationEmail(
    strategy: NegotiationStrategy,
    context: NegotiationContext
): Promise<GeneratedEmail> {
    const provider = (process.env.LLM_PROVIDER || 'gemini') as LLMProvider;
    const prompt = buildPrompt(strategy, context);

    let response: string;

    try {
        switch (provider) {
            case 'openai':
                response = await callOpenAI(prompt);
                break;
            case 'anthropic':
                response = await callAnthropic(prompt);
                break;
            case 'gemini':
            default:
                response = await callGemini(prompt);
                break;
        }
    } catch (error) {
        // Fallback to a template if LLM fails
        console.error('LLM call failed:', error);
        return generateFallbackEmail(strategy, context);
    }

    const { subject, body } = parseEmailResponse(response);

    return {
        subject,
        body,
        strategy,
    };
}

/**
 * Fallback email template if LLM is unavailable
 */
function generateFallbackEmail(
    strategy: NegotiationStrategy,
    context: NegotiationContext
): GeneratedEmail {
    const templates: Record<NegotiationStrategy, { subject: string; body: string }> = {
        seat_reduction: {
            subject: `License Review Request - ${context.vendorName}`,
            body: `Dear ${context.vendorName} Team,

I hope this email finds you well. As we approach our upcoming renewal, we've been reviewing our software utilization and would like to discuss our current license count.

Our internal review suggests we may have more seats than our current active usage requires. We'd appreciate the opportunity to discuss options for right-sizing our subscription to better match our actual needs.

Could we schedule a brief call to review our options? We value our partnership with ${context.vendorName} and want to ensure we're on the right plan for our organization.

Thank you for your time.

Best regards`,
        },
        tier_downgrade: {
            subject: `Subscription Tier Review - ${context.vendorName}`,
            body: `Dear ${context.vendorName} Team,

I hope this email finds you well. As we approach our renewal period, we've been evaluating our feature usage and would like to explore our subscription options.

After reviewing our team's usage patterns, we're interested in understanding whether a different tier might better align with our current needs while still meeting our requirements.

Would it be possible to schedule a call to discuss the available options? We'd like to understand the differences and find the best fit for our organization.

Thank you for your assistance.

Best regards`,
        },
        annual_prepay: {
            subject: `Annual Prepayment Inquiry - ${context.vendorName}`,
            body: `Dear ${context.vendorName} Team,

I hope this email finds you well. As we plan our budget for the upcoming year, we're exploring opportunities to optimize our software spend.

We're interested in discussing annual prepayment options for our ${context.vendorName} subscription. If we commit to an annual payment upfront, would there be any discount available?

Additionally, we'd be interested in hearing about any multi-year commitment options that might offer additional savings.

Please let us know your availability for a brief call to discuss these options.

Best regards`,
        },
    };

    return {
        ...templates[strategy],
        strategy,
    };
}

/**
 * Get strategy display name
 */
export function getStrategyDisplayName(strategy: NegotiationStrategy): string {
    const names: Record<NegotiationStrategy, string> = {
        seat_reduction: 'Seat Reduction',
        tier_downgrade: 'Tier Downgrade',
        annual_prepay: 'Annual Prepay Discount',
    };
    return names[strategy];
}

/**
 * Get strategy description
 */
export function getStrategyDescription(strategy: NegotiationStrategy): string {
    const descriptions: Record<NegotiationStrategy, string> = {
        seat_reduction: 'Request fewer licenses based on actual utilization',
        tier_downgrade: 'Explore lower-cost tier options that match your needs',
        annual_prepay: 'Offer annual payment upfront in exchange for a discount',
    };
    return descriptions[strategy];
}
