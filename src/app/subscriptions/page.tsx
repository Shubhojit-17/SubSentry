'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

interface Subscription {
    id: string;
    vendorId: string;
    vendorName: string;
    vendorLogo: string | null;
    vendorCategory: string | null;
    source: string;
    renewalDate: string | null;
    billingCycle: string | null;
    amount: number | null;
    currency: string;
    confidenceScore: string;
    status: string;
    lastDetectedAt: string;
}

export default function SubscriptionsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const filter = searchParams.get('filter');

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    useEffect(() => {
        if (status === 'authenticated') {
            fetchSubscriptions();
        }
    }, [status, filter]);

    const fetchSubscriptions = async () => {
        try {
            setLoading(true);
            const url = filter
                ? `/api/subscriptions?filter=${filter}`
                : '/api/subscriptions';
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            setSubscriptions(data.subscriptions);
        } catch (err) {
            setError('Failed to load subscriptions');
            console.error(err);
        } finally {
            setLoading(false);
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
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    const getStatusBadge = (status: string) => {
        const colors: Record<string, string> = {
            active: 'bg-green-500/20 text-green-400',
            cancelled: 'bg-red-500/20 text-red-400',
            pending: 'bg-yellow-500/20 text-yellow-400',
        };
        return colors[status] || 'bg-gray-500/20 text-gray-400';
    };

    const getSourceBadge = (source: string) => {
        const colors: Record<string, string> = {
            gmail: 'bg-blue-500/20 text-blue-400',
            csv: 'bg-purple-500/20 text-purple-400',
            manual: 'bg-gray-500/20 text-gray-400',
        };
        return colors[source] || 'bg-gray-500/20 text-gray-400';
    };

    const getConfidenceBadge = (confidence: string) => {
        const colors: Record<string, string> = {
            high: 'bg-green-500/20 text-green-400',
            medium: 'bg-yellow-500/20 text-yellow-400',
            low: 'bg-red-500/20 text-red-400',
        };
        return colors[confidence] || 'bg-gray-500/20 text-gray-400';
    };

    if (status === 'loading' || loading) {
        return (
            <div className="min-h-screen bg-dark">
                <Navbar />
                <div className="max-w-7xl mx-auto px-4 py-8">
                    <div className="flex items-center justify-center h-64">
                        <div className="spinner w-8 h-8" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-dark">
            <Navbar />
            <main className="max-w-7xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Subscriptions</h1>
                        <p className="text-gray-400 mt-1">
                            {filter === 'renewing'
                                ? 'Subscriptions renewing in the next 30 days'
                                : 'All your detected and tracked subscriptions'}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Link
                            href="/subscriptions"
                            className={`px-4 py-2 rounded-lg text-sm ${!filter
                                    ? 'bg-primary text-white'
                                    : 'bg-dark-lighter text-gray-400 hover:text-white'
                                }`}
                        >
                            All
                        </Link>
                        <Link
                            href="/subscriptions?filter=renewing"
                            className={`px-4 py-2 rounded-lg text-sm ${filter === 'renewing'
                                    ? 'bg-primary text-white'
                                    : 'bg-dark-lighter text-gray-400 hover:text-white'
                                }`}
                        >
                            Renewing Soon
                        </Link>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-6">
                        {error}
                    </div>
                )}

                {subscriptions.length === 0 ? (
                    <div className="card p-12 text-center">
                        <div className="text-gray-400 mb-4">
                            <svg className="w-16 h-16 mx-auto opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </div>
                        <h3 className="text-white text-lg font-medium mb-2">No subscriptions found</h3>
                        <p className="text-gray-500 mb-6">
                            {filter === 'renewing'
                                ? 'No subscriptions are renewing in the next 30 days.'
                                : 'Scan your inbox to detect subscriptions, or add them manually.'}
                        </p>
                        <Link href="/dashboard" className="btn btn-primary">
                            Go to Dashboard
                        </Link>
                    </div>
                ) : (
                    <div className="card overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-dark-lighter">
                                <tr>
                                    <th className="text-left px-6 py-4 text-gray-400 font-medium text-sm">Vendor</th>
                                    <th className="text-left px-6 py-4 text-gray-400 font-medium text-sm">Renewal Date</th>
                                    <th className="text-left px-6 py-4 text-gray-400 font-medium text-sm">Amount</th>
                                    <th className="text-left px-6 py-4 text-gray-400 font-medium text-sm">Cycle</th>
                                    <th className="text-left px-6 py-4 text-gray-400 font-medium text-sm">Source</th>
                                    <th className="text-left px-6 py-4 text-gray-400 font-medium text-sm">Confidence</th>
                                    <th className="text-left px-6 py-4 text-gray-400 font-medium text-sm">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {subscriptions.map((sub) => (
                                    <tr key={sub.id} className="hover:bg-dark-lighter/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {sub.vendorLogo ? (
                                                    <img src={sub.vendorLogo} alt="" className="w-8 h-8 rounded" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary font-bold">
                                                        {sub.vendorName.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="text-white font-medium">{sub.vendorName}</div>
                                                    {sub.vendorCategory && (
                                                        <div className="text-gray-500 text-sm">{sub.vendorCategory}</div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-white">
                                            {formatDate(sub.renewalDate)}
                                        </td>
                                        <td className="px-6 py-4 text-white font-mono">
                                            {formatCurrency(sub.amount, sub.currency)}
                                        </td>
                                        <td className="px-6 py-4 text-gray-400 capitalize">
                                            {sub.billingCycle || '—'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs uppercase ${getSourceBadge(sub.source)}`}>
                                                {sub.source}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs capitalize ${getConfidenceBadge(sub.confidenceScore)}`}>
                                                {sub.confidenceScore}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex gap-2">
                                                <Link
                                                    href={`/subscriptions/${sub.id}`}
                                                    className="text-primary hover:text-primary-light text-sm"
                                                >
                                                    View
                                                </Link>
                                                <Link
                                                    href={`/negotiate?vendorId=${sub.vendorId}`}
                                                    className="text-gray-400 hover:text-white text-sm"
                                                >
                                                    Negotiate
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
}
