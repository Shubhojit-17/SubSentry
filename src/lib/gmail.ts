/**
 * Gmail API Integration with Top-10 Scan
 * Fetches latest 10 emails, detects subscriptions, creates proper records
 */

import { google, gmail_v1 } from 'googleapis';
import prisma from './prisma';
import { extractSubscriptionFromEmail, resolveVendorName, getVendorCategory } from './subscription-extraction';

// ============================================================================
// LOGGING
// ============================================================================
const LOG_PREFIX = '[Gmail]';

function log(message: string, data?: Record<string, unknown>) {
    const timestamp = new Date().toISOString();
    if (data) {
        console.log(`${timestamp} ${LOG_PREFIX} ${message}`, JSON.stringify(data, null, 2));
    } else {
        console.log(`${timestamp} ${LOG_PREFIX} ${message}`);
    }
}

function logError(message: string, error: unknown) {
    const timestamp = new Date().toISOString();
    console.error(`${timestamp} ${LOG_PREFIX} ERROR: ${message}`, error);
}

// ============================================================================
// TYPES
// ============================================================================
export interface GmailClient {
    gmail: gmail_v1.Gmail;
    userId: string;
}

export interface GmailSendOptions {
    to: string;
    subject: string;
    body: string;
    from?: string;
}

export interface GmailSendResult {
    success: boolean;
    messageId?: string;
    threadId?: string;
    error?: string;
}

export interface GmailScanResult {
    messagesScanned: number;
    newMessages: number;
    subscriptionsCreated: number;
    vendorsCreated: number;
    skippedCount: number;
}

// ============================================================================
// SUBSCRIPTION DETECTION KEYWORDS
// ============================================================================
const SUBSCRIPTION_KEYWORDS = [
    'renewal',
    'auto-renew',
    'auto renew',
    'subscription',
    'invoice',
    'payment',
    'billing',
    'upcoming charge',
    'annual renewal',
    'monthly renewal',
    'your plan',
    'payment due',
    'receipt',
    'charge',
];

// Known SaaS domains for better vendor matching
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
    'cloud.google.com': { name: 'Google Cloud', category: 'Cloud Infrastructure' },
    'azure.microsoft.com': { name: 'Microsoft Azure', category: 'Cloud Infrastructure' },
    'vercel.com': { name: 'Vercel', category: 'DevOps' },
    'heroku.com': { name: 'Heroku', category: 'Cloud Infrastructure' },
    'mongodb.com': { name: 'MongoDB', category: 'Database' },
    'datadog.com': { name: 'Datadog', category: 'Monitoring' },
    'newrelic.com': { name: 'New Relic', category: 'Monitoring' },
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
};

const AMOUNT_REGEX = /\$[\d,]+(?:\.\d{2})?|\b\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:USD|dollars?)/gi;

const DATE_PATTERNS = [
    /(?:renew(?:al|s)?|expires?|due|billing)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})[\s]*(?:renew|expire|due)/gi,
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s*\d{4}/gi,
];

// ============================================================================
// OAUTH & CLIENT
// ============================================================================
export async function getGmailClient(userId: string): Promise<GmailClient | null> {
    log(`Getting Gmail client for user: ${userId}`);

    const token = await prisma.oAuthToken.findUnique({
        where: { userId_provider: { userId, provider: 'google' } },
    });

    if (!token) {
        log(`No OAuth token found for user: ${userId}`);
        return null;
    }

    log(`Token found`, {
        hasAccessToken: !!token.accessToken,
        hasRefreshToken: !!token.refreshToken,
        expiresAt: token.expiresAt.toISOString(),
        isExpired: token.expiresAt <= new Date()
    });

    if (token.expiresAt <= new Date()) {
        log(`Token expired, refreshing...`);
        const refreshed = await refreshAccessToken(userId, token.refreshToken);
        if (!refreshed) {
            logError(`Failed to refresh token`, { userId });
            return null;
        }
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    const freshToken = await prisma.oAuthToken.findUnique({
        where: { userId_provider: { userId, provider: 'google' } },
    });

    if (!freshToken) return null;

    oauth2Client.setCredentials({
        access_token: freshToken.accessToken,
        refresh_token: freshToken.refreshToken,
    });

    return { gmail: google.gmail({ version: 'v1', auth: oauth2Client }), userId };
}

async function refreshAccessToken(userId: string, refreshToken: string | null): Promise<boolean> {
    if (!refreshToken) return false;

    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const { credentials } = await oauth2Client.refreshAccessToken();

        await prisma.oAuthToken.update({
            where: { userId_provider: { userId, provider: 'google' } },
            data: {
                accessToken: credentials.access_token!,
                expiresAt: new Date(credentials.expiry_date!),
            },
        });

        return true;
    } catch (error) {
        logError('Failed to refresh access token', error);
        return false;
    }
}

export async function hasGmailConnected(userId: string): Promise<boolean> {
    const token = await prisma.oAuthToken.findUnique({
        where: { userId_provider: { userId, provider: 'google' } },
    });
    return !!token;
}

// ============================================================================
// TOP-10 SCAN
// ============================================================================

/**
 * Scan the latest N emails from inbox (top-10 approach)
 * Does NOT rely on page load or historyId - always checks latest emails
 */
export async function scanInbox(userId: string, maxResults: number = 10): Promise<GmailScanResult> {
    log(`=== Starting TOP-${maxResults} inbox scan for user: ${userId} ===`);

    const client = await getGmailClient(userId);
    if (!client) {
        log(`Cannot scan inbox - no Gmail client`);
        return { messagesScanned: 0, newMessages: 0, subscriptionsCreated: 0, vendorsCreated: 0, skippedCount: 0 };
    }

    try {
        // Fetch latest N messages from inbox (no keyword filter)
        log(`Fetching latest ${maxResults} messages from inbox...`);
        const listResponse = await client.gmail.users.messages.list({
            userId: 'me',
            maxResults,
            labelIds: ['INBOX'],
        });

        const messageRefs = listResponse.data.messages || [];
        log(`Gmail API returned ${messageRefs.length} message references`);

        let newMessages = 0;
        let subscriptionsCreated = 0;
        let vendorsCreated = 0;
        let skippedCount = 0;

        for (const msgRef of messageRefs) {
            if (!msgRef.id) continue;

            // Check if already processed
            const existing = await prisma.gmailMessage.findUnique({
                where: { gmailId: msgRef.id },
            });

            if (existing) {
                log(`Skipping already processed: ${msgRef.id}`);
                skippedCount++;
                continue;
            }

            // Get full message
            const result = await processNewMessage(client, userId, msgRef.id);
            newMessages++;

            if (result.subscriptionCreated) subscriptionsCreated++;
            if (result.vendorCreated) vendorsCreated++;
        }

        // Update last scan timestamp
        await prisma.oAuthToken.update({
            where: { userId_provider: { userId, provider: 'google' } },
            data: { lastGmailSyncAt: new Date() },
        });

        log(`=== Scan complete ===`, {
            messagesScanned: messageRefs.length,
            newMessages,
            subscriptionsCreated,
            vendorsCreated,
            skippedCount,
        });

        return {
            messagesScanned: messageRefs.length,
            newMessages,
            subscriptionsCreated,
            vendorsCreated,
            skippedCount,
        };
    } catch (error) {
        logError('Gmail scan error', error);
        return { messagesScanned: 0, newMessages: 0, subscriptionsCreated: 0, vendorsCreated: 0, skippedCount: 0 };
    }
}

/**
 * Process a single message and detect subscriptions
 * Stage 1: Fetch full email content and store
 * Stage 2: Run LLM extraction for subscription data
 */
async function processNewMessage(
    client: GmailClient,
    userId: string,
    messageId: string
): Promise<{ subscriptionCreated: boolean; vendorCreated: boolean }> {
    try {
        log(`Processing message: ${messageId}`);

        // Stage 1: Fetch FULL message (including body)
        const fullMessage = await client.gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full',
        });

        const headers = fullMessage.data.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || null;
        const from = headers.find(h => h.name === 'From')?.value || null;
        const dateStr = headers.find(h => h.name === 'Date')?.value;
        const date = dateStr ? new Date(dateStr) : null;
        const snippet = fullMessage.data.snippet || null;

        // Extract full email body
        const body = extractEmailBody(fullMessage.data.payload);

        // Extract sender domain
        let senderDomain: string | null = null;
        if (from) {
            const emailMatch = from.match(/@([a-zA-Z0-9.-]+)/);
            senderDomain = emailMatch ? emailMatch[1].toLowerCase() : null;
        }

        const hasAttachment = fullMessage.data.payload?.parts?.some(
            p => p.filename && p.filename.length > 0
        ) || false;

        // Detect if subscription-related
        const textToCheck = `${subject || ''} ${snippet || ''} ${body || ''}`.toLowerCase();
        const matchedKeywords = SUBSCRIPTION_KEYWORDS.filter(k => textToCheck.includes(k.toLowerCase()));
        const isSubscription = matchedKeywords.length > 0;

        log(`Message analysis`, {
            id: messageId,
            subject: subject?.substring(0, 60),
            from,
            senderDomain,
            isSubscription,
            matchedKeywords,
            bodyLength: body?.length || 0,
        });

        // Stage 1: Store in GmailMessage table with full body
        await prisma.gmailMessage.create({
            data: {
                userId,
                gmailId: messageId,
                threadId: fullMessage.data.threadId,
                subject,
                sender: from,
                senderDomain,
                snippet,
                body, // NEW: Store full body for LLM extraction
                date,
                hasAttachment,
                isRenewal: isSubscription,
                isProcessed: false, // Will be set to true after LLM extraction
            },
        });

        let subscriptionCreated = false;
        let vendorCreated = false;

        // Stage 2: If subscription detected, run LLM extraction
        if (isSubscription && senderDomain) {
            const result = await createSubscriptionFromEmail({
                userId,
                messageId,
                senderDomain,
                from,
                subject,
                body,
            });
            subscriptionCreated = result.subscriptionCreated;
            vendorCreated = result.vendorCreated;

            // Mark as processed
            await prisma.gmailMessage.update({
                where: { gmailId: messageId },
                data: { isProcessed: true },
            });
        }

        return { subscriptionCreated, vendorCreated };
    } catch (error) {
        logError(`Failed to process message: ${messageId}`, error);
        return { subscriptionCreated: false, vendorCreated: false };
    }
}

/**
 * Extract plain text body from Gmail message payload
 */
function extractEmailBody(payload: gmail_v1.Schema$MessagePart | undefined): string | null {
    if (!payload) return null;

    // Check if this part has a body
    if (payload.body?.data) {
        const mimeType = payload.mimeType || '';
        if (mimeType === 'text/plain' || mimeType === 'text/html') {
            const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
            // Strip HTML tags if HTML content
            if (mimeType === 'text/html') {
                return decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            }
            return decoded;
        }
    }

    // Check nested parts
    if (payload.parts) {
        // Prefer plain text over HTML
        const plainPart = payload.parts.find(p => p.mimeType === 'text/plain');
        if (plainPart) {
            return extractEmailBody(plainPart);
        }
        const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
        if (htmlPart) {
            return extractEmailBody(htmlPart);
        }
        // Recursively check other parts
        for (const part of payload.parts) {
            const body = extractEmailBody(part);
            if (body) return body;
        }
    }

    return null;
}

/**
 * Create or update Subscription and Vendor records from email using LLM extraction
 * This is Stage 2 of the two-stage extraction pipeline
 */
async function createSubscriptionFromEmail(params: {
    userId: string;
    messageId: string;
    senderDomain: string;
    from: string | null;
    subject: string | null;
    body: string | null;
}): Promise<{ subscriptionCreated: boolean; vendorCreated: boolean }> {
    const { userId, messageId, senderDomain, from, subject, body } = params;

    let vendorCreated = false;

    // Stage 2: Run LLM extraction
    log(`Running LLM extraction for message: ${messageId}`);
    const extracted = await extractSubscriptionFromEmail(subject, body, from);

    // Resolve vendor name using LLM extraction result (NOT sender display name)
    const { name: vendorName, category: extractedCategory } = resolveVendorName(
        extracted?.vendor_name || null,
        senderDomain,
        subject
    );

    log(`Resolved vendor`, {
        vendorName,
        llmVendorName: extracted?.vendor_name,
        senderDomain,
        category: extractedCategory
    });

    // Generic email domains that shouldn't be used for vendor matching
    const GENERIC_EMAIL_DOMAINS = [
        'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
        'aol.com', 'icloud.com', 'mail.com', 'protonmail.com'
    ];
    const isGenericDomain = GENERIC_EMAIL_DOMAINS.includes(senderDomain?.toLowerCase() || '');

    // Find or create vendor - prioritize by extracted name, only use domain for company domains
    let vendor = await prisma.vendor.findFirst({
        where: {
            // Match by normalized vendor name (primary)
            normalizedName: vendorName.toLowerCase().replace(/\s+/g, ''),
        },
    });

    // If not found by name and we have a real company domain, try matching by domain
    if (!vendor && senderDomain && !isGenericDomain) {
        vendor = await prisma.vendor.findFirst({
            where: { domain: senderDomain },
        });
    }

    if (!vendor) {
        const category = extractedCategory || getVendorCategory(senderDomain) || 'Uncategorized';

        // For generic domains, use the vendor's actual domain if extracted, otherwise use vendor name
        const vendorDomain = extracted?.vendor_domain ||
            (isGenericDomain ? `${vendorName.toLowerCase().replace(/\s+/g, '')}.com` : senderDomain);

        vendor = await prisma.vendor.create({
            data: {
                name: vendorName,
                normalizedName: vendorName.toLowerCase().replace(/\s+/g, ''),
                domain: vendorDomain,
                category,
                isSaaS: true,
            },
        });

        log(`Created new vendor`, { id: vendor.id, name: vendor.name, domain: vendor.domain });
        vendorCreated = true;
    } else {
        log(`Found existing vendor`, { id: vendor.id, name: vendor.name });
    }

    // Parse renewal date from LLM extraction
    let renewalDate: Date | null = null;
    if (extracted?.renewal_date) {
        const parsed = new Date(extracted.renewal_date);
        if (!isNaN(parsed.getTime())) {
            renewalDate = parsed;
        }
    }

    // Get values from LLM extraction
    const amount = extracted?.amount || null;
    const billingCycle = extracted?.billing_cycle || null;
    const plan = extracted?.plan || null;
    const seats = extracted?.seats || null;
    const currency = extracted?.currency || 'USD';
    const confidence = extracted?.confidence || 'low';

    log(`Extracted subscription data`, {
        vendorName: vendor.name,
        amount,
        billingCycle,
        plan,
        seats,
        renewalDate: renewalDate?.toISOString(),
        confidence,
    });

    // VALIDATION: Skip creating subscription if no meaningful data extracted
    // At minimum, we need amount OR renewalDate OR plan to consider it a valid subscription
    if (!amount && !renewalDate && !plan) {
        log(`Skipping subscription creation - no meaningful data extracted`, {
            vendorName: vendor.name,
            messageId,
        });
        return { subscriptionCreated: false, vendorCreated };
    }

    // Create or update subscription with LLM-extracted data
    const subscription = await prisma.subscription.upsert({
        where: {
            userId_vendorId_source: {
                userId,
                vendorId: vendor.id,
                source: 'gmail',
            },
        },
        update: {
            lastDetectedAt: new Date(),
            renewalDate: renewalDate || undefined,
            amount: amount || undefined,
            billingCycle: billingCycle || undefined,
            plan: plan || undefined,
            seats: seats || undefined,
            currency,
            confidenceScore: confidence,
            gmailMessageId: messageId,
        },
        create: {
            userId,
            vendorId: vendor.id,
            source: 'gmail',
            renewalDate,
            amount,
            billingCycle,
            plan,
            seats,
            currency,
            confidenceScore: confidence,
            gmailMessageId: messageId,
        },
    });

    log(`Created/updated subscription`, {
        id: subscription.id,
        vendorId: vendor.id,
        vendorName: vendor.name,
        amount,
        plan,
        seats,
        renewalDate: renewalDate?.toISOString(),
        confidence,
    });

    return { subscriptionCreated: true, vendorCreated };
}

// ============================================================================
// SEND EMAIL
// ============================================================================
export async function sendGmailEmail(userId: string, options: GmailSendOptions): Promise<GmailSendResult> {
    try {
        log(`Sending email`, { to: options.to, subject: options.subject });

        const client = await getGmailClient(userId);
        if (!client) {
            return { success: false, error: 'Gmail not connected' };
        }

        const profile = await client.gmail.users.getProfile({ userId: 'me' });
        const fromEmail = options.from || profile.data.emailAddress;

        const message = [
            `From: ${fromEmail}`,
            `To: ${options.to}`,
            `Subject: ${options.subject}`,
            'Content-Type: text/html; charset=utf-8',
            '',
            options.body.replace(/\n/g, '<br>'),
        ].join('\r\n');

        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const response = await client.gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: encodedMessage },
        });

        log(`Email sent`, { messageId: response.data.id });
        return {
            success: true,
            messageId: response.data.id || undefined,
            threadId: response.data.threadId || undefined,
        };
    } catch (error) {
        logError('Gmail send error', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to send email',
        };
    }
}

// ============================================================================
// STATUS
// ============================================================================
export async function getGmailStatus(userId: string): Promise<{
    connected: boolean;
    email?: string;
    lastScan?: Date;
    tokenExpiry?: Date;
}> {
    const token = await prisma.oAuthToken.findUnique({
        where: { userId_provider: { userId, provider: 'google' } },
    });

    if (!token) return { connected: false };

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
    });

    return {
        connected: true,
        email: user?.email,
        lastScan: token.lastGmailSyncAt || undefined,
        tokenExpiry: token.expiresAt,
    };
}
