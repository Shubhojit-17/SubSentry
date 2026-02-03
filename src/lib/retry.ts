/**
 * Retry utility with exponential backoff for LLM and external API calls
 */

export interface RetryConfig {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    retryableErrors?: (error: unknown) => boolean;
}

const DEFAULT_CONFIG: RetryConfig = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
};

/**
 * Default function to determine if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
    // Network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
        return true;
    }
    
    // Check for rate limit or server errors in error message
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
            message.includes('rate limit') ||
            message.includes('429') ||
            message.includes('500') ||
            message.includes('502') ||
            message.includes('503') ||
            message.includes('504') ||
            message.includes('timeout') ||
            message.includes('econnreset') ||
            message.includes('network')
        );
    }
    
    return false;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with jitter for better distributed retry behavior
 */
function calculateDelay(
    attempt: number,
    config: RetryConfig
): number {
    const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
    // Add jitter: random value between 0 and 25% of delay
    const jitter = cappedDelay * Math.random() * 0.25;
    return cappedDelay + jitter;
}

/**
 * Execute a function with retry logic and exponential backoff
 * 
 * @param fn - Async function to execute
 * @param config - Retry configuration
 * @returns Result of the function
 * @throws Last error after all retries exhausted
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {}
): Promise<T> {
    const finalConfig: RetryConfig = { ...DEFAULT_CONFIG, ...config };
    const shouldRetry = finalConfig.retryableErrors || isRetryableError;
    
    let lastError: unknown;
    
    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            const isLastAttempt = attempt === finalConfig.maxAttempts;
            const isRetryable = shouldRetry(error);
            
            if (isLastAttempt || !isRetryable) {
                throw error;
            }
            
            const delay = calculateDelay(attempt, finalConfig);
            console.log(
                `[Retry] Attempt ${attempt}/${finalConfig.maxAttempts} failed, ` +
                `retrying in ${Math.round(delay)}ms...`,
                error instanceof Error ? error.message : error
            );
            
            await sleep(delay);
        }
    }
    
    // This should never be reached, but TypeScript needs it
    throw lastError;
}

/**
 * Pre-configured retry for LLM API calls
 */
export function withLLMRetry<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 15000,
        backoffMultiplier: 2,
        retryableErrors: (error) => {
            if (error instanceof Error) {
                const message = error.message.toLowerCase();
                // Don't retry on auth errors or invalid requests
                if (
                    message.includes('401') ||
                    message.includes('403') ||
                    message.includes('invalid') ||
                    message.includes('api key')
                ) {
                    return false;
                }
            }
            return isRetryableError(error);
        },
    });
}

/**
 * Pre-configured retry for Gmail API calls
 */
export function withGmailRetry<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 500,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        retryableErrors: (error) => {
            if (error instanceof Error) {
                const message = error.message.toLowerCase();
                // Don't retry on auth or permission errors
                if (
                    message.includes('401') ||
                    message.includes('403') ||
                    message.includes('invalid_grant') ||
                    message.includes('insufficient')
                ) {
                    return false;
                }
            }
            return isRetryableError(error);
        },
    });
}
