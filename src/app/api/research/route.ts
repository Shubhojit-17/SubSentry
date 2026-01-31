import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Rate limiting for Gemini calls
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_CALLS_PER_MINUTE = 5;

function checkRateLimit(userId: string): boolean {
    const now = Date.now();
    let state = rateLimitMap.get(userId);

    if (!state || now > state.resetAt) {
        state = { count: 0, resetAt: now + 60000 };
        rateLimitMap.set(userId, state);
    }

    if (state.count >= MAX_CALLS_PER_MINUTE) {
        return false;
    }

    state.count++;
    return true;
}

// POST /api/research - Research alternatives for a vendor
export async function POST(request: NextRequest) {
    console.log('[Research] POST request received');

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;

        // Rate limit check
        if (!checkRateLimit(userId)) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please wait a minute.' },
                { status: 429 }
            );
        }

        const body = await request.json();
        const { vendorId, vendorName, category } = body;

        if (!vendorName && !vendorId) {
            return NextResponse.json(
                { error: 'Either vendorName or vendorId is required' },
                { status: 400 }
            );
        }

        // Get vendor details if vendorId provided
        let targetVendor = vendorName;
        let targetCategory = category;

        if (vendorId) {
            const vendor = await prisma.vendor.findUnique({
                where: { id: vendorId },
            });
            if (vendor) {
                targetVendor = vendor.name;
                targetCategory = vendor.category || category;
            }
        }

        console.log('[Research] Researching alternatives for:', targetVendor, 'Category:', targetCategory);

        // Check for Gemini API key
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.log('[Research] No Gemini API key, using mock data');
            return NextResponse.json({
                vendor: targetVendor,
                category: targetCategory,
                alternatives: getMockAlternatives(targetVendor, targetCategory),
                source: 'mock',
            });
        }

        // Call Gemini for research
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `You are a SaaS procurement expert. Research alternatives to ${targetVendor}${targetCategory ? ` (Category: ${targetCategory})` : ''}.

Return a JSON array with 3-5 alternatives:
[
  {
    "name": "Tool Name",
    "website": "https://example.com",
    "priceRange": "$10-50/user/month",
    "category": "Category",
    "strengths": ["Strength 1", "Strength 2"],
    "bestFor": "Description of ideal use case"
  }
]

Consider:
- Similar features and capabilities
- Different price points (cheaper and premium)
- Different company sizes (startups, enterprise)
- Open source alternatives if applicable

Return ONLY valid JSON, no markdown or explanation.`;

        const result = await model.generateContent(prompt);
        const response = result.response.text();

        // Parse JSON from response
        let alternatives;
        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                alternatives = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON array found');
            }
        } catch (parseError) {
            console.error('[Research] Failed to parse Gemini response:', parseError);
            alternatives = getMockAlternatives(targetVendor, targetCategory);
        }

        console.log('[Research] Found', alternatives.length, 'alternatives');

        return NextResponse.json({
            vendor: targetVendor,
            category: targetCategory,
            alternatives,
            source: 'gemini',
        });
    } catch (error) {
        console.error('[Research] Error:', error);
        return NextResponse.json(
            { error: 'Failed to research alternatives' },
            { status: 500 }
        );
    }
}

// Mock alternatives for when Gemini is unavailable
function getMockAlternatives(vendor: string, category?: string | null): Array<{
    name: string;
    website: string;
    priceRange: string;
    category: string;
    strengths: string[];
    bestFor: string;
}> {
    const categoryAlternatives: Record<string, Array<{
        name: string;
        website: string;
        priceRange: string;
        category: string;
        strengths: string[];
        bestFor: string;
    }>> = {
        'Communication': [
            { name: 'Microsoft Teams', website: 'https://teams.microsoft.com', priceRange: '$4-12.50/user/month', category: 'Communication', strengths: ['Office 365 integration', 'Video conferencing'], bestFor: 'Enterprises using Microsoft stack' },
            { name: 'Discord', website: 'https://discord.com', priceRange: 'Free-$9.99/month', category: 'Communication', strengths: ['Free tier', 'Great for communities'], bestFor: 'Small teams and communities' },
            { name: 'Mattermost', website: 'https://mattermost.com', priceRange: 'Free-$10/user/month', category: 'Communication', strengths: ['Self-hosted', 'Open source'], bestFor: 'Security-conscious organizations' },
        ],
        'Project Management': [
            { name: 'Linear', website: 'https://linear.app', priceRange: 'Free-$8/user/month', category: 'Project Management', strengths: ['Fast UI', 'Developer-focused'], bestFor: 'Engineering teams' },
            { name: 'Asana', website: 'https://asana.com', priceRange: 'Free-$24.99/user/month', category: 'Project Management', strengths: ['Flexible workflows', 'Integrations'], bestFor: 'Cross-functional teams' },
            { name: 'Notion', website: 'https://notion.so', priceRange: 'Free-$15/user/month', category: 'Project Management', strengths: ['All-in-one workspace', 'Customizable'], bestFor: 'Teams wanting docs + projects' },
        ],
        'Design': [
            { name: 'Sketch', website: 'https://sketch.com', priceRange: '$9/editor/month', category: 'Design', strengths: ['Mac-native', 'Simpler learning curve'], bestFor: 'Mac-only design teams' },
            { name: 'Adobe XD', website: 'https://adobe.com/xd', priceRange: '$9.99-52.99/month', category: 'Design', strengths: ['Adobe integration', 'Prototyping'], bestFor: 'Teams in Adobe ecosystem' },
            { name: 'Penpot', website: 'https://penpot.app', priceRange: 'Free (open source)', category: 'Design', strengths: ['Free', 'Self-hosted option'], bestFor: 'Budget-conscious teams' },
        ],
    };

    // Return category-specific alternatives or generic ones
    if (category && categoryAlternatives[category]) {
        return categoryAlternatives[category];
    }

    return [
        { name: 'Alternative 1', website: 'https://example.com', priceRange: 'Contact for pricing', category: category || 'Uncategorized', strengths: ['Feature 1', 'Feature 2'], bestFor: 'Teams looking for alternatives' },
        { name: 'Alternative 2', website: 'https://example.com', priceRange: 'Free-$20/user/month', category: category || 'Uncategorized', strengths: ['Affordable', 'Easy to use'], bestFor: 'Small to medium teams' },
        { name: 'Alternative 3', website: 'https://example.com', priceRange: 'Enterprise pricing', category: category || 'Uncategorized', strengths: ['Enterprise features', 'Support'], bestFor: 'Large organizations' },
    ];
}
