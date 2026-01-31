import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET /api/subscriptions - List all subscriptions
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;
        const { searchParams } = new URL(request.url);
        const filter = searchParams.get('filter');

        let whereClause: Record<string, unknown> = { userId };

        // Filter for upcoming renewals
        if (filter === 'renewing') {
            const now = new Date();
            const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            whereClause = {
                ...whereClause,
                renewalDate: {
                    gte: now,
                    lte: thirtyDaysFromNow,
                },
            };
        }

        const subscriptions = await prisma.subscription.findMany({
            where: whereClause,
            include: {
                vendor: true,
            },
            orderBy: [
                { renewalDate: 'asc' },
                { lastDetectedAt: 'desc' },
            ],
        });

        return NextResponse.json({
            subscriptions: subscriptions.map(s => ({
                id: s.id,
                vendorId: s.vendorId,
                vendorName: s.vendor.name,
                vendorLogo: s.vendor.logo,
                vendorCategory: s.vendor.category,
                source: s.source,
                renewalDate: s.renewalDate,
                billingCycle: s.billingCycle,
                amount: s.amount ? parseFloat(s.amount.toString()) : null,
                currency: s.currency,
                confidenceScore: s.confidenceScore,
                status: s.status,
                lastDetectedAt: s.lastDetectedAt,
                createdAt: s.createdAt,
            })),
            total: subscriptions.length,
        });
    } catch (error) {
        console.error('[Subscriptions API] Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch subscriptions' },
            { status: 500 }
        );
    }
}

// POST /api/subscriptions - Create a new subscription manually
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;
        const body = await request.json();

        const { vendorName, renewalDate, billingCycle, amount, currency } = body;

        if (!vendorName) {
            return NextResponse.json({ error: 'Vendor name is required' }, { status: 400 });
        }

        // Find or create vendor
        let vendor = await prisma.vendor.findFirst({
            where: {
                normalizedName: vendorName.toLowerCase().replace(/\s+/g, ''),
            },
        });

        if (!vendor) {
            vendor = await prisma.vendor.create({
                data: {
                    name: vendorName,
                    normalizedName: vendorName.toLowerCase().replace(/\s+/g, ''),
                    isSaaS: true,
                },
            });
        }

        // Create subscription
        const subscription = await prisma.subscription.create({
            data: {
                userId,
                vendorId: vendor.id,
                source: 'manual',
                renewalDate: renewalDate ? new Date(renewalDate) : null,
                billingCycle,
                amount: amount ? parseFloat(amount) : null,
                currency: currency || 'USD',
                confidenceScore: 'high', // Manual entries are high confidence
            },
            include: { vendor: true },
        });

        return NextResponse.json({
            success: true,
            subscription: {
                id: subscription.id,
                vendorName: subscription.vendor.name,
                source: subscription.source,
            },
        });
    } catch (error) {
        console.error('[Subscriptions API] Create error:', error);
        return NextResponse.json(
            { error: 'Failed to create subscription' },
            { status: 500 }
        );
    }
}
