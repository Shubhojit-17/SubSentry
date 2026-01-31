import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getGmailStatus } from '@/lib/gmail';

export async function GET() {
    console.log('[Dashboard] GET request received');

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            console.log('[Dashboard] Unauthorized - no session');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;
        console.log('[Dashboard] Loading data for user:', userId);

        // Get unique vendors with subscriptions for this user
        const vendorsWithSubscriptions = await prisma.vendor.findMany({
            where: {
                subscriptions: {
                    some: { userId },
                },
            },
            include: {
                subscriptions: {
                    where: { userId },
                },
            },
        });

        const vendorCount = vendorsWithSubscriptions.length;
        const saasCount = vendorsWithSubscriptions.filter(v => v.isSaaS).length;

        // Get total subscriptions
        const subscriptions = await prisma.subscription.findMany({
            where: { userId },
            include: { vendor: true },
        });

        const totalSubscriptions = subscriptions.length;
        const gmailSubscriptions = subscriptions.filter(s => s.source === 'gmail').length;
        const csvSubscriptions = subscriptions.filter(s => s.source === 'csv').length;

        // Calculate upcoming renewals (within 30 days)
        const now = new Date();
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const upcomingRenewals = subscriptions.filter(s =>
            s.renewalDate &&
            s.renewalDate >= now &&
            s.renewalDate <= thirtyDaysFromNow
        );

        // Get total transactions (from CSV)
        const transactionCount = await prisma.transaction.count({
            where: { userId },
        });

        // Calculate total spend from subscriptions
        const totalSpend = subscriptions.reduce((sum, s) => {
            const amount = s.amount ? parseFloat(s.amount.toString()) : 0;
            return sum + amount;
        }, 0);

        // Get negotiations stats
        const negotiations = await prisma.negotiation.findMany({
            where: { userId },
        });

        const negotiationsSent = negotiations.filter(n => n.status === 'sent').length;
        const negotiationsDraft = negotiations.filter(n => n.status === 'draft').length;

        // Get savings
        const savings = await prisma.saving.findMany({
            where: {
                negotiation: { userId },
            },
        });

        const estimatedSavings = savings.reduce(
            (sum, s) => sum + parseFloat(s.estimatedAmount.toString()),
            0
        );
        const confirmedSavings = savings.reduce(
            (sum, s) => sum + parseFloat(s.confirmedAmount?.toString() || '0'),
            0
        );

        // Get Gmail connection status
        const gmailStatus = await getGmailStatus(userId);

        // Get scanned emails count
        const scannedEmails = await prisma.gmailMessage.count({
            where: { userId },
        });

        console.log('[Dashboard] Data loaded', {
            vendorCount,
            saasCount,
            totalSubscriptions,
            upcomingRenewals: upcomingRenewals.length,
            scannedEmails,
        });

        return NextResponse.json({
            vendors: {
                total: vendorCount,
                saas: saasCount,
            },
            subscriptions: {
                total: totalSubscriptions,
                gmail: gmailSubscriptions,
                csv: csvSubscriptions,
            },
            renewals: {
                urgent: upcomingRenewals.length,
                upcoming: upcomingRenewals.map(s => ({
                    id: s.id,
                    vendorName: s.vendor.name,
                    renewalDate: s.renewalDate,
                    amount: s.amount,
                    billingCycle: s.billingCycle,
                })),
            },
            transactions: {
                count: transactionCount,
                totalSpend,
            },
            negotiations: {
                total: negotiations.length,
                sent: negotiationsSent,
                draft: negotiationsDraft,
            },
            savings: {
                estimated: estimatedSavings,
                confirmed: confirmedSavings,
            },
            gmail: gmailStatus,
            emailStats: {
                scanned: scannedEmails,
            },
        });
    } catch (error) {
        console.error('[Dashboard] Error:', error);
        return NextResponse.json(
            { error: 'Failed to load dashboard data' },
            { status: 500 }
        );
    }
}
