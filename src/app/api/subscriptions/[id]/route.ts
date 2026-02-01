import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET /api/subscriptions/[id] - Get subscription details
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;

        const subscription = await prisma.subscription.findFirst({
            where: {
                id: params.id,
                userId,
            },
            include: {
                vendor: true,
            },
        });

        if (!subscription) {
            return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
        }

        // Get associated Gmail message if available
        let emailContext = null;
        if (subscription.gmailMessageId) {
            const message = await prisma.gmailMessage.findUnique({
                where: { gmailId: subscription.gmailMessageId },
            });
            if (message) {
                emailContext = {
                    subject: message.subject,
                    sender: message.sender,
                    snippet: message.snippet,
                    date: message.date,
                };
            }
        }

        return NextResponse.json({
            subscription: {
                id: subscription.id,
                vendorId: subscription.vendorId,
                vendorName: subscription.vendor.name,
                vendorDomain: subscription.vendor.domain,
                vendorLogo: subscription.vendor.logo,
                vendorCategory: subscription.vendor.category,
                vendorWebsite: subscription.vendor.website,
                source: subscription.source,
                renewalDate: subscription.renewalDate,
                billingCycle: subscription.billingCycle,
                plan: subscription.plan,
                seats: subscription.seats,
                amount: subscription.amount ? parseFloat(subscription.amount.toString()) : null,
                currency: subscription.currency,
                confidenceScore: subscription.confidenceScore,
                status: subscription.status,
                notes: subscription.notes,
                lastDetectedAt: subscription.lastDetectedAt,
                createdAt: subscription.createdAt,
            },
            emailContext,
        });
    } catch (error) {
        console.error('[Subscription Detail] Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch subscription' },
            { status: 500 }
        );
    }
}

// PATCH /api/subscriptions/[id] - Update subscription
export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;
        const body = await request.json();

        const subscription = await prisma.subscription.findFirst({
            where: { id: params.id, userId },
        });

        if (!subscription) {
            return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
        }

        const updated = await prisma.subscription.update({
            where: { id: params.id },
            data: {
                renewalDate: body.renewalDate ? new Date(body.renewalDate) : undefined,
                billingCycle: body.billingCycle,
                amount: body.amount !== undefined ? parseFloat(body.amount) : undefined,
                currency: body.currency,
                status: body.status,
                notes: body.notes,
            },
            include: { vendor: true },
        });

        return NextResponse.json({
            success: true,
            subscription: {
                id: updated.id,
                vendorName: updated.vendor.name,
            },
        });
    } catch (error) {
        console.error('[Subscription Update] Error:', error);
        return NextResponse.json(
            { error: 'Failed to update subscription' },
            { status: 500 }
        );
    }
}

// DELETE /api/subscriptions/[id] - Delete subscription
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;

        const subscription = await prisma.subscription.findFirst({
            where: { id: params.id, userId },
        });

        if (!subscription) {
            return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
        }

        await prisma.subscription.delete({
            where: { id: params.id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Subscription Delete] Error:', error);
        return NextResponse.json(
            { error: 'Failed to delete subscription' },
            { status: 500 }
        );
    }
}
