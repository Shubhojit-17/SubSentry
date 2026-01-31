'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import CSVUpload from '@/components/CSVUpload';

interface DashboardData {
    vendors: { total: number; saas: number };
    subscriptions: { total: number; gmail: number; csv: number };
    renewals: { urgent: number; upcoming: Array<{ id: string; vendorName: string; renewalDate: string; amount: number | null }> };
    transactions: { count: number; totalSpend: number };
    negotiations: { total: number; sent: number; draft: number };
    savings: { estimated: number; confirmed: number };
    gmail: { connected: boolean; email?: string; lastScan?: string };
    emailStats: { scanned: number };
}

interface Vendor {
    id: string;
    name: string;
    category: string | null;
    monthlySpend: number;
    daysUntilRenewal: number | null;
    isUrgent: boolean;
    urgencyLabel: { label: string; color: string } | null;
    source?: string;
}

export default function DashboardPage() {
    const { status } = useSession();
    const router = useRouter();
    const [data, setData] = useState<DashboardData | null>(null);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [scanMessage, setScanMessage] = useState('');

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    const fetchData = async () => {
        try {
            const [dashRes, vendorsRes] = await Promise.all([
                fetch('/api/dashboard'),
                fetch('/api/vendors?filter=urgent'),
            ]);

            if (dashRes.ok) {
                setData(await dashRes.json());
            }

            if (vendorsRes.ok) {
                const vendorData = await vendorsRes.json();
                setVendors(vendorData.vendors.slice(0, 5));
            }
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleScanInbox = async () => {
        setScanning(true);
        setScanMessage('');
        try {
            const res = await fetch('/api/gmail/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const result = await res.json();
            if (res.ok) {
                setScanMessage(`Detected ${result.renewalsDetected} renewals from ${result.messagesScanned} emails`);
                fetchData(); // Refresh dashboard data
            } else {
                setScanMessage(result.error || 'Failed to scan inbox');
            }
        } catch {
            setScanMessage('Failed to scan inbox');
        } finally {
            setScanning(false);
        }
    };

    useEffect(() => {
        if (status === 'authenticated') {
            fetchData();
        }
    }, [status]);

    if (status === 'loading' || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="spinner w-8 h-8" />
            </div>
        );
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const getColorClass = (color: string) => {
        const colors: Record<string, string> = {
            red: 'badge-danger',
            orange: 'badge-warning',
            yellow: 'badge-warning',
            green: 'badge-success',
            gray: 'badge-info',
        };
        return colors[color] || 'badge-info';
    };

    return (
        <div className="min-h-screen bg-[#0a0a0f]">
            <Navbar />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-white">Dashboard</h1>
                    <p className="text-gray-400 mt-1">Monitor your SaaS spend and upcoming renewals</p>
                </div>

                {/* Gmail Connection Status */}
                <div className="mb-6">
                    <div className="card p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${data?.gmail?.connected ? 'bg-green-500' : 'bg-gray-500'}`} />
                            <div>
                                <span className="text-white font-medium">Gmail</span>
                                {data?.gmail?.connected ? (
                                    <span className="text-gray-400 text-sm ml-2">
                                        Connected as {data.gmail.email}
                                    </span>
                                ) : (
                                    <span className="text-gray-500 text-sm ml-2">Not connected</span>
                                )}
                            </div>
                        </div>
                        {data?.gmail?.connected && (
                            <button
                                onClick={handleScanInbox}
                                disabled={scanning}
                                className="btn btn-primary text-sm py-2 px-4 flex items-center gap-2"
                            >
                                {scanning ? (
                                    <>
                                        <div className="spinner w-4 h-4" />
                                        Scanning...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        Scan Inbox
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                    {scanMessage && (
                        <div className="mt-2 text-sm text-gray-400">
                            {scanMessage}
                        </div>
                    )}
                </div>

                {/* Stats Grid - Clickable Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <Link href="/vendors" className="stat-card card-hover cursor-pointer">
                        <div className="w-10 h-10 bg-primary-500/10 rounded-lg flex items-center justify-center mb-2">
                            <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        </div>
                        <span className="stat-value">{data?.vendors.total || 0}</span>
                        <span className="stat-label">SaaS Vendors</span>
                        {(data?.subscriptions?.gmail || 0) > 0 && (
                            <span className="text-xs text-gray-500 mt-1">{data?.subscriptions.gmail} from Gmail</span>
                        )}
                    </Link>

                    <Link href="/subscriptions?filter=renewing" className="stat-card card-hover cursor-pointer">
                        <div className="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center mb-2">
                            <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <span className="stat-value">{data?.renewals.urgent || 0}</span>
                        <span className="stat-label">Renewals This Month</span>
                        {(data?.subscriptions?.total || 0) > 0 && (
                            <span className="text-xs text-gray-500 mt-1">{data?.subscriptions.total} total subscriptions</span>
                        )}
                    </Link>

                    <Link href="/negotiations" className="stat-card card-hover cursor-pointer">
                        <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center mb-2">
                            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <span className="stat-value">{data?.negotiations.sent || 0}</span>
                        <span className="stat-label">Emails Sent</span>
                        {(data?.negotiations?.draft || 0) > 0 && (
                            <span className="text-xs text-gray-500 mt-1">{data?.negotiations.draft} drafts</span>
                        )}
                    </Link>

                    <Link href="/subscriptions" className="stat-card card-hover cursor-pointer">
                        <div className="w-10 h-10 bg-accent-500/10 rounded-lg flex items-center justify-center mb-2">
                            <svg className="w-5 h-5 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <span className="stat-value">{formatCurrency(data?.savings.estimated || 0)}</span>
                        <span className="stat-label">Est. Savings</span>
                        {(data?.savings?.confirmed || 0) > 0 && (
                            <span className="text-xs text-green-500 mt-1">{formatCurrency(data?.savings.confirmed || 0)} confirmed</span>
                        )}
                    </Link>
                </div>

                {/* Upload Section */}
                <div className="card mb-8">
                    <h2 className="text-lg font-semibold text-white mb-4">Import Transactions</h2>
                    <CSVUpload onUploadComplete={fetchData} />
                </div>

                {/* Urgent Renewals */}
                {vendors.length > 0 && (
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-white">Upcoming Renewals</h2>
                            <Link href="/vendors" className="text-sm text-primary-400 hover:text-primary-300">
                                View all →
                            </Link>
                        </div>

                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Vendor</th>
                                        <th>Category</th>
                                        <th>Monthly Spend</th>
                                        <th>Renewal</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {vendors.map((vendor) => (
                                        <tr key={vendor.id}>
                                            <td className="font-medium text-white">{vendor.name}</td>
                                            <td className="text-gray-400">{vendor.category || '—'}</td>
                                            <td className="text-white">{formatCurrency(vendor.monthlySpend)}</td>
                                            <td>
                                                {vendor.urgencyLabel ? (
                                                    <span className={`badge ${getColorClass(vendor.urgencyLabel.color)}`}>
                                                        {vendor.urgencyLabel.label}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-500">—</span>
                                                )}
                                            </td>
                                            <td>
                                                <Link
                                                    href={`/negotiate/${vendor.id}`}
                                                    className="btn btn-primary text-xs py-1.5 px-3"
                                                >
                                                    Negotiate
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
                }

                {/* Empty State */}
                {
                    !loading && vendors.length === 0 && !data?.vendors.total && (
                        <div className="card text-center py-12">
                            <div className="w-16 h-16 bg-primary-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-medium text-white mb-2">No data yet</h3>
                            <p className="text-gray-400 mb-6">
                                {data?.gmail?.connected
                                    ? 'Scan your Gmail inbox or upload a CSV to get started'
                                    : 'Upload a CSV of your transactions to get started'}
                            </p>
                        </div>
                    )
                }
            </main >
        </div >
    );
}
