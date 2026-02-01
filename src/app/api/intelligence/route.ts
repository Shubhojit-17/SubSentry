import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOrCreateIntelligence } from '@/lib/intelligence-engine';

/**
 * GET /api/intelligence?subscriptionId=xxx
 * Returns cached intelligence snapshot or generates new one
 */
export async function GET(request: NextRequest) {
    console.log('[Intelligence API] GET request received');

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

        // Get or create intelligence snapshot (uses cache by default)
        const intelligence = await getOrCreateIntelligence(subscriptionId, false);

        if (!intelligence) {
            return NextResponse.json(
                { error: 'Subscription not found' },
                { status: 404 }
            );
        }

        console.log('[Intelligence API] Returning snapshot for:', subscriptionId);
        return NextResponse.json(intelligence);

    } catch (error) {
        console.error('[Intelligence API] Error:', error);
        return NextResponse.json(
            { error: 'Failed to get intelligence' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/intelligence/regenerate
 * Forces regeneration of intelligence snapshot
 */
export async function POST(request: NextRequest) {
    console.log('[Intelligence API] POST request received');

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { subscriptionId } = body;

        if (!subscriptionId) {
            return NextResponse.json(
                { error: 'subscriptionId is required' },
                { status: 400 }
            );
        }

        // Force regeneration
        const intelligence = await getOrCreateIntelligence(subscriptionId, true);

        if (!intelligence) {
            return NextResponse.json(
                { error: 'Subscription not found' },
                { status: 404 }
            );
        }

        console.log('[Intelligence API] Regenerated snapshot for:', subscriptionId);
        return NextResponse.json({
            ...intelligence,
            regenerated: true,
        });

    } catch (error) {
        console.error('[Intelligence API] Error:', error);
        return NextResponse.json(
            { error: 'Failed to regenerate intelligence' },
            { status: 500 }
        );
    }
}
