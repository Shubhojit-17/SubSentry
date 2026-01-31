/**
 * Email Service
 * Primary: Gmail API (for authenticated users)
 * Fallback: SMTP via Nodemailer
 */

import nodemailer from 'nodemailer';
import { sendGmailEmail, hasGmailConnected, GmailSendResult } from './gmail';

export interface EmailOptions {
    to: string;
    subject: string;
    body: string;
    from?: string;
}

export interface EmailResult {
    success: boolean;
    messageId?: string;
    error?: string;
    method?: 'gmail' | 'smtp';
}

/**
 * Create SMTP transporter based on environment config
 */
function createTransporter() {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
        throw new Error('SMTP credentials not configured');
    }

    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
            user,
            pass,
        },
    });
}

/**
 * Send email via SMTP (fallback method)
 */
async function sendViaSMTP(options: EmailOptions): Promise<EmailResult> {
    try {
        const transporter = createTransporter();
        const from = options.from || process.env.SMTP_FROM || process.env.SMTP_USER;

        const info = await transporter.sendMail({
            from,
            to: options.to,
            subject: options.subject,
            text: options.body,
            html: options.body.replace(/\n/g, '<br>'),
        });

        return {
            success: true,
            messageId: info.messageId,
            method: 'smtp',
        };
    } catch (error) {
        console.error('SMTP send error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown SMTP error',
            method: 'smtp',
        };
    }
}

/**
 * Send email - tries Gmail API first, falls back to SMTP
 * @param options Email options (to, subject, body, from)
 * @param userId Optional user ID for Gmail API authentication
 */
export async function sendEmail(options: EmailOptions, userId?: string): Promise<EmailResult> {
    // Try Gmail API first if user is authenticated
    if (userId) {
        const hasGmail = await hasGmailConnected(userId);
        if (hasGmail) {
            const gmailResult: GmailSendResult = await sendGmailEmail(userId, options);
            if (gmailResult.success) {
                return {
                    success: true,
                    messageId: gmailResult.messageId,
                    method: 'gmail',
                };
            }
            console.warn('Gmail send failed, falling back to SMTP:', gmailResult.error);
        }
    }

    // Fallback to SMTP
    if (isEmailConfigured()) {
        return sendViaSMTP(options);
    }

    return {
        success: false,
        error: 'No email method available. Configure Gmail OAuth or SMTP.',
    };
}

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Check if SMTP is configured
 */
export function isEmailConfigured(): boolean {
    return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Check if any email method is available
 */
export async function isAnyEmailMethodAvailable(userId?: string): Promise<boolean> {
    if (userId) {
        const hasGmail = await hasGmailConnected(userId);
        if (hasGmail) return true;
    }
    return isEmailConfigured();
}
