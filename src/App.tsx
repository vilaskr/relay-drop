import React, { useState, useEffect, useRef } from "react";
import { 
  Upload, Download, Timer, CheckCircle, AlertCircle, 
  Loader2, ArrowRight, FileText, 
  Image as ImageIcon, Film, Smartphone, Copy, Check, Globe,
  FileSpreadsheet, Archive, Music, FileCode
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeCanvas } from "qrcode.react";
import { UAParser } from "ua-parser-js";

type AppState = "IDLE" | "UPLOADING" | "UPLOADED" | "LOCATING" | "ERROR" | "DELIVERED" | "RECEIVER_PREVIEW" | "DOWNLOADING";

interface FileInfo {
  pin: string;
  fileName: string;
  size: number;
  expiry: number;
  mimeType?: string;
}

export default function App() {
  const [state, setState] = useState<AppState>("IDLE");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [receiverPin, setReceiverPin] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [deviceInfo, setDeviceInfo] = useState("");
  useEffect(() => {
    const parser = new UAParser();
    const result = parser.getResult();
    const browser = result.browser.name || "Unknown Browser";
    const os = result.os.name || "Unknown OS";
    setDeviceInfo(`${browser} • ${os}`);
  }, []);

  // Expiry Countdown
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (fileInfo?.expiry) {
      const interval = setInterval(() => {
        const remaining = Math.max(0, fileInfo.expiry - Date.now());
        setTimeLeft(remaining);
        if (remaining <= 0 && (state === "UPLOADED" || state === "RECEIVER_PREVIEW")) {
          setState("ERROR");
          setErrorMsg("This relay has expired.");
          setFileInfo(null);
          clearInterval(interval);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [fileInfo?.expiry, state]);

  // Status Polling (Uploader and Receiver)
  useEffect(() => {
    let interval: number;
    if ((state === "UPLOADED" || state === "RECEIVER_PREVIEW") && fileInfo) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/status/${fileInfo.pin}`);
          const data = await res.json();
          
          if (data.status === "downloaded") {
            if (state === "UPLOADED") {
              setState("DELIVERED");
            } else if (state === "RECEIVER_PREVIEW") {
              // If receiver saw it was downloaded by someone else (unlikely but possible)
              // Or just to confirm completion after they started.
              // Actually, if they are downloading, we might handle it in startDownload.
            }
            clearInterval(interval);
          } else if (data.status === "not_found") {
             if (state !== "DELIVERED") {
                setState("ERROR");
                setErrorMsg("This relay is no longer available.");
                setFileInfo(null);
             }
             clearInterval(interval);
          }
        } catch (e) {
          console.error("Polling error", e);
        }
      }, 3000) as unknown as number;
    }
    return () => clearInterval(interval);
  }, [state, fileInfo]);

  // URL PIN Handling
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pin = params.get("pin");
    if (pin && pin.length === 6) {
      setReceiverPin(pin);
      // Auto-trigger preview
      handleFetchInfo(pin);
    }
  }, []);

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

  const handleFetchInfo = async (pinOverride?: string) => {
    const pin = pinOverride || receiverPin;
    if (pin.length !== 6) {
      setErrorMsg("Please enter a valid 6-digit PIN.");
      return;
    }

    setState("LOCATING");
    setErrorMsg("");

    try {
      const res = await fetch(`/api/info/${pin}`);
      if (res.ok) {
        const info = await res.json();
        setFileInfo({ ...info, pin });
        setState("RECEIVER_PREVIEW");
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

  const startDownload = async () => {
    if (!fileInfo) return;
    
    setState("DOWNLOADING");
    setUploadProgress(0);
    setErrorMsg("");

    try {
      const response = await fetch(`/api/download/${fileInfo.pin}`);
      if (!response.ok) throw new Error("Download failed");
      
      const contentLength = response.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Could not read response body");

      const chunks: Uint8Array[] = [];
      
      while(true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        loaded += value.length;
        
        if (total > 0) {
          setUploadProgress(Math.round((loaded / total) * 100));
        }
      }

      const blob = new Blob(chunks, { type: fileInfo.mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileInfo.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setState("DELIVERED");
      
      setTimeout(() => {
        setState("IDLE");
        setFileInfo(null);
        setReceiverPin("");
      }, 5000);

    } catch (err) {
      setState("ERROR");
      setErrorMsg("Download failed. The relay might have been closed.");
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const paste = e.clipboardData.getData("text").replace(/\D/g, "");
    if (paste.length === 6) {
      setReceiverPin(paste);
      setTimeout(() => handleFetchInfo(paste), 300);
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

  const getShareUrl = () => {
    if (!fileInfo) return "";
    return `${window.location.origin}${window.location.pathname}?pin=${fileInfo.pin}`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(getShareUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderFilePreview = () => {
    if (!fileInfo) return null;
    const { mimeType, fileName } = fileInfo;
    
    let Icon = FileText;
    let label = "GENERIC FILE";
    let color = "bg-brand-white";

    if (mimeType?.startsWith("image/")) {
      Icon = ImageIcon;
      label = "IMAGE FILE";
      color = "bg-blue-200";
    } else if (mimeType?.startsWith("video/")) {
      Icon = Film;
      label = "VIDEO FILE";
      color = "bg-purple-200";
    } else if (mimeType === "application/pdf") {
      label = "PDF DOCUMENT";
      color = "bg-red-200";
    } else if (
      mimeType?.includes("spreadsheet") || 
      mimeType?.includes("excel") || 
      fileName.endsWith(".csv")
    ) {
      Icon = FileSpreadsheet;
      label = "SPREADSHEET";
      color = "bg-emerald-200";
    } else if (
      mimeType?.includes("zip") || 
      mimeType?.includes("compressed") || 
      mimeType?.includes("archive") ||
      fileName.endsWith(".rar") || 
      fileName.endsWith(".7z")
    ) {
      Icon = Archive;
      label = "ARCHIVE";
      color = "bg-orange-200";
    } else if (mimeType?.startsWith("audio/")) {
      Icon = Music;
      label = "AUDIO FILE";
      color = "bg-pink-200";
    } else if (
      mimeType?.includes("javascript") || 
      mimeType?.includes("typescript") || 
      mimeType?.includes("html") || 
      mimeType?.includes("css") || 
      mimeType?.includes("json") ||
      fileName.endsWith(".ts") ||
      fileName.endsWith(".tsx") ||
      fileName.endsWith(".js") ||
      fileName.endsWith(".jsx") ||
      fileName.endsWith(".py")
    ) {
      Icon = FileCode;
      label = "SOURCE CODE";
      color = "bg-cyan-200";
    }

    return (
      <div className={`p-12 ${color} border-4 border-black rounded-lg shadow-[4px_4px_0px_#000] mb-6 flex flex-col items-center justify-center space-y-4`}>
        <motion.div
           animate={{ rotate: [0, 5, -5, 0] }}
           transition={{ repeat: Infinity, duration: 2 }}
        >
          <Icon size={80} className="text-black" />
        </motion.div>
        <span className="font-black text-sm uppercase opacity-40 tracking-widest">{label}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen px-4 pb-12 pt-8 sm:pt-20 selection:bg-brand-red selection:text-white">
      {/* Decorative Shapes */}
      <div className="doodle-shape top-10 left-[10%] w-24 h-24 border-4 border-black rotate-12" />
      <div className="doodle-shape top-40 right-[15%] w-16 h-16 bg-brand-yellow border-4 border-black rounded-full" />
      <div className="doodle-shape bottom-20 left-[20%] w-20 h-20 bg-brand-red border-4 border-black -rotate-12" />
      <div className="doodle-shape bottom-40 right-[5%] w-32 h-8 bg-black" />

      <div className="max-w-2xl mx-auto space-y-12">
        {/* Header */}
        <header className="text-center space-y-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-block p-1 bg-black text-brand-bg font-black text-xs uppercase px-3 rounded-full mb-2 tracking-widest"
          >
            v1.2 PREMIUM
          </motion.div>
          <motion.h1 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-7xl font-black tracking-tighter uppercase sm:text-9xl relative inline-block"
          >
            Relay
            <div className="absolute -top-4 -right-8 text-4xl rotate-12 text-brand-red">✦</div>
          </motion.h1>
          <p className="font-bold text-xl opacity-60 max-w-sm mx-auto">
            Tactile, temporary, and internet-native file transfer.
          </p>
        </header>

        <main className="space-y-10 relative">
          <AnimatePresence mode="wait">
            {state === "IDLE" && (
              <motion.div
                key="idle"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="space-y-10"
              >
                {/* Upload Zone */}
                <motion.div 
                  whileHover={{ y: -4, rotate: -0.5 }}
                  whileTap={{ scale: 0.98 }}
                  animate={{ 
                    scale: isDragOver ? 1.05 : 1,
                    rotate: isDragOver ? 1 : 0,
                    boxShadow: isDragOver ? "12px 12px 0px #111" : "8px 8px 0px #111"
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    const file = e.dataTransfer.files[0];
                    if (file) handleUpload(file);
                  }}
                  className={`brutal-card text-center cursor-pointer flex flex-col items-center justify-center space-y-6 min-h-[300px] sm:min-h-[350px] transition-colors duration-300 ${isDragOver ? "bg-white" : "bg-brand-yellow"}`}
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
                  <div className={`p-8 bg-brand-white border-4 border-black rounded-full shadow-[4px_4px_0px_#000] transition-all ${isDragOver ? "scale-125 rotate-12 bg-brand-red text-white" : "text-black"}`}>
                    <Upload size={56} />
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-4xl font-black uppercase tracking-tight">Drop file to relay</h2>
                    <p className="font-bold opacity-50 italic text-base">MAX 10 MINUTE LIFETIME • UP TO 100MB</p>
                  </div>
                </motion.div>

                <div className="flex items-center space-x-6">
                  <div className="h-1 flex-1 bg-black opacity-10"></div>
                  <span className="font-black uppercase text-base opacity-40 tracking-widest">Receive Relay</span>
                  <div className="h-1 flex-1 bg-black opacity-10"></div>
                </div>

                {/* Receiver Section */}
                <div className="brutal-card bg-brand-white space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h3 className="font-black uppercase text-xl sm:text-2xl">Enter 6-digit PIN</h3>
                    <div className="flex items-center gap-2 opacity-40 font-bold text-xs sm:text-sm">
                      <Smartphone size={16} />
                      <span className="truncate">{deviceInfo}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                    <input 
                      type="text" 
                      maxLength={6}
                      placeholder="000000"
                      value={receiverPin}
                      onPaste={handlePaste}
                      onChange={(e) => setReceiverPin(e.target.value.replace(/\D/g, ""))}
                      className="brutal-input sm:col-span-8 text-3xl sm:text-4xl tracking-[0.2em] text-center sm:text-left h-16 sm:h-20"
                    />
                    <button 
                      onClick={() => handleFetchInfo()}
                      className="brutal-button sm:col-span-4 bg-brand-red text-white h-16 sm:h-20 uppercase flex items-center justify-center gap-2 text-lg sm:text-xl group whitespace-nowrap"
                    >
                      <span>Locate</span>
                      <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {(state === "UPLOADING" || state === "DOWNLOADING") && (
              <motion.div
                key="transferring"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="brutal-card bg-white space-y-10"
              >
                <div className="flex flex-wrap justify-between items-end gap-2">
                  <h2 className="text-3xl sm:text-5xl font-black uppercase">
                    {state === "UPLOADING" ? "Relaying..." : "Receiving..."}
                  </h2>
                  <span className="text-3xl sm:text-5xl font-black">{uploadProgress}%</span>
                </div>
                <div className="h-12 sm:h-16 w-full bg-brand-black border-4 border-black rounded-lg overflow-hidden relative">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    className="h-full bg-brand-yellow border-r-4 border-black transition-all duration-300"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="font-black mix-blend-difference text-white uppercase text-sm tracking-tighter">
                      {state === "UPLOADING" ? "Transferring Bytes" : "Streaming Bytes"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-3 text-brand-red font-black uppercase animate-pulse">
                  <Loader2 className="animate-spin" />
                  <span>DO NOT REFRESH</span>
                </div>
              </motion.div>
            )}

            {state === "UPLOADED" && fileInfo && (
              <motion.div
                key="uploaded"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="space-y-8"
              >
                <div className="brutal-card bg-white text-center space-y-10 relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-green-400/20 blur-[100px] -z-10" />

                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 10 }}
                    className="inline-flex p-4 sm:p-6 bg-green-400 border-4 border-black rounded-full mb-4 shadow-[4px_4px_0px_#111]"
                  >
                    <CheckCircle size={40} className="sm:hidden" />
                    <CheckCircle size={56} className="hidden sm:block" />
                  </motion.div>
                  
                  <div className="space-y-4">
                    <h2 className="text-xl sm:text-3xl font-black uppercase opacity-60">Your Relay PIN</h2>
                    <div className="flex items-center justify-center gap-1.5 sm:gap-4 flex-wrap">
                      {fileInfo.pin.split("").map((digit, i) => (
                        <motion.div
                          key={i}
                          initial={{ y: 40, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.1 * i, type: "spring" }}
                          className="w-12 h-16 sm:w-20 sm:h-28 bg-brand-white border-4 border-black rounded-lg flex items-center justify-center text-3xl sm:text-7xl font-black shadow-[4px_4px_0px_#111]"
                        >
                          {digit}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-lg sm:text-xl font-black border-t-8 border-dashed border-black/10 pt-10">
                    <div className="flex items-center gap-3 py-2 px-4 bg-brand-bg rounded-lg border-2 border-black">
                      <Timer className="text-brand-red" size={20} />
                      <span className="font-mono text-base sm:text-xl">{timeLeft !== null ? formatTime(timeLeft) : "--:--"}</span>
                    </div>
                    <div className="max-w-full sm:max-w-[250px] truncate underline underline-offset-8 decoration-4 decoration-brand-yellow font-sans">{fileInfo.fileName}</div>
                    <div className="opacity-40">{formatSize(fileInfo.size)}</div>
                  </div>
                </div>

                {/* Share Link & QR */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                   <div className="brutal-card bg-brand-white flex flex-col items-center justify-center space-y-4">
                      <h4 className="font-black uppercase text-sm opacity-60">Scan to download</h4>
                      <div className="p-4 bg-white border-4 border-black rounded shadow-[4px_4px_0px_#000] w-full max-w-[200px] flex justify-center">
                        <QRCodeCanvas value={getShareUrl()} size={140} level="H" includeMargin className="w-full h-auto max-w-full" />
                      </div>
                   </div>
                   <div className="brutal-card bg-brand-white flex flex-col justify-between space-y-6">
                      <div>
                        <h4 className="font-black uppercase text-sm opacity-60 mb-2">Direct Link</h4>
                        <p className="font-mono text-xs sm:text-sm break-all font-bold p-4 bg-brand-bg border-4 border-black/10 rounded">
                          {getShareUrl()}
                        </p>
                      </div>
                      <button 
                        onClick={copyToClipboard}
                        className={`brutal-button w-full h-14 flex items-center justify-center gap-3 uppercase ${copied ? "bg-green-400" : "bg-brand-yellow font-black"}`}
                      >
                        {copied ? <Check size={20} /> : <Copy size={20} />}
                        <span>{copied ? "Copied!" : "Copy Link"}</span>
                      </button>
                   </div>
                </div>

                <div className="brutal-card bg-black text-white text-center flex items-center justify-center gap-4 overflow-hidden relative">
                   <motion.div 
                    animate={{ x: [0, 20, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="w-3 h-3 bg-green-400 rounded-full" 
                   />
                   <span className="font-black uppercase text-xl leading-none">Awaiting Peer Connection</span>
                </div>

                <button 
                  onClick={() => setState("IDLE")}
                  className="w-full text-center font-black uppercase underline p-6 hover:text-brand-red transition-colors text-xl"
                >
                  Create another Relay
                </button>
              </motion.div>
            )}

            {state === "RECEIVER_PREVIEW" && fileInfo && (
              <motion.div
                key="preview"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="space-y-6"
              >
                <div className="brutal-card bg-white text-center">
                  <h2 className="text-2xl sm:text-3xl font-black uppercase mb-8">Ready to receive</h2>
                  
                  {renderFilePreview()}

                  <div className="space-y-2 mb-8">
                    <h3 className="text-2xl sm:text-3xl font-black break-all font-sans">{fileInfo.fileName}</h3>
                    <p className="font-bold opacity-40 text-sm sm:text-base">{formatSize(fileInfo.size)} • EXPIRES IN {timeLeft !== null ? formatTime(timeLeft) : "--:--"}</p>
                  </div>

                  <div className="flex flex-col gap-4">
                    <button 
                      onClick={startDownload}
                      className="brutal-button bg-brand-red text-white py-4 px-10 uppercase flex items-center justify-center gap-3 text-xl sm:text-3xl min-h-[64px] sm:h-20 w-full"
                    >
                      <Download size={28} className="sm:w-8 sm:h-8" />
                      <span>Download Now</span>
                    </button>
                    <button 
                      onClick={() => setState("IDLE")}
                      className="font-black uppercase underline opacity-40 hover:opacity-100 transition-opacity p-2 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                
                <div className="brutal-card p-4 bg-brand-yellow flex items-center justify-center gap-2">
                   <Globe size={20} />
                   <span className="font-black uppercase text-xs">Secure Ephemeral Transfer Enabled</span>
                </div>
              </motion.div>
            )}

            {state === "LOCATING" && (
              <motion.div
                key="locating"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="brutal-card p-12 bg-white text-center space-y-8"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="inline-block"
                >
                  <Loader2 size={80} className="text-brand-red" />
                </motion.div>
                <div className="space-y-2">
                  <h2 className="text-4xl font-black uppercase italic">Locating Relay...</h2>
                  <p className="font-bold opacity-50">Establishing secure temporary byte stream</p>
                </div>
              </motion.div>
            )}

            {state === "DELIVERED" && (
              <motion.div
                key="delivered"
                initial={{ scale: 2, opacity: 0, rotate: -15 }}
                animate={{ scale: 1, opacity: 1, rotate: -5 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="brutal-card bg-green-400 text-center space-y-6 relative overflow-hidden"
              >
                {/* Flash Effect Layer */}
                <motion.div 
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 bg-white z-10 pointer-events-none"
                />
                
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
                  className="inline-flex p-4 sm:p-6 bg-white border-4 border-black rounded-full mb-4 shadow-[8px_8px_0px_#000]"
                >
                    <Check size={48} className="sm:hidden" strokeWidth={4} />
                    <Check size={80} className="hidden sm:block" strokeWidth={4} />
                </motion.div>
                
                <h2 className="text-4xl sm:text-7xl font-black uppercase italic tracking-tighter leading-tight">
                  ✓ FILE<br />DELIVERED
                </h2>
                
                <motion.div 
                  initial={{ x: 100, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="inline-block px-6 py-3 border-4 border-black font-black uppercase text-xl sm:text-2xl bg-white shadow-[6px_6px_0px_#000] -rotate-2"
                >
                  STAMPED SUCCESS
                </motion.div>
                
                <p className="font-bold text-lg sm:text-xl pt-4 animate-bounce font-sans opacity-80">
                  Relay mission complete. Handshake closed.
                </p>
              </motion.div>
            )}

            {state === "ERROR" && (
              <motion.div
                key="error"
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="space-y-6"
              >
                <div className="brutal-card bg-brand-red text-white text-center space-y-8">
                  <div className="inline-flex p-4 sm:p-6 bg-white border-4 border-black rounded-full text-brand-red shadow-[4px_4px_0px_#000]">
                    <AlertCircle size={40} className="sm:hidden" />
                    <AlertCircle size={64} className="hidden sm:block" />
                  </div>
                  <div className="space-y-4">
                    <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter">Terminal Failure</h2>
                    <p className="text-lg sm:text-2xl font-bold border-t-2 border-white/20 pt-4 font-sans">{errorMsg}</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setState("IDLE");
                    setErrorMsg("");
                  }}
                  className="brutal-button w-full bg-white h-16 sm:h-20 text-xl sm:text-2xl uppercase"
                >
                  Return to Base
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="text-center space-y-6 pt-16 font-sans">
          <div className="h-1 bg-black opacity-10 w-32 mx-auto" />
          <div className="flex flex-col items-center gap-3">
             <div className="flex items-center justify-center gap-6 font-black uppercase text-sm tracking-widest opacity-30">
               <span>P2P Protocol</span>
               <div className="w-1.5 h-1.5 bg-black rounded-full" />
               <span>Zero Persistence</span>
               <div className="w-1.5 h-1.5 bg-black rounded-full" />
               <span>Ephemeral</span>
             </div>
             <p className="font-black text-xs opacity-20">EST. 2026 • RELAY SYSTEMS INC.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
