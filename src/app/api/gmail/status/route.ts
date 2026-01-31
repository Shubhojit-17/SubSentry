import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGmailStatus } from '@/lib/gmail';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;
        const status = await getGmailStatus(userId);

        return NextResponse.json(status);
    } catch (error) {
        console.error('Gmail status error:', error);
        return NextResponse.json(
            { error: 'Failed to get Gmail status' },
            { status: 500 }
        );
    }
}
