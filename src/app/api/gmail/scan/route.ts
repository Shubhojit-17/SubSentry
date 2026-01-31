import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { scanInbox } from '@/lib/gmail';

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

        const body = await request.json().catch(() => ({}));
        const maxResults = body.maxResults || 10; // Default to top-10

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
