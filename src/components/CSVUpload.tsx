'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

interface CSVUploadProps {
    onUploadComplete?: (result: UploadResult) => void;
}

interface UploadResult {
    success: boolean;
    summary: {
        totalRows: number;
        validTransactions: number;
        saasCount: number;
        vendorsCreated: number;
        transactionsCreated: number;
        errors: string[];
    };
    vendors: Array<{
        name: string;
        totalSpend: number;
        transactionCount: number;
        isSaaS: boolean;
        category: string | null;
    }>;
}

export default function CSVUpload({ onUploadComplete }: CSVUploadProps) {
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<UploadResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;

        setUploading(true);
        setError(null);
        setResult(null);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Upload failed');
                return;
            }

            setResult(data);
            onUploadComplete?.(data);
        } catch {
            setError('Failed to upload file. Please try again.');
        } finally {
            setUploading(false);
        }
    }, [onUploadComplete]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'text/csv': ['.csv'],
            'application/vnd.ms-excel': ['.csv'],
        },
        maxFiles: 1,
        disabled: uploading,
    });

    return (
        <div className="space-y-4">
            <div
                {...getRootProps()}
                className={`dropzone ${isDragActive ? 'dropzone-active' : ''} ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-3">
                    {uploading ? (
                        <>
                            <div className="spinner w-8 h-8" />
                            <p className="text-gray-400">Processing your file...</p>
                        </>
                    ) : (
                        <>
                            <div className="w-12 h-12 bg-primary-500/10 rounded-full flex items-center justify-center">
                                <svg className="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                            </div>
                            <div className="text-center">
                                <p className="text-white font-medium">
                                    {isDragActive ? 'Drop your CSV here' : 'Drop CSV here or click to upload'}
                                </p>
                                <p className="text-sm text-gray-500 mt-1">
                                    Supports QuickBooks, bank exports, and generic CSV formats
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-red-400 text-sm">{error}</p>
                </div>
            )}

            {result && (
                <div className="p-4 bg-accent-500/10 border border-accent-500/20 rounded-lg animate-fade-in">
                    <div className="flex items-center gap-2 mb-3">
                        <svg className="w-5 h-5 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-accent-400 font-medium">Upload Successful</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div>
                            <p className="text-gray-400">Transactions</p>
                            <p className="text-white font-medium">{result.summary.validTransactions}</p>
                        </div>
                        <div>
                            <p className="text-gray-400">SaaS Detected</p>
                            <p className="text-white font-medium">{result.summary.saasCount}</p>
                        </div>
                        <div>
                            <p className="text-gray-400">Vendors</p>
                            <p className="text-white font-medium">{result.summary.vendorsCreated}</p>
                        </div>
                        <div>
                            <p className="text-gray-400">Errors</p>
                            <p className="text-white font-medium">{result.summary.errors.length}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
