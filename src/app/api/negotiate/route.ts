import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generateNegotiationEmail, NegotiationStrategy, getStrategyDisplayName } from '@/lib/llm';
import { getRenewalInfo } from '@/lib/renewal-detection';

// POST - Generate new negotiation draft
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;
        const { vendorId, strategy } = await request.json();

        // Validate strategy
        const validStrategies: NegotiationStrategy[] = ['seat_reduction', 'tier_downgrade', 'annual_prepay'];
        if (!validStrategies.includes(strategy)) {
            return NextResponse.json(
                { error: 'Invalid strategy. Must be: seat_reduction, tier_downgrade, or annual_prepay' },
                { status: 400 }
            );
        }

        // Get vendor with transactions
        const vendor = await prisma.vendor.findUnique({
            where: { id: vendorId },
            include: {
                transactions: {
                    where: { userId },
                    orderBy: { date: 'desc' },
                },
            },
        });

        if (!vendor) {
            return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
        }

        // Calculate context for LLM
        const transactions = vendor.transactions;
        const dates = transactions.map(t => new Date(t.date));
        const frequency = transactions[0]?.frequency || 'monthly';

        let renewalDate: Date | undefined;
        try {
            const renewalInfo = getRenewalInfo(dates, frequency as 'monthly' | 'annual' | 'quarterly' | 'one-time');
            renewalDate = renewalInfo.renewalDate;
        } catch {
            // No transactions
        }

        const totalSpend = transactions.reduce(
            (sum, t) => sum + parseFloat(t.amount.toString()),
            0
        );
        const monthlySpend = frequency === 'annual'
            ? totalSpend / 12
            : totalSpend / Math.max(transactions.length, 1);

        // Get user info
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true },
        });

        // Generate email draft
        const emailDraft = await generateNegotiationEmail(strategy, {
            vendorName: vendor.name,
            currentSpend: monthlySpend,
            frequency,
            renewalDate,
            senderName: user?.name || 'Finance Team',
        });

        // Create negotiation record
        const negotiation = await prisma.negotiation.create({
            data: {
                userId,
                vendorId,
                strategy,
                draftEmail: `Subject: ${emailDraft.subject}\n\n${emailDraft.body}`,
                renewalDate,
                status: 'draft',
            },
        });

        return NextResponse.json({
            id: negotiation.id,
            vendorName: vendor.name,
            strategy,
            strategyName: getStrategyDisplayName(strategy),
            subject: emailDraft.subject,
            body: emailDraft.body,
            renewalDate: renewalDate?.toISOString(),
            monthlySpend,
            status: 'draft',
        });
    } catch (error) {
        console.error('Negotiate error:', error);
        return NextResponse.json(
            { error: 'Failed to generate negotiation' },
            { status: 500 }
        );
    }
}

// PUT - Update negotiation draft
export async function PUT(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;
        const { negotiationId, subject, body, recipientEmail } = await request.json();

        // Verify ownership
        const negotiation = await prisma.negotiation.findUnique({
            where: { id: negotiationId },
        });

        if (!negotiation || negotiation.userId !== userId) {
            return NextResponse.json({ error: 'Negotiation not found' }, { status: 404 });
        }

        if (negotiation.status === 'sent') {
            return NextResponse.json(
                { error: 'Cannot edit sent negotiation' },
                { status: 400 }
            );
        }

        // Update negotiation
        const updated = await prisma.negotiation.update({
            where: { id: negotiationId },
            data: {
                finalEmail: `Subject: ${subject}\n\n${body}`,
                recipientEmail,
                status: 'approved',
            },
        });

        return NextResponse.json({
            id: updated.id,
            status: updated.status,
            message: 'Negotiation updated and ready to send',
        });
    } catch (error) {
        console.error('Update negotiation error:', error);
        return NextResponse.json(
            { error: 'Failed to update negotiation' },
            { status: 500 }
        );
    }
}

// GET - List negotiations
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;
        const searchParams = request.nextUrl.searchParams;
        const status = searchParams.get('status');

        const negotiations = await prisma.negotiation.findMany({
            where: {
                userId,
                ...(status ? { status } : {}),
            },
            include: {
                vendor: true,
                savings: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({
            negotiations: negotiations.map(n => ({
                id: n.id,
                vendorId: n.vendorId,
                vendorName: n.vendor.name,
                strategy: n.strategy,
                strategyName: getStrategyDisplayName(n.strategy as NegotiationStrategy),
                status: n.status,
                renewalDate: n.renewalDate?.toISOString(),
                sentAt: n.sentAt?.toISOString(),
                createdAt: n.createdAt.toISOString(),
                estimatedSavings: n.savings.reduce(
                    (sum, s) => sum + parseFloat(s.estimatedAmount.toString()),
                    0
                ),
                confirmedSavings: n.savings.reduce(
                    (sum, s) => sum + parseFloat(s.confirmedAmount?.toString() || '0'),
                    0
                ),
            })),
        });
    } catch (error) {
        console.error('List negotiations error:', error);
        return NextResponse.json(
            { error: 'Failed to list negotiations' },
            { status: 500 }
        );
    }
}
