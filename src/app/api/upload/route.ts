import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { parseCSV, calculateVendorSummaries } from '@/lib/csv-parser';
import { detectFrequency } from '@/lib/renewal-detection';

export async function POST(request: NextRequest) {
    try {
        // Check authentication
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;

        // Get CSV content from form data
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const csvContent = await file.text();
        const parseResult = parseCSV(csvContent);

        if (parseResult.transactions.length === 0) {
            return NextResponse.json(
                {
                    error: 'No valid transactions found',
                    details: parseResult.errors,
                },
                { status: 400 }
            );
        }

        // Calculate vendor summaries
        const vendorSummaries = calculateVendorSummaries(parseResult.transactions);

        // Store transactions and vendors in database
        const createdVendors: { id: string; name: string }[] = [];
        const createdTransactions: { id: string }[] = [];

        for (const summary of vendorSummaries) {
            // Create or update vendor
            const vendor = await prisma.vendor.upsert({
                where: { name: summary.vendorName },
                update: {
                    category: summary.category,
                    isSaaS: summary.isSaaS,
                },
                create: {
                    name: summary.vendorName,
                    normalizedName: summary.normalizedName,
                    category: summary.category,
                    isSaaS: summary.isSaaS,
                },
            });

            createdVendors.push({ id: vendor.id, name: vendor.name });

            // Get transactions for this vendor
            const vendorTransactions = parseResult.transactions.filter(
                t => t.normalizedVendorName === summary.normalizedName
            );

            // Calculate frequency
            const dates = vendorTransactions.map(t => t.date);
            const frequency = detectFrequency(dates);

            // Create transactions
            for (const tx of vendorTransactions) {
                const transaction = await prisma.transaction.create({
                    data: {
                        userId,
                        vendorId: vendor.id,
                        amount: tx.amount,
                        date: tx.date,
                        frequency,
                        rawDescription: tx.rawDescription,
                    },
                });
                createdTransactions.push({ id: transaction.id });
            }
        }

        // Return summary
        return NextResponse.json({
            success: true,
            summary: {
                totalRows: parseResult.totalRows,
                validTransactions: parseResult.transactions.length,
                saasCount: parseResult.saasCount,
                vendorsCreated: createdVendors.length,
                transactionsCreated: createdTransactions.length,
                errors: parseResult.errors,
            },
            vendors: vendorSummaries.slice(0, 10).map(v => ({
                name: v.vendorName,
                totalSpend: v.totalAmount,
                transactionCount: v.transactionCount,
                isSaaS: v.isSaaS,
                category: v.category,
            })),
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: 'Failed to process CSV' },
            { status: 500 }
        );
    }
}
