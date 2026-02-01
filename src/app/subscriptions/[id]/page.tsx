'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import IntelligenceCard from '@/components/IntelligenceCard';
import AlternativesPanel from '@/components/AlternativesPanel';

interface SubscriptionDetail {
    id: string;
    vendorId: string;
    vendorName: string;
    vendorDomain: string | null;
    vendorLogo: string | null;
    vendorCategory: string | null;
    vendorWebsite: string | null;
    vendorType?: 'FIXED_PLAN' | 'NEGOTIABLE';
    source: string;
    renewalDate: string | null;
    billingCycle: string | null;
    plan: string | null;
    seats: number | null;
    amount: number | null;
    currency: string;
    confidenceScore: string;
    status: string;
    notes: string | null;
    lastDetectedAt: string;
    createdAt: string;
}

interface EmailContext {
    subject: string | null;
    sender: string | null;
    snippet: string | null;
    date: string | null;
}

interface Alternative {
    name: string;
    website: string;
    priceRange: string;
    category: string;
    strengths: string[];
    bestFor: string;
    whyBetter: string;
}

interface Intelligence {
    id: string;
    subscriptionId: string;
    vendorId: string;
    vendorType: 'FIXED_PLAN' | 'NEGOTIABLE';
    valueSummary: string;
    assumptions: string[];
    alternatives: Alternative[];
    negotiationEmail: string | null;
    negotiationSubject: string | null;
    analyzedAt: string;
    regeneratedAt: string | null;
}

export default function SubscriptionDetailPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const params = useParams();
    const [subscription, setSubscription] = useState<SubscriptionDetail | null>(null);
    const [emailContext, setEmailContext] = useState<EmailContext | null>(null);
    const [intelligence, setIntelligence] = useState<Intelligence | null>(null);
    const [loading, setLoading] = useState(true);
    const [intelligenceLoading, setIntelligenceLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    useEffect(() => {
        if (status === 'authenticated' && params.id) {
            fetchSubscription();
        }
    }, [status, params.id]);

    const fetchSubscription = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/subscriptions/${params.id}`);
            if (!res.ok) {
                if (res.status === 404) {
                    router.push('/subscriptions');
                    return;
                }
                throw new Error('Failed to fetch');
            }
            const data = await res.json();
            setSubscription(data.subscription);
            setEmailContext(data.emailContext);

            // Fetch cached intelligence (non-blocking)
            fetchIntelligence(data.subscription.id, false);
        } catch (err) {
            setError('Failed to load subscription');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchIntelligence = async (subscriptionId: string, forceRegenerate: boolean) => {
        try {
            setIntelligenceLoading(true);

            const url = forceRegenerate
                ? '/api/intelligence'
                : `/api/intelligence?subscriptionId=${subscriptionId}`;

            const res = await fetch(url, {
                method: forceRegenerate ? 'POST' : 'GET',
                headers: forceRegenerate ? { 'Content-Type': 'application/json' } : undefined,
                body: forceRegenerate ? JSON.stringify({ subscriptionId }) : undefined,
            });

            if (res.ok) {
                const data = await res.json();
                setIntelligence(data);
            }
        } catch (err) {
            console.error('Failed to fetch intelligence:', err);
        } finally {
            setIntelligenceLoading(false);
        }
    };

    const handleReanalyze = async () => {
        if (!subscription) return;
        await fetchIntelligence(subscription.id, true);
    };

    const formatCurrency = (amount: number | null, currency: string) => {
        if (amount === null) return '—';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
        }).format(amount);
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });
    };

    if (status === 'loading' || loading) {
        return (
            <div className="min-h-screen bg-dark">
                <Navbar />
                <div className="max-w-4xl mx-auto px-4 py-8">
                    <div className="flex items-center justify-center h-64">
                        <div className="spinner w-8 h-8" />
                    </div>
                </div>
            </div>
        );
    }

    if (!subscription) {
        return null;
    }

    const vendorType = intelligence?.vendorType || 'NEGOTIABLE';

    return (
        <div className="min-h-screen bg-dark">
            <Navbar />
            <main className="max-w-4xl mx-auto px-4 py-8">
                {/* Breadcrumb */}
                <div className="mb-6">
                    <Link href="/subscriptions" className="text-gray-400 hover:text-white text-sm">
                        ← Back to Subscriptions
                    </Link>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-6">
                        {error}
                    </div>
                )}

                {/* Header */}
                <div className="card p-6 mb-6">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            {subscription.vendorLogo ? (
                                <img src={subscription.vendorLogo} alt="" className="w-16 h-16 rounded-lg" />
                            ) : (
                                <div className="w-16 h-16 rounded-lg bg-primary/20 flex items-center justify-center text-primary text-2xl font-bold">
                                    {subscription.vendorName.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-2xl font-bold text-white">{subscription.vendorName}</h1>
                                    {intelligence && (
                                        <span
                                            className={`px-2 py-1 text-xs font-medium rounded-full ${vendorType === 'NEGOTIABLE'
                                                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                }`}
                                        >
                                            {vendorType === 'NEGOTIABLE' ? '💰 Negotiable' : '📋 Fixed Plan'}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-gray-400">
                                    {subscription.vendorCategory && (
                                        <span>{subscription.vendorCategory}</span>
                                    )}
                                    {subscription.vendorDomain && (
                                        <span>• {subscription.vendorDomain}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        {/* Show Negotiate button only for NEGOTIABLE vendors */}
                        {vendorType === 'NEGOTIABLE' && (
                            <Link
                                href={`/negotiate/${subscription.vendorId}?subscriptionId=${subscription.id}`}
                                className="btn btn-primary"
                            >
                                💬 Negotiate
                            </Link>
                        )}
                    </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                    <div className="card p-6">
                        <h3 className="text-gray-400 text-sm mb-4">Subscription Details</h3>
                        <dl className="space-y-4">
                            <div>
                                <dt className="text-gray-500 text-sm">Plan</dt>
                                <dd className="text-white text-lg">{subscription.plan || '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500 text-sm">Seats</dt>
                                <dd className="text-white text-lg">{subscription.seats || '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500 text-sm">Renewal Date</dt>
                                <dd className="text-white text-lg">{formatDate(subscription.renewalDate)}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500 text-sm">Amount</dt>
                                <dd className="text-white text-lg font-mono">
                                    {formatCurrency(subscription.amount, subscription.currency)}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-500 text-sm">Billing Cycle</dt>
                                <dd className="text-white capitalize">{subscription.billingCycle || '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500 text-sm">Status</dt>
                                <dd className="text-white capitalize">{subscription.status}</dd>
                            </div>
                        </dl>
                    </div>

                    <div className="card p-6">
                        <h3 className="text-gray-400 text-sm mb-4">Detection Info</h3>
                        <dl className="space-y-4">
                            <div>
                                <dt className="text-gray-500 text-sm">Source</dt>
                                <dd className="text-white capitalize">{subscription.source}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500 text-sm">Confidence</dt>
                                <dd className="text-white capitalize">{subscription.confidenceScore}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500 text-sm">Last Detected</dt>
                                <dd className="text-white">{formatDate(subscription.lastDetectedAt)}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500 text-sm">First Added</dt>
                                <dd className="text-white">{formatDate(subscription.createdAt)}</dd>
                            </div>
                        </dl>
                    </div>
                </div>

                {/* AI Intelligence Card */}
                {intelligence ? (
                    <div className="mb-6">
                        <IntelligenceCard
                            vendorType={intelligence.vendorType}
                            valueSummary={intelligence.valueSummary}
                            assumptions={intelligence.assumptions}
                            analyzedAt={intelligence.analyzedAt}
                            regeneratedAt={intelligence.regeneratedAt}
                            onReanalyze={handleReanalyze}
                            isLoading={intelligenceLoading}
                        />
                    </div>
                ) : intelligenceLoading ? (
                    <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 mb-6">
                        <div className="flex items-center gap-3">
                            <div className="spinner w-5 h-5" />
                            <span className="text-gray-400">Generating AI analysis...</span>
                        </div>
                    </div>
                ) : null}

                {/* Alternatives Panel */}
                {intelligence && intelligence.alternatives.length > 0 && (
                    <div className="mb-6">
                        <AlternativesPanel
                            alternatives={intelligence.alternatives}
                            currentVendor={subscription.vendorName}
                            currentAmount={subscription.amount}
                        />
                    </div>
                )}

                {/* Email Context */}
                {emailContext && (
                    <div className="card p-6 mb-6">
                        <h3 className="text-gray-400 text-sm mb-4">Source Email</h3>
                        <div className="bg-dark-lighter rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-gray-400 text-sm">{emailContext.sender}</span>
                                <span className="text-gray-500 text-sm">{formatDate(emailContext.date)}</span>
                            </div>
                            <h4 className="text-white font-medium mb-2">{emailContext.subject}</h4>
                            <p className="text-gray-400 text-sm">{emailContext.snippet}</p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
