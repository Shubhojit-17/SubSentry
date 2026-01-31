import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET /api/vendors - List all vendors with subscription counts
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;

        // Get vendors that have subscriptions for this user
        const vendors = await prisma.vendor.findMany({
            where: {
                subscriptions: {
                    some: { userId },
                },
            },
            include: {
                subscriptions: {
                    where: { userId },
                    orderBy: { lastDetectedAt: 'desc' },
                },
                _count: {
                    select: {
                        subscriptions: {
                            where: { userId },
                        },
                        negotiations: {
                            where: { userId },
                        },
                    },
                },
            },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json({
            vendors: vendors.map(v => {
                // Calculate total spend from subscriptions
                const totalSpend = v.subscriptions.reduce((sum, s) => {
                    return sum + (s.amount ? parseFloat(s.amount.toString()) : 0);
                }, 0);

                // Get nearest renewal
                const upcomingRenewals = v.subscriptions
                    .filter(s => s.renewalDate && s.renewalDate > new Date())
                    .sort((a, b) => (a.renewalDate?.getTime() || 0) - (b.renewalDate?.getTime() || 0));

                const nextRenewal = upcomingRenewals[0]?.renewalDate || null;

                return {
                    id: v.id,
                    name: v.name,
                    domain: v.domain,
                    category: v.category,
                    logo: v.logo,
                    website: v.website,
                    isSaaS: v.isSaaS,
                    subscriptionCount: v._count.subscriptions,
                    negotiationCount: v._count.negotiations,
                    totalSpend,
                    nextRenewal,
                    subscriptions: v.subscriptions.map(s => ({
                        id: s.id,
                        source: s.source,
                        renewalDate: s.renewalDate,
                        amount: s.amount ? parseFloat(s.amount.toString()) : null,
                        billingCycle: s.billingCycle,
                        confidenceScore: s.confidenceScore,
                    })),
                };
            }),
            total: vendors.length,
        });
    } catch (error) {
        console.error('[Vendors API] Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch vendors' },
            { status: 500 }
        );
    }
}

// POST /api/vendors - Create a new vendor manually
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name, domain, category, website } = body;

        if (!name) {
            return NextResponse.json({ error: 'Vendor name is required' }, { status: 400 });
        }

        // Check if vendor already exists
        const existing = await prisma.vendor.findFirst({
            where: {
                OR: [
                    { name },
                    { normalizedName: name.toLowerCase().replace(/\s+/g, '') },
                ],
            },
        });

        if (existing) {
            return NextResponse.json({
                error: 'Vendor already exists',
                vendor: { id: existing.id, name: existing.name },
            }, { status: 409 });
        }

        const vendor = await prisma.vendor.create({
            data: {
                name,
                normalizedName: name.toLowerCase().replace(/\s+/g, ''),
                domain,
                category,
                website,
                isSaaS: true,
            },
        });

        return NextResponse.json({
            success: true,
            vendor: {
                id: vendor.id,
                name: vendor.name,
            },
        });
    } catch (error) {
        console.error('[Vendors API] Create error:', error);
        return NextResponse.json(
            { error: 'Failed to create vendor' },
            { status: 500 }
        );
    }
}
