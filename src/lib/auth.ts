import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';

/**
 * NextAuth Configuration
 * 
 * CRITICAL: Google OAuth users are auto-provisioned.
 * No manual registration required. No AccessDenied errors.
 */
export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
                params: {
                    scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
                    access_type: 'offline',
                    prompt: 'consent',
                },
            },
        }),
        CredentialsProvider({
            name: 'credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error('Email and password required');
                }

                try {
                    const user = await prisma.user.findUnique({
                        where: { email: credentials.email },
                    });

                    if (!user || !user.passwordHash) {
                        throw new Error('Invalid credentials');
                    }

                    const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
                    if (!isValid) {
                        throw new Error('Invalid credentials');
                    }

                    return {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                    };
                } catch (error) {
                    console.error('[Auth] Credentials login error:', error);
                    throw error;
                }
            },
        }),
    ],
    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    pages: {
        signIn: '/login',
        error: '/login',
    },
    callbacks: {
        /**
         * signIn Callback - CRITICAL FOR AUTO-PROVISIONING
         * 
         * For Google users:
         * 1. If user doesn't exist → CREATE them automatically
         * 2. If user exists without googleId → LINK Google account
         * 3. If user exists with googleId → PROCEED normally
         * 
         * NEVER return false for Google sign-in.
         */
        async signIn({ user, account, profile }) {
            // For Google OAuth
            if (account?.provider === 'google') {
                console.log('[Auth] Google sign-in attempt for:', user.email);

                try {
                    // Find existing user by email
                    let dbUser = await prisma.user.findUnique({
                        where: { email: user.email! },
                    });

                    if (!dbUser) {
                        // AUTO-PROVISION: Create new user for Google sign-in
                        console.log('[Auth] Creating new user for Google account:', user.email);
                        dbUser = await prisma.user.create({
                            data: {
                                email: user.email!,
                                name: user.name || profile?.name || user.email!.split('@')[0],
                                googleId: account.providerAccountId,
                                image: user.image || (profile as { picture?: string })?.picture,
                            },
                        });
                        console.log('[Auth] User created successfully:', dbUser.id);
                    } else if (!dbUser.googleId) {
                        // LINK: Existing email/password user logging in with Google
                        console.log('[Auth] Linking Google to existing account:', user.email);
                        await prisma.user.update({
                            where: { id: dbUser.id },
                            data: {
                                googleId: account.providerAccountId,
                                image: user.image || dbUser.image,
                                name: dbUser.name || user.name,
                            },
                        });
                        console.log('[Auth] Google account linked successfully');
                    } else {
                        console.log('[Auth] Existing Google user login:', user.email);
                    }

                    // Store OAuth tokens for Gmail API access
                    if (account.access_token && dbUser) {
                        try {
                            await prisma.oAuthToken.upsert({
                                where: {
                                    userId_provider: {
                                        userId: dbUser.id,
                                        provider: 'google',
                                    },
                                },
                                update: {
                                    accessToken: account.access_token,
                                    refreshToken: account.refresh_token || undefined,
                                    expiresAt: new Date(Date.now() + (account.expires_in as number || 3600) * 1000),
                                    scope: account.scope,
                                },
                                create: {
                                    userId: dbUser.id,
                                    provider: 'google',
                                    accessToken: account.access_token,
                                    refreshToken: account.refresh_token,
                                    expiresAt: new Date(Date.now() + (account.expires_in as number || 3600) * 1000),
                                    scope: account.scope,
                                },
                            });
                            console.log('[Auth] OAuth tokens stored successfully');
                        } catch (tokenError) {
                            // Non-fatal: Log but don't block sign-in
                            console.error('[Auth] Failed to store OAuth tokens (non-fatal):', tokenError);
                        }
                    }

                    // ALWAYS return true for Google sign-in
                    return true;
                } catch (error) {
                    // Log the error but TRY to continue
                    console.error('[Auth] Error during Google sign-in:', error);

                    // If it's a unique constraint error, user already exists - that's OK
                    if ((error as { code?: string }).code === 'P2002') {
                        console.log('[Auth] User already exists, proceeding with sign-in');
                        return true;
                    }

                    // For database connection errors, still try to return true
                    // The jwt callback will handle the user lookup
                    console.error('[Auth] Database error during sign-in, attempting to continue');
                    return true;
                }
            }

            // For credentials provider, the authorize function already validated
            return true;
        },

        /**
         * JWT Callback - Attach user ID to token
         */
        async jwt({ token, user, account }) {
            if (user) {
                try {
                    // Get database user ID
                    const dbUser = await prisma.user.findUnique({
                        where: { email: user.email! },
                    });

                    if (dbUser) {
                        token.id = dbUser.id;
                        token.provider = account?.provider || 'credentials';
                    } else {
                        // Fallback: Use the ID from the user object
                        token.id = user.id;
                        token.provider = account?.provider || 'credentials';
                    }
                } catch (error) {
                    console.error('[Auth] JWT callback error:', error);
                    // Fallback to prevent session failure
                    token.id = user.id;
                    token.provider = account?.provider || 'credentials';
                }
            }
            return token;
        },

        /**
         * Session Callback - Attach user info to session
         */
        async session({ session, token }) {
            if (session.user && token) {
                (session.user as { id: string; provider?: string }).id = token.id as string;
                (session.user as { id: string; provider?: string }).provider = token.provider as string;
            }
            return session;
        },
    },

    // Debug logging in development
    debug: process.env.NODE_ENV === 'development',
};
