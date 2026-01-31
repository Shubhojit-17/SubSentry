/**
 * CSV Parser for Transaction Data
 * Handles QuickBooks exports, bank exports, and generic CSV formats
 */

import Papa from 'papaparse';
import { detectSaaSVendor, isSaaSSubscription, normalizeVendorName } from './saas-vendors';

export interface RawTransaction {
    date: string;
    description: string;
    amount: string | number;
    vendor?: string;
    category?: string;
}

export interface ParsedTransaction {
    date: Date;
    vendorName: string;
    normalizedVendorName: string;
    amount: number;
    rawDescription: string;
    isSaaS: boolean;
    category: string | null;
}

export interface CSVParseResult {
    transactions: ParsedTransaction[];
    errors: string[];
    totalRows: number;
    saasCount: number;
}

// Common column name mappings
const DATE_COLUMNS = ['date', 'transaction date', 'trans date', 'posted date', 'txn date'];
const DESCRIPTION_COLUMNS = ['description', 'memo', 'name', 'payee', 'merchant', 'trans description'];
const AMOUNT_COLUMNS = ['amount', 'debit', 'withdrawal', 'payment', 'charge'];
const VENDOR_COLUMNS = ['vendor', 'payee', 'merchant', 'name'];
const CATEGORY_COLUMNS = ['category', 'type', 'class'];

/**
 * Find the best matching column from CSV headers
 */
function findColumn(headers: string[], candidates: string[]): string | null {
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

    for (const candidate of candidates) {
        const index = normalizedHeaders.indexOf(candidate);
        if (index !== -1) {
            return headers[index];
        }
    }

    // Partial match
    for (const candidate of candidates) {
        const index = normalizedHeaders.findIndex(h => h.includes(candidate));
        if (index !== -1) {
            return headers[index];
        }
    }

    return null;
}

/**
 * Parse amount string to number
 * Handles various formats: $1,234.56, (1234.56), -1234.56
 */
function parseAmount(value: string | number): number {
    if (typeof value === 'number') {
        return Math.abs(value);
    }

    // Remove currency symbols and whitespace
    let cleaned = value.replace(/[$€£¥,\s]/g, '');

    // Handle parentheses for negative numbers (accounting format)
    if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
        cleaned = cleaned.slice(1, -1);
    }

    // Remove negative sign (we only care about absolute value for spending)
    cleaned = cleaned.replace(/^-/, '');

    const amount = parseFloat(cleaned);
    return isNaN(amount) ? 0 : amount;
}

/**
 * Parse date string to Date object
 * Handles various formats: MM/DD/YYYY, YYYY-MM-DD, DD/MM/YYYY
 */
function parseDate(value: string): Date | null {
    if (!value) return null;

    // Try ISO format first
    const isoDate = new Date(value);
    if (!isNaN(isoDate.getTime())) {
        return isoDate;
    }

    // Try MM/DD/YYYY
    const usMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usMatch) {
        return new Date(parseInt(usMatch[3]), parseInt(usMatch[1]) - 1, parseInt(usMatch[2]));
    }

    // Try DD/MM/YYYY 
    const euMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (euMatch) {
        // Prefer US format, but this handles edge cases
        return new Date(parseInt(euMatch[3]), parseInt(euMatch[1]) - 1, parseInt(euMatch[2]));
    }

    return null;
}

/**
 * Extract vendor name from description
 */
function extractVendorName(description: string, explicitVendor?: string): string {
    // Use explicit vendor if provided
    if (explicitVendor && explicitVendor.trim()) {
        return explicitVendor.trim();
    }

    // Check for known SaaS vendor
    const saasVendor = detectSaaSVendor(description);
    if (saasVendor) {
        return saasVendor.name;
    }

    // Extract vendor from description
    // Remove common prefixes and suffixes
    let vendor = description
        .replace(/^(purchase|payment|debit|withdrawal|ach|wire|eft)\s*/i, '')
        .replace(/\s*(recurring|subscription|monthly|annual|payment).*$/i, '')
        .replace(/\s*\d{2}\/\d{2}.*$/, '') // Remove trailing dates
        .replace(/\s*#\d+.*$/, '') // Remove reference numbers
        .replace(/\s*\*+\d+.*$/, '') // Remove card numbers
        .trim();

    // Capitalize words
    vendor = vendor
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

    return vendor || 'Unknown Vendor';
}

/**
 * Parse CSV file content
 */
export function parseCSV(csvContent: string): CSVParseResult {
    const errors: string[] = [];
    const transactions: ParsedTransaction[] = [];

    // Parse CSV with Papa Parse
    const result = Papa.parse<Record<string, string>>(csvContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
    });

    if (result.errors.length > 0) {
        errors.push(...result.errors.map(e => `Row ${e.row}: ${e.message}`));
    }

    const headers = result.meta.fields || [];

    // Find column mappings
    const dateCol = findColumn(headers, DATE_COLUMNS);
    const descCol = findColumn(headers, DESCRIPTION_COLUMNS);
    const amountCol = findColumn(headers, AMOUNT_COLUMNS);
    const vendorCol = findColumn(headers, VENDOR_COLUMNS);
    const categoryCol = findColumn(headers, CATEGORY_COLUMNS);

    if (!dateCol) {
        errors.push('Could not find date column');
        return { transactions: [], errors, totalRows: result.data.length, saasCount: 0 };
    }

    if (!descCol && !vendorCol) {
        errors.push('Could not find description or vendor column');
        return { transactions: [], errors, totalRows: result.data.length, saasCount: 0 };
    }

    if (!amountCol) {
        errors.push('Could not find amount column');
        return { transactions: [], errors, totalRows: result.data.length, saasCount: 0 };
    }

    // Process each row
    for (let i = 0; i < result.data.length; i++) {
        const row = result.data[i];

        try {
            const dateStr = row[dateCol!];
            const description = descCol ? row[descCol] || '' : '';
            const amountStr = row[amountCol!];
            const explicitVendor = vendorCol ? row[vendorCol] : undefined;
            const category = categoryCol ? row[categoryCol] : null;

            const date = parseDate(dateStr);
            if (!date) {
                errors.push(`Row ${i + 2}: Invalid date "${dateStr}"`);
                continue;
            }

            const amount = parseAmount(amountStr);
            if (amount === 0) {
                continue; // Skip zero amount transactions
            }

            const vendorName = extractVendorName(description, explicitVendor);
            const normalizedVendorName = normalizeVendorName(vendorName);
            const isSaaS = isSaaSSubscription(description) || isSaaSSubscription(vendorName);

            const saasVendor = detectSaaSVendor(description) || detectSaaSVendor(vendorName);

            transactions.push({
                date,
                vendorName,
                normalizedVendorName,
                amount,
                rawDescription: description,
                isSaaS,
                category: saasVendor?.category || category,
            });
        } catch (err) {
            errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }

    const saasCount = transactions.filter(t => t.isSaaS).length;

    return {
        transactions,
        errors: errors.slice(0, 10), // Limit error messages
        totalRows: result.data.length,
        saasCount,
    };
}

/**
 * Group transactions by vendor
 */
export function groupByVendor(transactions: ParsedTransaction[]): Map<string, ParsedTransaction[]> {
    const groups = new Map<string, ParsedTransaction[]>();

    for (const tx of transactions) {
        const key = tx.normalizedVendorName;
        const existing = groups.get(key) || [];
        existing.push(tx);
        groups.set(key, existing);
    }

    return groups;
}

/**
 * Calculate vendor summary from transactions
 */
export interface VendorSummary {
    vendorName: string;
    normalizedName: string;
    totalAmount: number;
    transactionCount: number;
    firstDate: Date;
    lastDate: Date;
    averageAmount: number;
    isSaaS: boolean;
    category: string | null;
}

export function calculateVendorSummaries(transactions: ParsedTransaction[]): VendorSummary[] {
    const groups = groupByVendor(transactions);
    const summaries: VendorSummary[] = [];

    for (const [normalizedName, txs] of groups) {
        const sortedTxs = [...txs].sort((a, b) => a.date.getTime() - b.date.getTime());
        const totalAmount = txs.reduce((sum: number, tx: ParsedTransaction) => sum + tx.amount, 0);

        summaries.push({
            vendorName: txs[0].vendorName,
            normalizedName,
            totalAmount,
            transactionCount: txs.length,
            firstDate: sortedTxs[0].date,
            lastDate: sortedTxs[sortedTxs.length - 1].date,
            averageAmount: totalAmount / txs.length,
            isSaaS: txs.some((tx: ParsedTransaction) => tx.isSaaS),
            category: txs.find((tx: ParsedTransaction) => tx.category)?.category || null,
        });
    }

    // Sort by total spend descending
    return summaries.sort((a, b) => b.totalAmount - a.totalAmount);
}
