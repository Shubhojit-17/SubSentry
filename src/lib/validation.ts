/**
 * API Request Validation Schemas using Zod
 * Centralized validation for all API endpoints
 */

import { z } from 'zod';

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

export const paginationSchema = z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export const idSchema = z.object({
    id: z.string().cuid(),
});

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

export const registerSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
    name: z.string().min(1, 'Name is required').max(100).optional(),
});

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});

// ============================================================================
// SUBSCRIPTION SCHEMAS
// ============================================================================

export const createSubscriptionSchema = z.object({
    vendorName: z.string().min(1, 'Vendor name is required').max(200),
    renewalDate: z.string().datetime().optional().nullable(),
    billingCycle: z.enum(['monthly', 'yearly', 'quarterly']).optional().nullable(),
    amount: z.coerce.number().positive().optional().nullable(),
    currency: z.string().length(3).toUpperCase().optional().default('USD'),
    plan: z.string().max(100).optional().nullable(),
    seats: z.coerce.number().int().positive().optional().nullable(),
});

export const updateSubscriptionSchema = z.object({
    renewalDate: z.string().datetime().optional().nullable(),
    billingCycle: z.enum(['monthly', 'yearly', 'quarterly']).optional().nullable(),
    amount: z.coerce.number().positive().optional().nullable(),
    currency: z.string().length(3).toUpperCase().optional(),
    plan: z.string().max(100).optional().nullable(),
    seats: z.coerce.number().int().positive().optional().nullable(),
    status: z.enum(['active', 'cancelled', 'pending']).optional(),
    notes: z.string().max(1000).optional().nullable(),
});

export const subscriptionFilterSchema = z.object({
    filter: z.enum(['all', 'renewing', 'active', 'cancelled']).optional(),
    source: z.enum(['gmail', 'csv', 'manual']).optional(),
    sortBy: z.enum(['renewalDate', 'amount', 'vendorName', 'lastDetectedAt']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

// ============================================================================
// NEGOTIATION SCHEMAS
// ============================================================================

export const negotiationStrategySchema = z.enum([
    'seat_reduction',
    'tier_downgrade',
    'annual_prepay',
]);

export const createNegotiationSchema = z.object({
    vendorId: z.string().cuid('Invalid vendor ID'),
    strategy: negotiationStrategySchema,
});

export const updateNegotiationSchema = z.object({
    negotiationId: z.string().cuid('Invalid negotiation ID'),
    subject: z.string().min(1, 'Subject is required').max(200),
    body: z.string().min(1, 'Body is required').max(10000),
    recipientEmail: z.string().email('Invalid recipient email'),
});

export const sendNegotiationSchema = z.object({
    negotiationId: z.string().cuid('Invalid negotiation ID'),
});

// ============================================================================
// GMAIL SCHEMAS
// ============================================================================

export const gmailScanSchema = z.object({
    maxResults: z.coerce.number().int().positive().max(50).optional().default(10),
});

export const gmailComposeSchema = z.object({
    to: z.string().email('Invalid recipient email'),
    subject: z.string().min(1, 'Subject is required').max(200),
    body: z.string().min(1, 'Body is required').max(50000),
});

// ============================================================================
// UPLOAD SCHEMAS
// ============================================================================

export const csvUploadSchema = z.object({
    filename: z.string().regex(/\.csv$/i, 'File must be a CSV'),
});

// ============================================================================
// VENDOR SCHEMAS
// ============================================================================

export const createVendorSchema = z.object({
    name: z.string().min(1, 'Vendor name is required').max(200),
    domain: z.string().url().optional().nullable(),
    category: z.string().max(100).optional().nullable(),
    website: z.string().url().optional().nullable(),
    vendorType: z.enum(['FIXED_PLAN', 'NEGOTIABLE']).optional().default('NEGOTIABLE'),
});

export const updateVendorSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    domain: z.string().url().optional().nullable(),
    category: z.string().max(100).optional().nullable(),
    website: z.string().url().optional().nullable(),
    vendorType: z.enum(['FIXED_PLAN', 'NEGOTIABLE']).optional(),
});

// ============================================================================
// SAVINGS SCHEMAS
// ============================================================================

export const updateSavingsSchema = z.object({
    negotiationId: z.string().cuid('Invalid negotiation ID'),
    estimatedAmount: z.coerce.number().nonnegative().optional(),
    confirmedAmount: z.coerce.number().nonnegative().optional(),
    notes: z.string().max(1000).optional().nullable(),
});

// ============================================================================
// VALIDATION HELPER
// ============================================================================

export type ValidationResult<T> = 
    | { success: true; data: T }
    | { success: false; error: string; details?: z.ZodError['errors'] };

/**
 * Validate request body against a Zod schema
 */
export function validateBody<T extends z.ZodSchema>(
    body: unknown,
    schema: T
): ValidationResult<z.infer<T>> {
    const result = schema.safeParse(body);
    
    if (result.success) {
        return { success: true, data: result.data };
    }
    
    return {
        success: false,
        error: result.error.errors[0]?.message || 'Validation failed',
        details: result.error.errors,
    };
}

/**
 * Validate search params against a Zod schema
 */
export function validateSearchParams<T extends z.ZodSchema>(
    searchParams: URLSearchParams,
    schema: T
): ValidationResult<z.infer<T>> {
    const params: Record<string, string> = {};
    searchParams.forEach((value, key) => {
        params[key] = value;
    });
    
    return validateBody(params, schema);
}
