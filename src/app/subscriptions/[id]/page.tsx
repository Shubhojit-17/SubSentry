'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

interface SubscriptionDetail {
    id: string;
    vendorId: string;
    vendorName: string;
    vendorDomain: string | null;
    vendorLogo: string | null;
    vendorCategory: string | null;
    vendorWebsite: string | null;
    source: string;
    renewalDate: string | null;
    billingCycle: string | null;
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
}

export default function SubscriptionDetailPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const params = useParams();
    const [subscription, setSubscription] = useState<SubscriptionDetail | null>(null);
    const [emailContext, setEmailContext] = useState<EmailContext | null>(null);
    const [alternatives, setAlternatives] = useState<Alternative[]>([]);
    const [loading, setLoading] = useState(true);
    const [researching, setResearching] = useState(false);
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
        } catch (err) {
            setError('Failed to load subscription');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleResearchAlternatives = async () => {
        if (!subscription) return;

        try {
            setResearching(true);
            const res = await fetch('/api/research', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendorId: subscription.vendorId,
                    vendorName: subscription.vendorName,
                    category: subscription.vendorCategory,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to research');
            }

            const data = await res.json();
            setAlternatives(data.alternatives);
        } catch (err) {
            console.error('Research error:', err);
            setError(err instanceof Error ? err.message : 'Failed to research alternatives');
        } finally {
            setResearching(false);
        }
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
                                <h1 className="text-2xl font-bold text-white">{subscription.vendorName}</h1>
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
                        <div className="flex gap-2">
                            <button
                                onClick={handleResearchAlternatives}
                                disabled={researching}
                                className="btn btn-secondary flex items-center gap-2"
                            >
                                {researching ? (
                                    <>
                                        <div className="spinner w-4 h-4" />
                                        Researching...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        Research Alternatives
                                    </>
                                )}
                            </button>
                            <Link
                                href={`/negotiate?vendorId=${subscription.vendorId}`}
                                className="btn btn-primary"
                            >
                                Negotiate
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                    <div className="card p-6">
                        <h3 className="text-gray-400 text-sm mb-4">Subscription Details</h3>
                        <dl className="space-y-4">
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

                {/* Alternatives */}
                {alternatives.length > 0 && (
                    <div className="card p-6">
                        <h3 className="text-gray-400 text-sm mb-4">Alternative Tools</h3>
                        <div className="space-y-4">
                            {alternatives.map((alt, idx) => (
                                <div key={idx} className="bg-dark-lighter rounded-lg p-4">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h4 className="text-white font-medium">{alt.name}</h4>
                                            <p className="text-gray-500 text-sm">{alt.category}</p>
                                        </div>
                                        <span className="text-primary font-mono text-sm">{alt.priceRange}</span>
                                    </div>
                                    <p className="text-gray-400 text-sm mt-2">{alt.bestFor}</p>
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {alt.strengths.map((s, i) => (
                                            <span key={i} className="px-2 py-1 bg-dark rounded text-xs text-gray-400">
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                    <a
                                        href={alt.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:text-primary-light text-sm mt-3 inline-block"
                                    >
                                        Visit Website →
                                    </a>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
