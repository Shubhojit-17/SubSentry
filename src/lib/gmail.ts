/**
 * Gmail API Integration with Top-10 Scan
 * Fetches latest 10 emails, detects subscriptions, creates proper records
 */

import { google, gmail_v1 } from 'googleapis';
import prisma from './prisma';

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
 */
async function processNewMessage(
    client: GmailClient,
    userId: string,
    messageId: string
): Promise<{ subscriptionCreated: boolean; vendorCreated: boolean }> {
    try {
        log(`Processing message: ${messageId}`);

        const fullMessage = await client.gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'metadata',
            metadataHeaders: ['Subject', 'From', 'Date'],
        });

        const headers = fullMessage.data.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || null;
        const from = headers.find(h => h.name === 'From')?.value || null;
        const dateStr = headers.find(h => h.name === 'Date')?.value;
        const date = dateStr ? new Date(dateStr) : null;
        const snippet = fullMessage.data.snippet || null;

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
        const textToCheck = `${subject || ''} ${snippet || ''}`.toLowerCase();
        const matchedKeywords = SUBSCRIPTION_KEYWORDS.filter(k => textToCheck.includes(k.toLowerCase()));
        const isSubscription = matchedKeywords.length > 0;

        log(`Message analysis`, {
            id: messageId,
            subject: subject?.substring(0, 60),
            from,
            senderDomain,
            isSubscription,
            matchedKeywords,
        });

        // Store in GmailMessage table
        await prisma.gmailMessage.create({
            data: {
                userId,
                gmailId: messageId,
                threadId: fullMessage.data.threadId,
                subject,
                sender: from,
                senderDomain,
                snippet,
                date,
                hasAttachment,
                isRenewal: isSubscription,
            },
        });

        let subscriptionCreated = false;
        let vendorCreated = false;

        // If subscription detected, create records
        if (isSubscription && senderDomain) {
            const result = await createSubscriptionFromEmail({
                userId,
                messageId,
                senderDomain,
                from,
                subject,
                snippet,
                textToCheck,
            });
            subscriptionCreated = result.subscriptionCreated;
            vendorCreated = result.vendorCreated;
        }

        return { subscriptionCreated, vendorCreated };
    } catch (error) {
        logError(`Failed to process message: ${messageId}`, error);
        return { subscriptionCreated: false, vendorCreated: false };
    }
}

/**
 * Create or update Subscription and Vendor records from email
 */
async function createSubscriptionFromEmail(params: {
    userId: string;
    messageId: string;
    senderDomain: string;
    from: string | null;
    subject: string | null;
    snippet: string | null;
    textToCheck: string;
}): Promise<{ subscriptionCreated: boolean; vendorCreated: boolean }> {
    const { userId, messageId, senderDomain, from, subject, snippet, textToCheck } = params;

    let vendorCreated = false;

    // Resolve or create vendor
    let vendor = await prisma.vendor.findFirst({
        where: {
            OR: [
                { domain: senderDomain },
                { normalizedName: { contains: senderDomain.split('.')[0] } },
            ],
        },
    });

    if (!vendor) {
        // Check known SaaS domains
        const knownVendor = KNOWN_SAAS_DOMAINS[senderDomain];

        // Extract vendor name from email "From" field
        let vendorName = senderDomain.split('.')[0];
        vendorName = vendorName.charAt(0).toUpperCase() + vendorName.slice(1);

        if (from) {
            const nameMatch = from.match(/^([^<]+)/);
            if (nameMatch) {
                vendorName = nameMatch[1].trim().replace(/"/g, '');
            }
        }

        vendor = await prisma.vendor.create({
            data: {
                name: knownVendor?.name || vendorName,
                normalizedName: (knownVendor?.name || vendorName).toLowerCase().replace(/\s+/g, ''),
                domain: senderDomain,
                category: knownVendor?.category || 'Uncategorized',
                isSaaS: true,
            },
        });

        log(`Created new vendor`, { id: vendor.id, name: vendor.name, domain: vendor.domain });
        vendorCreated = true;
    }

    // Extract amount from text
    let extractedAmount: number | null = null;
    const allText = `${subject || ''} ${snippet || ''}`;
    const amounts = allText.match(AMOUNT_REGEX);
    if (amounts && amounts.length > 0) {
        const parsed = parseFloat(amounts[0].replace(/[$,]/g, ''));
        if (!isNaN(parsed)) {
            extractedAmount = parsed;
        }
    }

    // Extract renewal date
    let renewalDate: Date | null = null;
    for (const pattern of DATE_PATTERNS) {
        const match = textToCheck.match(pattern);
        if (match) {
            const parsed = new Date(match[0]);
            if (!isNaN(parsed.getTime()) && parsed > new Date()) {
                renewalDate = parsed;
                break;
            }
        }
    }

    // Determine billing cycle
    let billingCycle: string | null = null;
    if (textToCheck.includes('annual') || textToCheck.includes('yearly')) {
        billingCycle = 'yearly';
    } else if (textToCheck.includes('monthly')) {
        billingCycle = 'monthly';
    } else if (textToCheck.includes('quarterly')) {
        billingCycle = 'quarterly';
    }

    // Determine confidence
    let confidence = 'low';
    if (extractedAmount && renewalDate) {
        confidence = 'high';
    } else if (extractedAmount || renewalDate) {
        confidence = 'medium';
    }

    // Create or update subscription
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
            amount: extractedAmount || undefined,
            billingCycle: billingCycle || undefined,
            confidenceScore: confidence,
            gmailMessageId: messageId,
        },
        create: {
            userId,
            vendorId: vendor.id,
            source: 'gmail',
            renewalDate,
            amount: extractedAmount,
            billingCycle,
            confidenceScore: confidence,
            gmailMessageId: messageId,
        },
    });

    log(`Created/updated subscription`, {
        id: subscription.id,
        vendorId: vendor.id,
        vendorName: vendor.name,
        amount: extractedAmount,
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
