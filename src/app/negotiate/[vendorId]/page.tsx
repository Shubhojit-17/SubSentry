'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import NegotiationEmailEditor from '@/components/NegotiationEmailEditor';

interface SubscriptionInfo {
    id: string;
    vendorName: string;
    vendorCategory: string | null;
    plan: string | null;
    amount: number | null;
    seats: number | null;
    renewalDate: string | null;
    billingCycle: string | null;
}

interface Intelligence {
    vendorType: 'FIXED_PLAN' | 'NEGOTIABLE';
    valueSummary: string;
    negotiationEmail: string | null;
    negotiationSubject: string | null;
    analyzedAt: string;
}

export default function NegotiatePage() {
    const { status } = useSession();
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const vendorId = params.vendorId as string;
    const subscriptionId = searchParams.get('subscriptionId');

    const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
    const [intelligence, setIntelligence] = useState<Intelligence | null>(null);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    useEffect(() => {
        if (status === 'authenticated' && subscriptionId) {
            fetchData();
        }
    }, [status, subscriptionId]);

    const fetchData = async () => {
        try {
            setLoading(true);

            // Fetch subscription
            const subRes = await fetch(`/api/subscriptions/${subscriptionId}`);
            if (subRes.ok) {
                const subData = await subRes.json();
                setSubscription({
                    id: subData.subscription.id,
                    vendorName: subData.subscription.vendorName,
                    vendorCategory: subData.subscription.vendorCategory,
                    plan: subData.subscription.plan,
                    amount: subData.subscription.amount,
                    seats: subData.subscription.seats,
                    renewalDate: subData.subscription.renewalDate,
                    billingCycle: subData.subscription.billingCycle,
                });
            }

            // Fetch cached intelligence (includes negotiation email)
            const intRes = await fetch(`/api/intelligence?subscriptionId=${subscriptionId}`);
            if (intRes.ok) {
                const intData = await intRes.json();
                setIntelligence(intData);

                // Set email content from cached data
                if (intData.negotiationSubject) {
                    setSubject(intData.negotiationSubject);
                }
                if (intData.negotiationEmail) {
                    setBody(intData.negotiationEmail);
                }
            }
        } catch (err) {
            console.error('Failed to fetch data:', err);
            setError('Failed to load negotiation data');
        } finally {
            setLoading(false);
        }
    };

    const handleRegenerate = async () => {
        if (!subscriptionId) return;

        try {
            const res = await fetch('/api/intelligence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscriptionId }),
            });

            if (res.ok) {
                const data = await res.json();
                setIntelligence(data);
                if (data.negotiationSubject) setSubject(data.negotiationSubject);
                if (data.negotiationEmail) setBody(data.negotiationEmail);
            }
        } catch (err) {
            console.error('Failed to regenerate:', err);
        }
    };

    const handleSendViaGmail = async () => {
        try {
            const res = await fetch('/api/gmail/compose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscriptionId,
                    subject,
                    emailBody: body,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                // Open Gmail compose in new window
                window.open(data.composeUrl, '_blank');
            }
        } catch (err) {
            console.error('Failed to open Gmail:', err);
            setError('Failed to open Gmail compose');
        }
    };

    const formatCurrency = (amount: number | null) => {
        if (amount === null) return '—';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });
    };

    if (status === 'loading' || loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0f]">
                <Navbar />
                <div className="max-w-4xl mx-auto px-4 py-8">
                    <div className="flex items-center justify-center h-64">
                        <div className="spinner w-8 h-8" />
                    </div>
                </div>
            </div>
        );
    }

    // Redirect if vendor is not negotiable
    if (intelligence && intelligence.vendorType === 'FIXED_PLAN') {
        return (
            <div className="min-h-screen bg-[#0a0a0f]">
                <Navbar />
                <main className="max-w-2xl mx-auto px-4 py-16 text-center">
                    <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Fixed Plan Vendor</h1>
                    <p className="text-gray-400 mb-8">
                        {subscription?.vendorName || 'This vendor'} has fixed pricing and typically doesn&apos;t negotiate rates.
                        Consider exploring alternatives instead.
                    </p>
                    <Link
                        href={subscriptionId ? `/subscriptions/${subscriptionId}` : '/subscriptions'}
                        className="btn btn-primary"
                    >
                        View Alternatives
                    </Link>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0f]">
            <Navbar />

            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href={subscriptionId ? `/subscriptions/${subscriptionId}` : '/subscriptions'}
                        className="text-gray-400 hover:text-white text-sm mb-4 inline-flex items-center gap-1"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Subscription
                    </Link>
                    <h1 className="text-2xl font-bold text-white mt-2">
                        Negotiate with {subscription?.vendorName || 'Vendor'}
                    </h1>
                </div>

                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-6">
                        <p className="text-red-400 text-sm">{error}</p>
                    </div>
                )}

                {/* Negotiation Readiness Summary */}
                {subscription && (
                    <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 mb-6">
                        <h3 className="text-lg font-semibold text-white mb-4">Negotiation Readiness</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <p className="text-gray-500 text-sm">Current Plan</p>
                                <p className="text-white font-medium">{subscription.plan || '—'}</p>
                            </div>
                            <div>
                                <p className="text-gray-500 text-sm">Amount</p>
                                <p className="text-white font-medium font-mono">
                                    {formatCurrency(subscription.amount)}
                                </p>
                            </div>
                            <div>
                                <p className="text-gray-500 text-sm">Seats</p>
                                <p className="text-white font-medium">{subscription.seats || '—'}</p>
                            </div>
                            <div>
                                <p className="text-gray-500 text-sm">Renewal</p>
                                <p className="text-white font-medium">{formatDate(subscription.renewalDate)}</p>
                            </div>
                        </div>

                        {/* Leverage Indicators */}
                        <div className="mt-4 pt-4 border-t border-gray-700">
                            <p className="text-gray-400 text-sm mb-2">💡 Leverage Points</p>
                            <div className="flex flex-wrap gap-2">
                                {subscription.renewalDate && (
                                    <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded">
                                        Renewal approaching
                                    </span>
                                )}
                                {subscription.seats && subscription.seats >= 5 && (
                                    <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded">
                                        Volume user ({subscription.seats}+ seats)
                                    </span>
                                )}
                                {subscription.billingCycle === 'monthly' && (
                                    <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded">
                                        Can offer annual prepay
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Negotiation Email Editor */}
                <NegotiationEmailEditor
                    subject={subject}
                    body={body}
                    vendorName={subscription?.vendorName || 'Vendor'}
                    onSubjectChange={setSubject}
                    onBodyChange={setBody}
                    onRegenerate={handleRegenerate}
                    onSendViaGmail={handleSendViaGmail}
                    isLoading={loading}
                />
            </main>
        </div>
    );
}
