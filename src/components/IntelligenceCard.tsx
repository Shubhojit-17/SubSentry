'use client';

import { useState } from 'react';

interface IntelligenceCardProps {
    vendorType: 'FIXED_PLAN' | 'NEGOTIABLE';
    valueSummary: string;
    assumptions: string[];
    analyzedAt: string;
    regeneratedAt: string | null;
    onReanalyze: () => Promise<void>;
    isLoading?: boolean;
}

export default function IntelligenceCard({
    vendorType,
    valueSummary,
    assumptions,
    analyzedAt,
    regeneratedAt,
    onReanalyze,
    isLoading = false,
}: IntelligenceCardProps) {
    const [isRegenerating, setIsRegenerating] = useState(false);

    const handleReanalyze = async () => {
        setIsRegenerating(true);
        try {
            await onReanalyze();
        } finally {
            setIsRegenerating(false);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const lastAnalyzed = regeneratedAt || analyzedAt;

    return (
        <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-white">AI Analysis</h3>
                    <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${vendorType === 'NEGOTIABLE'
                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            }`}
                    >
                        {vendorType === 'NEGOTIABLE' ? '💰 Negotiable' : '📋 Fixed Plan'}
                    </span>
                </div>
                <button
                    onClick={handleReanalyze}
                    disabled={isRegenerating || isLoading}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    {isRegenerating ? 'Analyzing...' : 'Re-analyze'}
                </button>
            </div>

            {/* Value Summary */}
            <div className="mb-4">
                <p className="text-gray-300 leading-relaxed">{valueSummary}</p>
            </div>

            {/* Assumptions */}
            {assumptions.length > 0 && (
                <div className="mb-4">
                    <p className="text-sm text-gray-500 mb-2">Assumptions:</p>
                    <div className="flex flex-wrap gap-2">
                        {assumptions.map((assumption, index) => (
                            <span
                                key={index}
                                className="px-2 py-1 text-xs bg-gray-700/50 text-gray-400 rounded"
                            >
                                {assumption}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Timestamp */}
            <div className="text-xs text-gray-500">
                Last analyzed: {formatDate(lastAnalyzed)}
            </div>
        </div>
    );
}
