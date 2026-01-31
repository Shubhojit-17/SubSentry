'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

interface Vendor {
    id: string;
    name: string;
    category: string | null;
    isSaaS: boolean;
    totalSpend: number;
    monthlySpend: number;
    transactionCount: number;
    frequency: string;
    renewalDateFormatted: string | null;
    daysUntilRenewal: number | null;
    isUrgent: boolean;
    urgencyLabel: { label: string; color: string } | null;
    lastNegotiation: { status: string } | null;
}

export default function VendorsPage() {
    const { status } = useSession();
    const router = useRouter();
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [filter, setFilter] = useState<'all' | 'saas' | 'urgent'>('saas');
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    useEffect(() => {
        if (status === 'authenticated') {
            fetchVendors();
        }
    }, [status, filter]);

    const fetchVendors = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/vendors?filter=${filter}`);
            if (response.ok) {
                const data = await response.json();
                setVendors(data.vendors);
            }
        } catch (error) {
            console.error('Failed to fetch vendors:', error);
        } finally {
            setLoading(false);
        }
    };

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

    const filteredVendors = vendors.filter(v =>
        v.name.toLowerCase().includes(search.toLowerCase()) ||
        v.category?.toLowerCase().includes(search.toLowerCase())
    );

    if (status === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="spinner w-8 h-8" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0f]">
            <Navbar />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Vendors</h1>
                        <p className="text-gray-400 mt-1">Manage your SaaS subscriptions and renewals</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="relative flex-1 max-w-md">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search vendors..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="input pl-10"
                        />
                    </div>

                    <div className="flex gap-2">
                        {(['saas', 'urgent', 'all'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
                            >
                                {f === 'saas' ? 'SaaS Only' : f === 'urgent' ? 'Urgent' : 'All'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="card flex items-center justify-center py-12">
                        <div className="spinner w-8 h-8" />
                    </div>
                ) : filteredVendors.length > 0 ? (
                    <div className="card p-0 overflow-hidden">
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Vendor</th>
                                        <th>Category</th>
                                        <th>Monthly Spend</th>
                                        <th>Frequency</th>
                                        <th>Renewal</th>
                                        <th>Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredVendors.map((vendor) => (
                                        <tr key={vendor.id}>
                                            <td>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 bg-primary-500/10 rounded-lg flex items-center justify-center">
                                                        <span className="text-primary-400 font-medium text-sm">
                                                            {vendor.name.charAt(0).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-white">{vendor.name}</p>
                                                        {vendor.isSaaS && (
                                                            <span className="text-xs text-primary-400">SaaS</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="text-gray-400">{vendor.category || '—'}</td>
                                            <td className="text-white font-medium">
                                                {formatCurrency(vendor.monthlySpend)}
                                            </td>
                                            <td className="text-gray-400 capitalize">{vendor.frequency}</td>
                                            <td>
                                                {vendor.urgencyLabel ? (
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`badge ${getColorClass(vendor.urgencyLabel.color)}`}>
                                                            {vendor.urgencyLabel.label}
                                                        </span>
                                                        {vendor.renewalDateFormatted && (
                                                            <span className="text-xs text-gray-500">
                                                                {vendor.renewalDateFormatted}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-500">—</span>
                                                )}
                                            </td>
                                            <td>
                                                {vendor.lastNegotiation ? (
                                                    <span className={`badge ${vendor.lastNegotiation.status === 'sent'
                                                            ? 'badge-success'
                                                            : 'badge-info'
                                                        }`}>
                                                        {vendor.lastNegotiation.status}
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
                ) : (
                    <div className="card text-center py-12">
                        <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-white mb-2">No vendors found</h3>
                        <p className="text-gray-400">
                            {search ? 'Try a different search term' : 'Upload a CSV to see your vendors here'}
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}
