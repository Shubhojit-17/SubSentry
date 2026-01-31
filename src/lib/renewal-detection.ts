/**
 * Renewal Date Detection
 * Rule-based estimation of renewal dates from transaction history
 */

export type Frequency = 'monthly' | 'annual' | 'quarterly' | 'one-time';

export interface RenewalInfo {
    frequency: Frequency;
    renewalDate: Date;
    daysUntilRenewal: number;
    isUrgent: boolean; // Within 30 days
}

/**
 * Detect frequency from transaction dates
 * Requires at least 2 transactions to determine pattern
 */
export function detectFrequency(dates: Date[]): Frequency {
    if (dates.length < 2) {
        // Single transaction - assume monthly for SaaS
        return 'monthly';
    }

    // Sort dates chronologically
    const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime());

    // Calculate average days between transactions
    let totalDays = 0;
    for (let i = 1; i < sortedDates.length; i++) {
        const diffMs = sortedDates[i].getTime() - sortedDates[i - 1].getTime();
        totalDays += diffMs / (1000 * 60 * 60 * 24);
    }
    const avgDays = totalDays / (sortedDates.length - 1);

    // Classify based on average interval
    if (avgDays <= 45) {
        return 'monthly';
    } else if (avgDays <= 120) {
        return 'quarterly';
    } else if (avgDays <= 400) {
        return 'annual';
    }

    return 'one-time';
}

/**
 * Calculate next renewal date based on frequency and last transaction
 */
export function calculateRenewalDate(
    lastTransactionDate: Date,
    frequency: Frequency,
    firstTransactionDate?: Date
): Date {
    const now = new Date();
    let renewalDate: Date;

    switch (frequency) {
        case 'monthly':
            // Next month from last transaction
            renewalDate = new Date(lastTransactionDate);
            renewalDate.setMonth(renewalDate.getMonth() + 1);

            // If renewal is in the past, calculate next occurrence
            while (renewalDate < now) {
                renewalDate.setMonth(renewalDate.getMonth() + 1);
            }
            break;

        case 'quarterly':
            renewalDate = new Date(lastTransactionDate);
            renewalDate.setMonth(renewalDate.getMonth() + 3);

            while (renewalDate < now) {
                renewalDate.setMonth(renewalDate.getMonth() + 3);
            }
            break;

        case 'annual':
            // For annual, use 11 months from first payment as per spec
            // This gives time to negotiate before renewal
            if (firstTransactionDate) {
                renewalDate = new Date(firstTransactionDate);
                renewalDate.setMonth(renewalDate.getMonth() + 11);

                // Find the next upcoming renewal window
                while (renewalDate < now) {
                    renewalDate.setFullYear(renewalDate.getFullYear() + 1);
                }
            } else {
                // Fall back to 11 months from last transaction
                renewalDate = new Date(lastTransactionDate);
                renewalDate.setMonth(renewalDate.getMonth() + 11);

                while (renewalDate < now) {
                    renewalDate.setFullYear(renewalDate.getFullYear() + 1);
                }
            }
            break;

        default:
            // One-time - no renewal
            renewalDate = new Date(lastTransactionDate);
    }

    return renewalDate;
}

/**
 * Get complete renewal information for a vendor
 */
export function getRenewalInfo(
    transactionDates: Date[],
    frequency?: Frequency
): RenewalInfo {
    if (transactionDates.length === 0) {
        throw new Error('At least one transaction date is required');
    }

    const sortedDates = [...transactionDates].sort((a, b) => a.getTime() - b.getTime());
    const firstDate = sortedDates[0];
    const lastDate = sortedDates[sortedDates.length - 1];

    const detectedFrequency = frequency || detectFrequency(sortedDates);
    const renewalDate = calculateRenewalDate(lastDate, detectedFrequency, firstDate);

    const now = new Date();
    const diffMs = renewalDate.getTime() - now.getTime();
    const daysUntilRenewal = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    return {
        frequency: detectedFrequency,
        renewalDate,
        daysUntilRenewal,
        isUrgent: daysUntilRenewal <= 30 && daysUntilRenewal > 0,
    };
}

/**
 * Format renewal date for display
 */
export function formatRenewalDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

/**
 * Get urgency label for UI
 */
export function getUrgencyLabel(daysUntilRenewal: number): {
    label: string;
    color: 'red' | 'orange' | 'yellow' | 'green' | 'gray';
} {
    if (daysUntilRenewal <= 0) {
        return { label: 'Overdue', color: 'gray' };
    } else if (daysUntilRenewal <= 7) {
        return { label: `${daysUntilRenewal} days`, color: 'red' };
    } else if (daysUntilRenewal <= 14) {
        return { label: `${daysUntilRenewal} days`, color: 'orange' };
    } else if (daysUntilRenewal <= 30) {
        return { label: `${daysUntilRenewal} days`, color: 'yellow' };
    } else if (daysUntilRenewal <= 90) {
        return { label: `${daysUntilRenewal} days`, color: 'green' };
    }
    return { label: `${daysUntilRenewal} days`, color: 'gray' };
}
