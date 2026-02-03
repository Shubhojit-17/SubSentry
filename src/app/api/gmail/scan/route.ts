import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { scanInbox } from '@/lib/gmail';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { validateBody, gmailScanSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
    console.log('[Gmail Scan] POST request received');

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            console.log('[Gmail Scan] Unauthorized - no session');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;
        console.log('[Gmail Scan] User ID:', userId);

        // Rate limiting
        const rateLimit = checkRateLimit(userId, 'gmailScan');
        if (!rateLimit.allowed) {
            console.log('[Gmail Scan] Rate limited');
            return NextResponse.json(
                { error: 'Too many requests', retryAfter: Math.ceil(rateLimit.resetIn / 1000) },
                { status: 429, headers: rateLimitHeaders(rateLimit) }
            );
        }

        // Validate request body
        const body = await request.json().catch(() => ({}));
        const validation = validateBody(body, gmailScanSchema);
        const maxResults = validation.success ? validation.data.maxResults : 10;

        console.log('[Gmail Scan] Starting TOP-N scan with maxResults:', maxResults);
        const result = await scanInbox(userId, maxResults);

        const response = {
            success: true,
            messagesScanned: result.messagesScanned,
            newMessages: result.newMessages,
            subscriptionsCreated: result.subscriptionsCreated,
            vendorsCreated: result.vendorsCreated,
            skippedCount: result.skippedCount,
            message: result.newMessages === 0
                ? `Checked ${result.messagesScanned} emails, no new messages to process`
                : `Processed ${result.newMessages} new emails, created ${result.subscriptionsCreated} subscriptions${result.vendorsCreated > 0 ? ` and ${result.vendorsCreated} new vendors` : ''}`,
        };

        console.log('[Gmail Scan] Complete:', response);
        return NextResponse.json(response);
    } catch (error) {
        console.error('[Gmail Scan] Error:', error);
        return NextResponse.json(
            { error: 'Failed to scan inbox', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
