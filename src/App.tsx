import React, { useState, useEffect, useRef } from "react";
import { Upload, Download, Timer, CheckCircle, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

type AppState = "IDLE" | "UPLOADING" | "UPLOADED" | "DOWNLOADING" | "ERROR";

interface FileInfo {
  pin: string;
  fileName: string;
  size: number;
  expiry: number;
}

export default function App() {
  const [state, setState] = useState<AppState>("IDLE");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [receiverPin, setReceiverPin] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Expiry Countdown
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (fileInfo?.expiry) {
      const interval = setInterval(() => {
        const remaining = Math.max(0, fileInfo.expiry - Date.now());
        setTimeLeft(remaining);
        if (remaining <= 0) {
          setState("ERROR");
          setErrorMsg("This relay has expired.");
          setFileInfo(null);
          clearInterval(interval);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [fileInfo]);

  const handleUpload = async (file: File) => {
    setState("UPLOADING");
    setUploadProgress(0);
    setErrorMsg("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload", true);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          setFileInfo(data);
          setState("UPLOADED");
        } else {
          setState("ERROR");
          setErrorMsg("Upload failed. Try again.");
        }
      };

      xhr.onerror = () => {
        setState("ERROR");
        setErrorMsg("Network error occurred.");
      };

      xhr.send(formData);
    } catch (err) {
      setState("ERROR");
      setErrorMsg("Something went wrong.");
    }
  };

  const handleDownload = async () => {
    if (receiverPin.length !== 6) {
      setErrorMsg("Please enter a valid 6-digit PIN.");
      return;
    }

    setState("DOWNLOADING");
    setErrorMsg("");

    try {
      const res = await fetch(`/api/info/${receiverPin}`);
      if (res.ok) {
        // Trigger download
        window.location.href = `/api/download/${receiverPin}`;
        setState("IDLE");
        setReceiverPin("");
      } else {
        const data = await res.json();
        setState("ERROR");
        setErrorMsg(data.error || "File not found or expired.");
      }
    } catch (err) {
      setState("ERROR");
      setErrorMsg("Failed to connect to server.");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatTime = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen px-4 pb-12 pt-8 sm:pt-20">
      <div className="max-w-2xl mx-auto space-y-12">
        {/* Header */}
        <header className="text-center space-y-2">
          <motion.h1 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-6xl font-black tracking-tighter uppercase sm:text-8xl"
          >
            Relay
          </motion.h1>
          <p className="font-bold text-lg opacity-60">Temporary file transfer</p>
        </header>

        <main className="space-y-8">
          <AnimatePresence mode="wait">
            {state === "IDLE" && (
              <motion.div
                key="idle"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="space-y-8"
              >
                {/* Upload Zone */}
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) handleUpload(file);
                  }}
                  className="brutal-card p-12 text-center cursor-pointer bg-brand-yellow group flex flex-col items-center justify-center space-y-6 min-h-[300px] transition-colors"
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(file);
                    }}
                  />
                  <div className="p-6 bg-white border-4 border-black rounded-full shadow-[4px_4px_0px_#000] group-hover:translate-x-[-2px] group-hover:translate-y-[-2px] group-hover:shadow-[6px_6px_0px_#000] transition-all">
                    <Upload size={48} className="text-black" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-3xl font-black uppercase">Drop file to relay</h2>
                    <p className="font-bold opacity-70 italic text-sm">MAX 10 MINUTE LIFETIME</p>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="h-1 flex-1 bg-black opacity-10"></div>
                  <span className="font-black uppercase text-sm opacity-40">Or receive file</span>
                  <div className="h-1 flex-1 bg-black opacity-10"></div>
                </div>

                {/* Receiver Section */}
                <div className="brutal-card p-6 bg-brand-white space-y-4">
                  <h3 className="font-black uppercase text-xl">Enter 6-digit PIN</h3>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <input 
                      type="text" 
                      maxLength={6}
                      placeholder="000000"
                      value={receiverPin}
                      onChange={(e) => setReceiverPin(e.target.value.replace(/\D/g, ""))}
                      className="brutal-input flex-1 text-4xl tracking-[0.2em] text-center sm:text-left"
                    />
                    <button 
                      onClick={handleDownload}
                      className="brutal-button bg-brand-red text-white py-4 px-8 uppercase flex items-center justify-center gap-2"
                    >
                      <span>Download</span>
                      <ArrowRight size={24} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {state === "UPLOADING" && (
              <motion.div
                key="uploading"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="brutal-card p-12 bg-brand-yellow space-y-8"
              >
                <div className="flex justify-between items-end">
                  <h2 className="text-4xl font-black uppercase">Relaying...</h2>
                  <span className="text-4xl font-black">{uploadProgress}%</span>
                </div>
                <div className="h-12 w-full bg-brand-black border-4 border-black rounded-lg overflow-hidden relative">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    className="h-full bg-white transition-all duration-300"
                  />
                </div>
                <p className="text-center font-bold animate-pulse uppercase">Don't close this tab</p>
              </motion.div>
            )}

            {state === "UPLOADED" && fileInfo && (
              <motion.div
                key="uploaded"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="space-y-6"
              >
                <div className="brutal-card p-12 bg-white text-center space-y-8">
                  <div className="inline-flex p-4 bg-green-400 border-4 border-black rounded-full mb-4">
                    <CheckCircle size={48} />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black uppercase opacity-60">Your PIN</h2>
                    <div className="text-8xl font-black tracking-tight">{fileInfo.pin}</div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-xl font-bold border-t-4 border-black pt-8">
                    <div className="flex items-center gap-2">
                      <Timer className="text-brand-red" />
                      <span>{timeLeft !== null ? formatTime(timeLeft) : "--:--"}</span>
                    </div>
                    <div className="hidden sm:block opacity-20">|</div>
                    <div className="max-w-[200px] truncate">{fileInfo.fileName}</div>
                    <div className="hidden sm:block opacity-20">|</div>
                    <div>{formatSize(fileInfo.size)}</div>
                  </div>
                </div>

                <div className="brutal-card p-6 bg-brand-yellow text-center font-black uppercase text-xl">
                  Waiting for receiver...
                </div>

                <button 
                  onClick={() => setState("IDLE")}
                  className="w-full text-center font-black uppercase underline p-4 hover:opacity-70"
                >
                  Relay another file
                </button>
              </motion.div>
            )}

            {state === "DOWNLOADING" && (
              <motion.div
                key="downloading"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="brutal-card p-12 bg-brand-white text-center space-y-6"
              >
                <Loader2 size={64} className="animate-spin mx-auto text-brand-red" />
                <h2 className="text-3xl font-black uppercase">Locating File...</h2>
              </motion.div>
            )}

            {state === "ERROR" && (
              <motion.div
                key="error"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="space-y-6"
              >
                <div className="brutal-card p-12 bg-brand-red text-white text-center space-y-6">
                  <div className="inline-flex p-4 bg-white border-4 border-black rounded-full text-brand-red">
                    <AlertCircle size={48} />
                  </div>
                  <h2 className="text-4xl font-black uppercase">Error</h2>
                  <p className="text-xl font-bold">{errorMsg}</p>
                </div>
                <button 
                  onClick={() => {
                    setState("IDLE");
                    setErrorMsg("");
                  }}
                  className="brutal-button w-full bg-white py-4 uppercase"
                >
                  Back to safety
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="text-center space-y-4 pt-12">
          <p className="font-bold opacity-40 text-sm">
            PRIVATE • ENCRYPTED • TEMPORARY
          </p>
          <div className="inline-flex bg-black text-white px-2 py-1 font-bold text-xs uppercase tracking-widest">
            Relay v1.0
          </div>
        </footer>
      </div>
    </div>
  );
}

