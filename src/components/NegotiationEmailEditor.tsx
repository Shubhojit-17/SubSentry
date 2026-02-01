'use client';

import { useState } from 'react';

interface NegotiationEmailEditorProps {
    subject: string;
    body: string;
    vendorName: string;
    onSubjectChange: (subject: string) => void;
    onBodyChange: (body: string) => void;
    onRegenerate: () => Promise<void>;
    onSendViaGmail: () => void;
    isLoading?: boolean;
}

export default function NegotiationEmailEditor({
    subject,
    body,
    vendorName,
    onSubjectChange,
    onBodyChange,
    onRegenerate,
    onSendViaGmail,
    isLoading = false,
}: NegotiationEmailEditorProps) {
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleRegenerate = async () => {
        setIsRegenerating(true);
        try {
            await onRegenerate();
        } finally {
            setIsRegenerating(false);
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Negotiation Email</h3>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                    >
                        {copied ? (
                            <>
                                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Copied!
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                Copy
                            </>
                        )}
                    </button>
                    <button
                        onClick={handleRegenerate}
                        disabled={isRegenerating || isLoading}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <svg
                            className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                        {isRegenerating ? 'Generating...' : 'Generate Again'}
                    </button>
                </div>
            </div>

            {/* Subject Line */}
            <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">Subject</label>
                <input
                    type="text"
                    value={subject}
                    onChange={(e) => onSubjectChange(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Email subject..."
                />
            </div>

            {/* Email Body */}
            <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">Email Body</label>
                <textarea
                    value={body}
                    onChange={(e) => onBodyChange(e.target.value)}
                    rows={12}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y"
                    placeholder="Compose your negotiation email..."
                />
            </div>

            {/* Send via Gmail Button */}
            <div className="flex justify-end">
                <button
                    onClick={onSendViaGmail}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium rounded-lg transition-all"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
                    </svg>
                    Send via Gmail
                </button>
            </div>

            <p className="text-xs text-gray-500 mt-3 text-center">
                Opens Gmail compose with your email. You control when to send.
            </p>
        </div>
    );
}
