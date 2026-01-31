import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { sendEmail, isValidEmail, isAnyEmailMethodAvailable } from '@/lib/email';

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;
        const { negotiationId, recipientEmail, approved, estimatedSavings } = await request.json();

        // CRITICAL: Approval gate - never send without explicit approval
        if (!approved) {
            return NextResponse.json(
                { error: 'Approval required before sending. Set approved: true to confirm.' },
                { status: 400 }
            );
        }

        // Validate email
        if (!recipientEmail || !isValidEmail(recipientEmail)) {
            return NextResponse.json(
                { error: 'Valid recipient email required' },
                { status: 400 }
            );
        }

        // Check if any email method is available
        const hasEmailMethod = await isAnyEmailMethodAvailable(userId);
        if (!hasEmailMethod) {
            return NextResponse.json(
                { error: 'No email method available. Please connect Gmail or configure SMTP.' },
                { status: 500 }
            );
        }

        // Get negotiation
        const negotiation = await prisma.negotiation.findUnique({
            where: { id: negotiationId },
            include: { vendor: true },
        });

        if (!negotiation || negotiation.userId !== userId) {
            return NextResponse.json({ error: 'Negotiation not found' }, { status: 404 });
        }

        if (negotiation.status === 'sent') {
            return NextResponse.json(
                { error: 'Email already sent' },
                { status: 400 }
            );
        }

        // Parse email content
        const emailContent = negotiation.finalEmail || negotiation.draftEmail;
        const subjectMatch = emailContent.match(/^Subject:\s*(.+?)(?:\n|$)/i);
        const bodyMatch = emailContent.match(/\n\n([\s\S]+)$/);

        const subject = subjectMatch?.[1] || `Regarding ${negotiation.vendor.name} subscription`;
        const body = bodyMatch?.[1] || emailContent;

        // Send email (tries Gmail first, then SMTP)
        const result = await sendEmail(
            { to: recipientEmail, subject, body },
            userId
        );

        if (!result.success) {
            return NextResponse.json(
                { error: `Failed to send email: ${result.error}` },
                { status: 500 }
            );
        }

        // Update negotiation status with audit trail
        await prisma.negotiation.update({
            where: { id: negotiationId },
            data: {
                status: 'sent',
                sentAt: new Date(),
                recipientEmail,
                finalEmail: emailContent,
                gmailMessageId: result.messageId, // Audit trail
            },
        });

        // Create savings record if estimated
        if (estimatedSavings && estimatedSavings > 0) {
            await prisma.saving.create({
                data: {
                    negotiationId,
                    estimatedAmount: estimatedSavings,
                },
            });
        }

        return NextResponse.json({
            success: true,
            messageId: result.messageId,
            method: result.method,
            message: `Email sent successfully to ${recipientEmail} via ${result.method?.toUpperCase() || 'email'}`,
        });
    } catch (error) {
        console.error('Send email error:', error);
        return NextResponse.json(
            { error: 'Failed to send email' },
            { status: 500 }
        );
    }
}
