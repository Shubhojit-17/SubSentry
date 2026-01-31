import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// Update confirmed savings
export async function PUT(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;
        const { savingId, confirmedAmount, notes } = await request.json();

        // Get saving with negotiation to verify ownership
        const saving = await prisma.saving.findUnique({
            where: { id: savingId },
            include: {
                negotiation: true,
            },
        });

        if (!saving || saving.negotiation.userId !== userId) {
            return NextResponse.json({ error: 'Saving not found' }, { status: 404 });
        }

        // Update saving
        const updated = await prisma.saving.update({
            where: { id: savingId },
            data: {
                confirmedAmount,
                notes,
            },
        });

        // Update negotiation status if savings confirmed
        if (confirmedAmount > 0) {
            await prisma.negotiation.update({
                where: { id: saving.negotiationId },
                data: { status: 'closed' },
            });
        }

        return NextResponse.json({
            id: updated.id,
            estimatedAmount: parseFloat(updated.estimatedAmount.toString()),
            confirmedAmount: updated.confirmedAmount
                ? parseFloat(updated.confirmedAmount.toString())
                : null,
            notes: updated.notes,
        });
    } catch (error) {
        console.error('Update saving error:', error);
        return NextResponse.json(
            { error: 'Failed to update saving' },
            { status: 500 }
        );
    }
}
