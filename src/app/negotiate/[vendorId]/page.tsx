'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

type Strategy = 'seat_reduction' | 'tier_downgrade' | 'annual_prepay';

interface NegotiationDraft {
    id: string;
    vendorName: string;
    strategy: Strategy;
    strategyName: string;
    subject: string;
    body: string;
    renewalDate: string | null;
    monthlySpend: number;
    status: string;
}

const strategies: { id: Strategy; name: string; description: string; icon: string }[] = [
    {
        id: 'seat_reduction',
        name: 'Seat Reduction',
        description: 'Request fewer licenses based on actual utilization',
        icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    },
    {
        id: 'tier_downgrade',
        name: 'Tier Downgrade',
        description: 'Explore lower-cost tier options that match your needs',
        icon: 'M19 9l-7 7-7-7',
    },
    {
        id: 'annual_prepay',
        name: 'Annual Prepay',
        description: 'Offer annual payment upfront in exchange for a discount',
        icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
];

export default function NegotiatePage() {
    const { status } = useSession();
    const router = useRouter();
    const params = useParams();
    const vendorId = params.vendorId as string;

    const [step, setStep] = useState<'strategy' | 'draft' | 'send'>('strategy');
    const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
    const [draft, setDraft] = useState<NegotiationDraft | null>(null);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [recipientEmail, setRecipientEmail] = useState('');
    const [approved, setApproved] = useState(false);
    const [estimatedSavings, setEstimatedSavings] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    const generateDraft = async (strategy: Strategy) => {
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/negotiate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vendorId, strategy }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to generate draft');
                return;
            }

            setDraft(data);
            setSubject(data.subject);
            setBody(data.body);
            setStep('draft');
        } catch {
            setError('Failed to generate draft. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async () => {
        if (!approved) {
            setError('You must approve the email before sending');
            return;
        }

        if (!recipientEmail) {
            setError('Recipient email is required');
            return;
        }

        setSending(true);
        setError('');

        try {
            // First update the draft
            await fetch('/api/negotiate', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    negotiationId: draft?.id,
                    subject,
                    body,
                    recipientEmail,
                }),
            });

            // Then send the email
            const sendResponse = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    negotiationId: draft?.id,
                    recipientEmail,
                    approved: true,
                    estimatedSavings: estimatedSavings ? parseFloat(estimatedSavings) : 0,
                }),
            });

            const sendData = await sendResponse.json();

            if (!sendResponse.ok) {
                setError(sendData.error || 'Failed to send email');
                return;
            }

            setSuccess(true);
        } catch {
            setError('Failed to send email. Please try again.');
        } finally {
            setSending(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    if (status === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="spinner w-8 h-8" />
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen bg-[#0a0a0f]">
                <Navbar />
                <main className="max-w-2xl mx-auto px-4 py-16 text-center">
                    <div className="w-20 h-20 bg-accent-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Email Sent Successfully!</h1>
                    <p className="text-gray-400 mb-8">
                        Your negotiation email has been sent to {recipientEmail}
                    </p>
                    <div className="flex gap-4 justify-center">
                        <Link href="/negotiations" className="btn btn-primary">
                            View Negotiations
                        </Link>
                        <Link href="/vendors" className="btn btn-secondary">
                            Back to Vendors
                        </Link>
                    </div>
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
                    <Link href="/vendors" className="text-gray-400 hover:text-white text-sm mb-4 inline-flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Vendors
                    </Link>
                    <h1 className="text-2xl font-bold text-white mt-2">
                        {draft?.vendorName ? `Negotiate with ${draft.vendorName}` : 'Start Negotiation'}
                    </h1>
                    {draft && (
                        <p className="text-gray-400 mt-1">
                            Monthly spend: {formatCurrency(draft.monthlySpend)}
                            {draft.renewalDate && ` • Renewal: ${new Date(draft.renewalDate).toLocaleDateString()}`}
                        </p>
                    )}
                </div>

                {/* Step Indicator */}
                <div className="flex items-center gap-4 mb-8">
                    {['strategy', 'draft', 'send'].map((s, i) => (
                        <div key={s} className="flex items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === s
                                    ? 'bg-primary-500 text-white'
                                    : i < ['strategy', 'draft', 'send'].indexOf(step)
                                        ? 'bg-accent-500 text-white'
                                        : 'bg-gray-800 text-gray-500'
                                }`}>
                                {i + 1}
                            </div>
                            {i < 2 && (
                                <div className={`w-16 h-0.5 mx-2 ${i < ['strategy', 'draft', 'send'].indexOf(step)
                                        ? 'bg-accent-500'
                                        : 'bg-gray-800'
                                    }`} />
                            )}
                        </div>
                    ))}
                </div>

                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-6">
                        <p className="text-red-400 text-sm">{error}</p>
                    </div>
                )}

                {/* Step 1: Strategy Selection */}
                {step === 'strategy' && (
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-white mb-4">Choose Negotiation Strategy</h2>
                        <div className="grid gap-4">
                            {strategies.map((strategy) => (
                                <button
                                    key={strategy.id}
                                    onClick={() => {
                                        setSelectedStrategy(strategy.id);
                                        generateDraft(strategy.id);
                                    }}
                                    disabled={loading}
                                    className={`card card-hover text-left flex items-start gap-4 ${loading && selectedStrategy === strategy.id ? 'opacity-50' : ''
                                        }`}
                                >
                                    <div className="w-12 h-12 bg-primary-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <svg className="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={strategy.icon} />
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-medium text-white">{strategy.name}</h3>
                                        <p className="text-sm text-gray-400 mt-1">{strategy.description}</p>
                                    </div>
                                    {loading && selectedStrategy === strategy.id && (
                                        <div className="spinner" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 2: Edit Draft */}
                {step === 'draft' && draft && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-white">Edit Your Email</h2>
                            <span className="badge badge-info">{draft.strategyName}</span>
                        </div>

                        <div className="card space-y-4">
                            <div>
                                <label className="label">Subject</label>
                                <input
                                    type="text"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    className="input"
                                />
                            </div>

                            <div>
                                <label className="label">Email Body</label>
                                <textarea
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    rows={12}
                                    className="input font-mono text-sm"
                                />
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setStep('strategy')}
                                className="btn btn-secondary"
                            >
                                Back
                            </button>
                            <button
                                onClick={() => setStep('send')}
                                className="btn btn-primary"
                            >
                                Continue to Send
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Send */}
                {step === 'send' && draft && (
                    <div className="space-y-6">
                        <h2 className="text-lg font-semibold text-white">Review & Send</h2>

                        {/* Preview */}
                        <div className="card">
                            <h3 className="text-sm font-medium text-gray-400 mb-2">Preview</h3>
                            <div className="bg-[#0a0a0f] rounded-lg p-4">
                                <p className="text-white font-medium mb-2">Subject: {subject}</p>
                                <div className="text-gray-300 whitespace-pre-wrap text-sm">
                                    {body}
                                </div>
                            </div>
                        </div>

                        {/* Send Form */}
                        <div className="card space-y-4">
                            <div>
                                <label className="label">Recipient Email *</label>
                                <input
                                    type="email"
                                    value={recipientEmail}
                                    onChange={(e) => setRecipientEmail(e.target.value)}
                                    className="input"
                                    placeholder="vendor@company.com"
                                />
                            </div>

                            <div>
                                <label className="label">Estimated Savings (optional)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                                    <input
                                        type="number"
                                        value={estimatedSavings}
                                        onChange={(e) => setEstimatedSavings(e.target.value)}
                                        className="input pl-7"
                                        placeholder="0"
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Track potential savings from this negotiation
                                </p>
                            </div>

                            {/* Approval Gate */}
                            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={approved}
                                        onChange={(e) => setApproved(e.target.checked)}
                                        className="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-800 text-primary-500 focus:ring-primary-500"
                                    />
                                    <div>
                                        <p className="font-medium text-yellow-400">Approval Required</p>
                                        <p className="text-sm text-gray-400 mt-1">
                                            I confirm that I have reviewed the email content and authorize sending this message to the vendor.
                                        </p>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setStep('draft')}
                                className="btn btn-secondary"
                            >
                                Back to Edit
                            </button>
                            <button
                                onClick={handleSend}
                                disabled={!approved || !recipientEmail || sending}
                                className="btn btn-accent flex items-center gap-2"
                            >
                                {sending ? (
                                    <>
                                        <div className="spinner" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                        </svg>
                                        Send Email
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
