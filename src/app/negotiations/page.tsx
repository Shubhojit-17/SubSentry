'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

interface Negotiation {
    id: string;
    vendorId: string;
    vendorName: string;
    strategy: string;
    strategyName: string;
    status: string;
    renewalDate: string | null;
    sentAt: string | null;
    createdAt: string;
    estimatedSavings: number;
    confirmedSavings: number;
}

export default function NegotiationsPage() {
    const { status } = useSession();
    const router = useRouter();
    const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('');

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    useEffect(() => {
        if (status === 'authenticated') {
            fetchNegotiations();
        }
    }, [status, filter]);

    const fetchNegotiations = async () => {
        setLoading(true);
        try {
            const params = filter ? `?status=${filter}` : '';
            const response = await fetch(`/api/negotiate${params}`);
            if (response.ok) {
                const data = await response.json();
                setNegotiations(data.negotiations);
            }
        } catch (error) {
            console.error('Failed to fetch negotiations:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    const getStatusBadge = (status: string) => {
        const badges: Record<string, string> = {
            draft: 'badge-info',
            approved: 'badge-warning',
            sent: 'badge-success',
            responded: 'badge-success',
            closed: 'badge-info',
        };
        return badges[status] || 'badge-info';
    };

    if (status === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="spinner w-8 h-8" />
            </div>
        );
    }

    const totalEstimated = negotiations.reduce((sum, n) => sum + n.estimatedSavings, 0);
    const totalConfirmed = negotiations.reduce((sum, n) => sum + n.confirmedSavings, 0);

    return (
        <div className="min-h-screen bg-[#0a0a0f]">
            <Navbar />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Negotiations</h1>
                        <p className="text-gray-400 mt-1">Track your vendor negotiations and savings</p>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    <div className="stat-card">
                        <span className="stat-label">Total Negotiations</span>
                        <span className="stat-value">{negotiations.length}</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Estimated Savings</span>
                        <span className="stat-value text-yellow-400">{formatCurrency(totalEstimated)}</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Confirmed Savings</span>
                        <span className="stat-value text-accent-400">{formatCurrency(totalConfirmed)}</span>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex gap-2 mb-6">
                    {['', 'draft', 'sent', 'closed'].map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
                        >
                            {f === '' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Table */}
                {loading ? (
                    <div className="card flex items-center justify-center py-12">
                        <div className="spinner w-8 h-8" />
                    </div>
                ) : negotiations.length > 0 ? (
                    <div className="card p-0 overflow-hidden">
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Vendor</th>
                                        <th>Strategy</th>
                                        <th>Status</th>
                                        <th>Sent</th>
                                        <th>Est. Savings</th>
                                        <th>Confirmed</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {negotiations.map((neg) => (
                                        <tr key={neg.id}>
                                            <td className="font-medium text-white">{neg.vendorName}</td>
                                            <td className="text-gray-400">{neg.strategyName}</td>
                                            <td>
                                                <span className={`badge ${getStatusBadge(neg.status)}`}>
                                                    {neg.status}
                                                </span>
                                            </td>
                                            <td className="text-gray-400">
                                                {neg.sentAt ? formatDate(neg.sentAt) : '—'}
                                            </td>
                                            <td className="text-yellow-400">
                                                {neg.estimatedSavings > 0 ? formatCurrency(neg.estimatedSavings) : '—'}
                                            </td>
                                            <td className="text-accent-400">
                                                {neg.confirmedSavings > 0 ? formatCurrency(neg.confirmedSavings) : '—'}
                                            </td>
                                            <td>
                                                {neg.status === 'draft' ? (
                                                    <Link
                                                        href={`/negotiate/${neg.vendorId}`}
                                                        className="btn btn-primary text-xs py-1.5 px-3"
                                                    >
                                                        Continue
                                                    </Link>
                                                ) : neg.status === 'sent' ? (
                                                    <button className="btn btn-secondary text-xs py-1.5 px-3">
                                                        Log Outcome
                                                    </button>
                                                ) : (
                                                    <span className="text-gray-500 text-sm">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="card text-center py-12">
                        <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-white mb-2">No negotiations yet</h3>
                        <p className="text-gray-400 mb-6">
                            Start by selecting a vendor and initiating a negotiation
                        </p>
                        <Link href="/vendors" className="btn btn-primary">
                            View Vendors
                        </Link>
                    </div>
                )}
            </main>
        </div>
    );
}
