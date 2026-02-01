import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * POST /api/admin/reset-data
 * Clears all subscription, vendor, and gmail message data while preserving user accounts
 */
export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;

        console.log('[Admin] Starting data reset for user:', userId);

        // Delete in order of dependencies
        // 1. Delete negotiations (depends on subscriptions and vendors)
        const deletedNegotiations = await prisma.negotiation.deleteMany({
            where: { userId },
        });
        console.log('[Admin] Deleted negotiations:', deletedNegotiations.count);

        // 2. Delete subscriptions (depends on vendors)
        const deletedSubscriptions = await prisma.subscription.deleteMany({
            where: { userId },
        });
        console.log('[Admin] Deleted subscriptions:', deletedSubscriptions.count);

        // 3. Delete gmail messages
        const deletedGmailMessages = await prisma.gmailMessage.deleteMany({
            where: { userId },
        });
        console.log('[Admin] Deleted gmail messages:', deletedGmailMessages.count);

        // 4. Delete transactions
        const deletedTransactions = await prisma.transaction.deleteMany({
            where: { userId },
        });
        console.log('[Admin] Deleted transactions:', deletedTransactions.count);

        // 5. Delete orphaned vendors (vendors with no subscriptions)
        const orphanedVendors = await prisma.vendor.deleteMany({
            where: {
                subscriptions: { none: {} },
                negotiations: { none: {} },
            },
        });
        console.log('[Admin] Deleted orphaned vendors:', orphanedVendors.count);

        // 6. Reset OAuth token sync timestamp to allow fresh Gmail scan
        await prisma.oAuthToken.updateMany({
            where: { userId },
            data: { lastGmailSyncAt: null },
        });
        console.log('[Admin] Reset OAuth sync timestamp');

        return NextResponse.json({
            success: true,
            deleted: {
                negotiations: deletedNegotiations.count,
                subscriptions: deletedSubscriptions.count,
                gmailMessages: deletedGmailMessages.count,
                transactions: deletedTransactions.count,
                vendors: orphanedVendors.count,
            },
            message: 'All subscription data cleared. You can now scan your inbox fresh.',
        });
    } catch (error) {
        console.error('[Admin] Reset error:', error);
        return NextResponse.json(
            { error: 'Failed to reset data' },
            { status: 500 }
        );
    }
}
