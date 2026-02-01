'use client';

import { useState } from 'react';

interface Alternative {
    name: string;
    website: string;
    priceRange: string;
    category: string;
    strengths: string[];
    bestFor: string;
    whyBetter: string;
}

interface AlternativesPanelProps {
    alternatives: Alternative[];
    currentVendor: string;
    currentAmount?: number | null;
}

export default function AlternativesPanel({
    alternatives,
    currentVendor,
    currentAmount,
}: AlternativesPanelProps) {
    const [showAll, setShowAll] = useState(false);

    const displayedAlternatives = showAll ? alternatives : alternatives.slice(0, 2);

    if (alternatives.length === 0) {
        return (
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Top Alternatives</h3>
                <p className="text-gray-400">
                    No direct alternatives found. {currentVendor} appears to be well-suited for your use case.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Top Alternatives</h3>
                {alternatives.length > 2 && (
                    <button
                        onClick={() => setShowAll(!showAll)}
                        className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
                    >
                        {showAll ? 'Show less' : `See ${alternatives.length - 2} more`}
                    </button>
                )}
            </div>

            <div className="space-y-4">
                {displayedAlternatives.map((alt, index) => (
                    <div
                        key={index}
                        className="bg-gray-700/30 rounded-lg p-4 border border-gray-600/50 hover:border-gray-500/50 transition-colors"
                    >
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="font-semibold text-white">{alt.name}</h4>
                                    <span className="text-xs px-2 py-0.5 bg-gray-600 text-gray-300 rounded">
                                        {alt.category}
                                    </span>
                                </div>
                                {alt.website && (
                                    <a
                                        href={alt.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-purple-400 hover:text-purple-300"
                                    >
                                        {alt.website.replace('https://', '')}
                                    </a>
                                )}
                            </div>
                            <div className="text-right">
                                <span className="text-green-400 font-medium">{alt.priceRange}</span>
                            </div>
                        </div>

                        {/* Why Better */}
                        <p className="text-sm text-gray-300 mb-3">{alt.whyBetter}</p>

                        {/* Strengths */}
                        <div className="flex flex-wrap gap-2 mb-2">
                            {alt.strengths.map((strength, i) => (
                                <span
                                    key={i}
                                    className="text-xs px-2 py-1 bg-green-500/10 text-green-400 rounded"
                                >
                                    ✓ {strength}
                                </span>
                            ))}
                        </div>

                        {/* Best For */}
                        <p className="text-xs text-gray-500">
                            Best for: {alt.bestFor}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}
