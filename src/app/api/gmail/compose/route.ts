import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGmailComposeUrl, updateNegotiationEmail } from '@/lib/intelligence-engine';
import prisma from '@/lib/prisma';

/**
 * POST /api/gmail/compose
 * Returns Gmail compose URL with pre-filled subject and body
 * Does NOT send email directly - opens compose window
 */
export async function POST(request: NextRequest) {
    console.log('[Gmail Compose] POST request received');

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { subscriptionId, to, subject, emailBody } = body;

        if (!subject || !emailBody) {
            return NextResponse.json(
                { error: 'subject and emailBody are required' },
                { status: 400 }
            );
        }

        // If subscriptionId provided, save the current email content
        if (subscriptionId) {
            try {
                await updateNegotiationEmail(subscriptionId, emailBody, subject);
            } catch (err) {
                // Intelligence snapshot might not exist yet, that's ok
                console.log('[Gmail Compose] Could not save email:', err);
            }
        }

        // Generate Gmail compose URL
        const composeUrl = getGmailComposeUrl(to || '', subject, emailBody);

        console.log('[Gmail Compose] Generated compose URL');
        return NextResponse.json({
            composeUrl,
            message: 'Open this URL to compose your email in Gmail',
        });

    } catch (error) {
        console.error('[Gmail Compose] Error:', error);
        return NextResponse.json(
            { error: 'Failed to generate compose URL' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/gmail/compose?subscriptionId=xxx
 * Get saved negotiation email for editing
 */
export async function GET(request: NextRequest) {
    console.log('[Gmail Compose] GET request received');

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const subscriptionId = request.nextUrl.searchParams.get('subscriptionId');

        if (!subscriptionId) {
            return NextResponse.json(
                { error: 'subscriptionId is required' },
                { status: 400 }
            );
        }

        const intelligence = await prisma.subscriptionIntelligence.findUnique({
            where: { subscriptionId },
            select: {
                negotiationEmail: true,
                negotiationSubject: true,
            },
        });

        if (!intelligence) {
            return NextResponse.json(
                { error: 'No negotiation email found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            subject: intelligence.negotiationSubject,
            body: intelligence.negotiationEmail,
        });

    } catch (error) {
        console.error('[Gmail Compose] Error:', error);
        return NextResponse.json(
            { error: 'Failed to get negotiation email' },
            { status: 500 }
        );
    }
}
