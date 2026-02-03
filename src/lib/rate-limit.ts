/**
 * Simple in-memory rate limiter for API routes
 * For production, consider using Redis-based solutions like @upstash/ratelimit
 */

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

interface RateLimitConfig {
    windowMs: number;      // Time window in milliseconds
    maxRequests: number;   // Max requests per window
}

// In-memory store (consider Redis for production/multi-instance)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (now > entry.resetTime) {
            rateLimitStore.delete(key);
        }
    }
}, 60000); // Clean up every minute

/**
 * Rate limit configurations for different endpoints
 */
export const RATE_LIMITS = {
    // LLM endpoints - expensive, limit strictly
    negotiate: { windowMs: 60000, maxRequests: 10 },      // 10 per minute
    intelligence: { windowMs: 60000, maxRequests: 20 },   // 20 per minute
    research: { windowMs: 60000, maxRequests: 15 },       // 15 per minute
    
    // Gmail endpoints - API quota sensitive
    gmailScan: { windowMs: 60000, maxRequests: 5 },       // 5 per minute
    gmailCompose: { windowMs: 60000, maxRequests: 10 },   // 10 per minute
    
    // Standard API endpoints
    standard: { windowMs: 60000, maxRequests: 60 },       // 60 per minute
    
    // Auth endpoints - prevent brute force
    auth: { windowMs: 300000, maxRequests: 10 },          // 10 per 5 minutes
} as const;

export type RateLimitType = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetIn: number;  // milliseconds until reset
    limit: number;
}

/**
 * Check and update rate limit for a given identifier
 * @param identifier - Unique identifier (e.g., userId, IP address)
 * @param limitType - Type of rate limit to apply
 * @returns Rate limit check result
 */
export function checkRateLimit(
    identifier: string,
    limitType: RateLimitType = 'standard'
): RateLimitResult {
    const config = RATE_LIMITS[limitType];
    const key = `${limitType}:${identifier}`;
    const now = Date.now();
    
    let entry = rateLimitStore.get(key);
    
    // Create new entry if doesn't exist or window expired
    if (!entry || now > entry.resetTime) {
        entry = {
            count: 0,
            resetTime: now + config.windowMs,
        };
    }
    
    const remaining = Math.max(0, config.maxRequests - entry.count - 1);
    const resetIn = entry.resetTime - now;
    
    // Check if limit exceeded
    if (entry.count >= config.maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            resetIn,
            limit: config.maxRequests,
        };
    }
    
    // Increment counter
    entry.count++;
    rateLimitStore.set(key, entry);
    
    return {
        allowed: true,
        remaining,
        resetIn,
        limit: config.maxRequests,
    };
}

/**
 * Create rate limit headers for response
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': Math.ceil(result.resetIn / 1000).toString(),
    };
}

/**
 * Higher-order function to wrap API handlers with rate limiting
 */
export function withRateLimit<T>(
    handler: (req: Request, context: T) => Promise<Response>,
    limitType: RateLimitType,
    getIdentifier: (req: Request, context: T) => string
) {
    return async (req: Request, context: T): Promise<Response> => {
        const identifier = getIdentifier(req, context);
        const result = checkRateLimit(identifier, limitType);
        
        if (!result.allowed) {
            return new Response(
                JSON.stringify({
                    error: 'Too many requests',
                    retryAfter: Math.ceil(result.resetIn / 1000),
                }),
                {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        ...rateLimitHeaders(result),
                    },
                }
            );
        }
        
        const response = await handler(req, context);
        
        // Add rate limit headers to successful responses
        const headers = new Headers(response.headers);
        Object.entries(rateLimitHeaders(result)).forEach(([key, value]) => {
            headers.set(key, value);
        });
        
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    };
}
