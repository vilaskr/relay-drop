import React, { useState, useCallback, useEffect } from 'react';
import { Upload, Download, Clock, ShieldCheck, FileText, ArrowRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface FileInfo {
  id: string;
  pin: string;
  expiresAt: number;
}

interface DownloadInfo {
  originalName: string;
  size: number;
  mimeType: string;
  expiresAt: number;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedInfo, setUploadedInfo] = useState<FileInfo | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [downloadInfo, setDownloadInfo] = useState<DownloadInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        setUploadedInfo(data);
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setUploading(false);
    }
  };

  const handleCheckPin = async () => {
    if (pinInput.length !== 6) return;
    setError(null);

    try {
      const response = await fetch(`/api/file/${pinInput}`);
      const data = await response.json();
      if (response.ok) {
        setDownloadInfo(data);
      } else {
        setError(data.error || 'Invalid PIN or file expired');
      }
    } catch (err) {
      setError('Failed to connect to server');
    }
  };

  const handleDownload = () => {
    if (!pinInput) return;
    window.location.href = `/api/download/${pinInput}`;
  };

  const reset = () => {
    setFile(null);
    setUploadedInfo(null);
    setDownloadInfo(null);
    setPinInput('');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#F0F0F0] p-6 font-sans">
      <div className="mx-auto max-w-2xl pt-12">
        {/* Header */}
        <header className="mb-12 flex items-end justify-between">
          <div>
            <h1 className="text-8xl font-black tracking-tighter text-black">RELAY</h1>
            <p className="mt-2 text-xl font-bold uppercase tracking-widest text-black/60">
              Ephemeral File Courier
            </p>
          </div>
          <div className="neo-brutalist-card bg-[#FFFD01] p-3">
            <ShieldCheck className="h-8 w-8" />
          </div>
        </header>

        <main className="space-y-12">
          {error && (
            <motion.div 
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="neo-brutalist-card border-red-500 bg-red-50 p-4 text-red-600 font-bold"
            >
              <div className="flex items-center gap-2">
                <X className="h-5 w-5" />
                {error}
              </div>
            </motion.div>
          )}

          {/* Section: Upload */}
          {!uploadedInfo && !downloadInfo && (
            <section className="space-y-6">
              <div className="neo-brutalist-card bg-white p-8">
                <h2 className="mb-6 flex items-center gap-3 text-3xl font-black">
                  <Upload className="h-8 w-8" /> 1. SEND
                </h2>
                
                <div className="relative">
                  <input
                    type="file"
                    onChange={onFileChange}
                    className="absolute inset-0 z-10 cursor-pointer opacity-0"
                    id="file-input"
                  />
                  <div className="neo-brutalist-card flex flex-col items-center justify-center border-dashed bg-[#F8F8F8] py-12">
                    {file ? (
                      <div className="text-center">
                        <FileText className="mx-auto mb-2 h-12 w-12 text-[#ff3e00]" />
                        <p className="max-w-[200px] truncate font-bold">{file.name}</p>
                        <p className="text-sm font-medium text-black/50">{formatSize(file.size)}</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="mb-4 h-12 w-12 text-black/20" />
                        <p className="font-bold">DROP FILE OR CLICK</p>
                        <p className="text-sm text-black/40">MAX 50MB</p>
                      </>
                    )}
                  </div>
                </div>

                {file && (
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="neo-brutalist-button mt-6 w-full bg-[#ff3e00] text-white disabled:opacity-50"
                  >
                    {uploading ? 'UPLOADING...' : 'GENERATE PIN'}
                  </button>
                )}
              </div>

              <div className="text-center font-bold text-black/20">OR</div>

              <div className="neo-brutalist-card bg-white p-8">
                <h2 className="mb-6 flex items-center gap-3 text-3xl font-black">
                  <Download className="h-8 w-8" /> 2. RECEIVE
                </h2>
                <div className="flex gap-4">
                  <input
                    type="text"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="ENTER 6-DIGIT PIN"
                    className="neo-brutalist-card flex-1 px-4 py-3 font-mono text-2xl tracking-widest placeholder:text-black/20 focus:outline-none"
                  />
                  <button
                    onClick={handleCheckPin}
                    disabled={pinInput.length !== 6}
                    className="neo-brutalist-button bg-[#00E5FF] disabled:opacity-50"
                  >
                    <ArrowRight />
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Result: Uploaded */}
          <AnimatePresence>
            {uploadedInfo && (
              <motion.section
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="neo-brutalist-card bg-[#38FF75] p-8"
              >
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-3xl font-black">READY TO RELAY</h2>
                  <button onClick={reset} className="neo-brutalist-button bg-white p-2">
                    <X className="h-6 w-6" />
                  </button>
                </div>
                <div className="mb-8 rounded-xl border-4 border-black bg-black p-1">
                  <div className="rounded-lg border-4 border-black bg-white py-12 text-center">
                    <p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-black/40">YOUR PIN</p>
                    <p className="font-mono text-8xl font-black tracking-tighter text-[#ff3e00]">
                      {uploadedInfo.pin}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm font-bold">
                  <Clock className="h-5 w-5" />
                  EXPIRES IN 10 MINUTES
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Result: Download Info */}
          <AnimatePresence>
            {downloadInfo && (
              <motion.section
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="neo-brutalist-card bg-[#00E5FF] p-8"
              >
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-3xl font-black">FILE FOUND</h2>
                  <button onClick={reset} className="neo-brutalist-button bg-white p-2">
                    <X className="h-6 w-6" />
                  </button>
                </div>
                <div className="neo-brutalist-card mb-6 bg-white p-6">
                  <div className="flex items-start gap-4">
                    <FileText className="mt-1 h-10 w-10 text-[#ff3e00]" />
                    <div>
                      <p className="text-2xl font-black tracking-tight">{downloadInfo.originalName}</p>
                      <p className="font-bold text-black/50">{formatSize(downloadInfo.size)}</p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleDownload}
                  className="neo-brutalist-button w-full bg-black text-white"
                >
                  DOWNLOAD NOW
                </button>
                <p className="mt-4 text-center text-xs font-bold uppercase opacity-50">
                  SECURITY: THIS FILE WILL BE DELETED AUTOMATICALLY
                </p>
              </motion.section>
            )}
          </AnimatePresence>
        </main>

        <footer className="mt-20 border-t-4 border-black pt-8 pb-12 opacity-30">
          <p className="text-xs font-bold uppercase tracking-widest">
            Relay // Built with Antigravity // 2026
          </p>
        </footer>
      </div>
    </div>
  );
}
