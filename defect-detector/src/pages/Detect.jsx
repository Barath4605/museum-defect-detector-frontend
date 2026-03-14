import React, { useState, useRef, useEffect, useCallback } from "react";
import "../index.css";
import { FolderOpen, Video, CheckCircle2 } from "lucide-react";


import {
    LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
    ResponsiveContainer, ReferenceLine,
} from "recharts";
import Navbar from "../components/Navbar.jsx";

const MAX_SIZE = 200 * 1024 * 1024;
const BASE_URL = "https://abhi02072005-jepa-backend.hf.space";
const WS_URL = BASE_URL.replace(/^https/, "wss").replace(/^http/, "ws") + "/ws/webcam";

// ── Primitives ────────────────────────────────────────────────────────────────

const ScoreBar = ({ label, value, max = 2, color = "#8884d8" }) => {
    const pct = Math.min((value / max) * 100, 100);
    return (
        <div className="w-full">
            <div className="flex justify-between text-xs opacity-50 mb-1.5 montserrat">
                <span>{label}</span><span>{value.toFixed(4)}</span>
            </div>
            <div className="w-full bg-slate-700/60 rounded-full h-1.5">
                <div className="h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
        </div>
    );
};

const StatCard = ({ label, value, highlight, sub }) => (
    <div className={`flex flex-col gap-1 p-4 sm:p-5 rounded-2xl transition-all ${highlight
        ? "border-red-500/50 bg-red-900/15"
        : "border-tan/15 bg-linear-to-br from-slate-800/30 to-slate-900/30"
        }`}>
        <p className="text-[10px] montserrat tracking-[0.2em] uppercase opacity-35">{label}</p>
        <p className={`text-2xl font-semibold montserrat ${highlight ? "text-red-400" : "text-tan"}`}>{value}</p>
        {sub && <p className="text-[10px] montserrat opacity-25 leading-snug">{sub}</p>}
    </div>
);

const SectionHeader = ({ title, sub }) => (
    <div className="text-center mb-10">
        <h3 className="text-2xl sm:text-3xl font-semibold montserrat">{title}</h3>
        {sub && <p className="text-xs montserrat opacity-35 mt-1.5">{sub}</p>}
    </div>
);

const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-slate-900 border border-tan/20 rounded-xl px-4 py-3 text-xs montserrat shadow-xl">
            <p className="opacity-40 mb-1">Frame {label}</p>
            <p className="text-tan font-semibold">{payload[0]?.value?.toFixed(4)}</p>
        </div>
    );
};

// ── Main ──────────────────────────────────────────────────────────────────────

const Detect = () => {
    const [mode, setMode] = useState("upload");

    // Upload state
    const [video, setVideo] = useState(null);
    const [videoURL, setVideoURL] = useState(null);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState([]);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState(null);
    const [threshold, setThreshold] = useState(null);
    const [frames, setFrames] = useState([]);
    const [lastFrame, setLastFrame] = useState(null);
    const [done, setDone] = useState(false);
    const [totalFrames, setTotalFrames] = useState(0);
    const [anomalyFrameImages, setAnomalyFrameImages] = useState([]);
    const [originalFrames, setOriginalFrames] = useState({});
    const [dragOver, setDragOver] = useState(false);
    const [maxFrames, setMaxFrames] = useState(0);
    const [showEvery, setShowEvery] = useState(5);
    const [maskHumans, setMaskHumans] = useState(true);
    const [thresholdOverride, setThresholdOverride] = useState(0);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Webcam state
    const [wcStatus, setWcStatus] = useState("idle");
    const [wcError, setWcError] = useState(null);
    const [wcFrames, setWcFrames] = useState([]);
    const [wcLastFrame, setWcLastFrame] = useState(null);
    const [wcThreshold, setWcThreshold] = useState(null);
    const [wcThresholdOvr, setWcThresholdOvr] = useState(0);
    const [wcFps, setWcFps] = useState(2);
    const [wcAnomalyCount, setWcAnomalyCount] = useState(0);

    const inputRef = useRef(null);
    const logEndRef = useRef(null);
    const hiddenVideoRef = useRef(null);
    const wsRef = useRef(null);
    const streamRef = useRef(null);
    const webcamVideoRef = useRef(null);
    const canvasRef = useRef(null);
    const intervalRef = useRef(null);
    const pendingRef = useRef(false);

    useEffect(() => {
        return () => { stopWebcam(); if (videoURL) URL.revokeObjectURL(videoURL); };
    }, []);

    const pushLog = (msg) => {
        setLogs((prev) => [...prev, msg]);
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    };

    // ── File handling ─────────────────────────────────────────────────────────
    const applyFile = useCallback((file) => {
        if (!file) return;
        if (!file.type.startsWith("video/")) { alert("Only video files allowed"); return; }
        if (file.size > MAX_SIZE) { alert("Video must be under 200MB"); return; }
        if (videoURL) URL.revokeObjectURL(videoURL);
        setVideo(file); setVideoURL(URL.createObjectURL(file));
        setError(null); setDone(false); setFrames([]); setLastFrame(null);
        setThreshold(null); setAnomalyFrameImages([]); setOriginalFrames({});
        setLogs([]);
    }, [videoURL]);

    const handleChange = (e) => applyFile(e.target.files[0]);
    const handleDrop = useCallback((e) => { e.preventDefault(); setDragOver(false); applyFile(e.dataTransfer.files[0]); }, [applyFile]);
    const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
    const handleDragLeave = () => setDragOver(false);
    const removeFile = (e) => {
        e.stopPropagation();
        if (videoURL) URL.revokeObjectURL(videoURL);
        setVideo(null); setVideoURL(null);
        if (inputRef.current) inputRef.current.value = "";
    };

    // ── Detection ─────────────────────────────────────────────────────────────
    const handleDetect = async () => {
        if (!video) { alert("Select a video first"); return; }
        setLoading(true); setLogs([]); setError(null); setFrames([]);
        setLastFrame(null); setProgress(null); setThreshold(null);
        setDone(false); setTotalFrames(0); setAnomalyFrameImages([]); setOriginalFrames({});

        const formData = new FormData();
        formData.append("video", video);
        formData.append("max_frames", maxFrames);
        formData.append("show_every", showEvery);
        formData.append("mask_humans", maskHumans);
        formData.append("threshold_override", thresholdOverride);

        try {
            pushLog(" Uploading video for inference…");
            const response = await fetch(`${BASE_URL}/api/detect`, { method: "POST", body: formData });
            if (!response.ok) { const t = await response.text(); throw new Error(`Server error ${response.status}: ${t}`); }
            pushLog(" Upload accepted — running inference…");

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";

            while (true) {
                const { done: sd, value } = await reader.read();
                if (sd) break;
                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split("\n\n");
                buffer = events.pop();

                for (const raw of events) {
                    const trimmed = raw.trim();
                    if (!trimmed.startsWith("data:")) continue;
                    const jsonStr = trimmed.replace(/^data:\s*/, "");
                    if (!jsonStr) continue;
                    let data;
                    try { data = JSON.parse(jsonStr); } catch { continue; }

                    switch (data.type) {
                        case "log": pushLog(data.msg); break;
                        case "threshold": setThreshold(data.value); pushLog(`🎯 Threshold: ${data.value}`); break;
                        case "frame": {
                            const f = {
                                idx: data.frame_idx, score: data.score, isAnomaly: data.is_anomaly,
                                temporal: data.temporal ?? 0, temporalLong: data.temporal_long ?? 0,
                                spatial: data.spatial ?? 0, energy: data.energy ?? 0, uncertainty: data.uncertainty ?? 0,
                            };
                            setFrames((prev) => [...prev, f]);
                            setProgress({ current: data.frame_idx + 1, total: data.total_est || "?" });
                            if (data.frame_b64) {
                                setLastFrame({ ...f, b64: data.frame_b64 });
                                if (data.is_anomaly) setAnomalyFrameImages((prev) => [...prev, { ...f, b64: data.frame_b64 }]);
                            }
                            break;
                        }
                        case "done":
                            setDone(true); setTotalFrames(data.total_frames);
                            pushLog(`🏁 Inference complete — ${data.total_frames} frames processed.`); break;
                        case "error":
                            pushLog(`❌ ${data.msg}`);
                            if (data.trace) console.error(data.trace);
                            setError(data.msg); setLoading(false); return;
                        default: break;
                    }
                }
            }
        } catch (err) {
            setError(err.message); pushLog(`❌ ${err.message}`);
        } finally {
            setLoading(false); setProgress(null);
        }
    };

    // ── Frame extraction ──────────────────────────────────────────────────────
    const extractFrameFromVideo = useCallback((videoEl, timeSec) => {
        return new Promise((resolve) => {
            const canvas = document.createElement("canvas");
            const onSeeked = () => {
                canvas.width = videoEl.videoWidth; canvas.height = videoEl.videoHeight;
                canvas.getContext("2d").drawImage(videoEl, 0, 0);
                resolve(canvas.toDataURL("image/jpeg", 0.85));
                videoEl.removeEventListener("seeked", onSeeked);
            };
            videoEl.addEventListener("seeked", onSeeked);
            videoEl.currentTime = timeSec;
        });
    }, []);

    useEffect(() => {
        if (!done || !anomalyFrameImages.length || !videoURL) return;
        const videoEl = hiddenVideoRef.current;
        if (!videoEl) return;
        const doExtract = async () => {
            if (videoEl.readyState < 1)
                await new Promise((r) => videoEl.addEventListener("loadedmetadata", r, { once: true }));
            const duration = videoEl.duration;
            const estTotal = totalFrames || frames.length || 1;
            const top = [...anomalyFrameImages].sort((a, b) => b.score - a.score).slice(0, 10);
            const extracted = {};
            for (const fr of top) {
                const t = Math.min((fr.idx / estTotal) * duration, duration - 0.01);
                try { extracted[fr.idx] = await extractFrameFromVideo(videoEl, t); } catch (_) { }
            }
            setOriginalFrames(extracted);
        };
        doExtract();
    }, [done, anomalyFrameImages, videoURL, totalFrames, frames.length, extractFrameFromVideo]);

    // ── Webcam ────────────────────────────────────────────────────────────────
    const stopWebcam = useCallback(() => {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        if (wsRef.current) { try { wsRef.current.send("stop"); } catch (_) { } wsRef.current.close(); wsRef.current = null; }
        if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
        setWcStatus("stopped"); pendingRef.current = false;
    }, []);

    const startWebcam = useCallback(async () => {
        setWcError(null); setWcFrames([]); setWcLastFrame(null);
        setWcAnomalyCount(0); setWcStatus("requesting");

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false,
            });
        } catch (err) {
            setWcError(`Camera access denied: ${err.message}`); setWcStatus("idle"); return;
        }

        streamRef.current = stream;
        if (webcamVideoRef.current) { webcamVideoRef.current.srcObject = stream; webcamVideoRef.current.play().catch(() => { }); }
        setWcStatus("connecting");

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => { ws.send(JSON.stringify({ threshold_override: wcThresholdOvr })); };

        ws.onmessage = (event) => {
            let data;
            try { data = JSON.parse(event.data); } catch (_) { return; }

            if (data.type === "ready") {
                setWcThreshold(data.threshold);
                setWcStatus("streaming");
                const intervalMs = Math.round(1000 / wcFps);
                intervalRef.current = setInterval(() => {
                    if (pendingRef.current) return;
                    if (!webcamVideoRef.current || !canvasRef.current) return;
                    if (ws.readyState !== WebSocket.OPEN) return;

                    const vid = webcamVideoRef.current;
                    const canvas = canvasRef.current;

                    // ── FIX: guard against black/empty frames ──────────────────
                    // readyState < 2 = no decoded frame yet (HAVE_CURRENT_DATA=2)
                    // videoWidth === 0 = stream dimensions not known yet
                    if (vid.readyState < 2 || vid.videoWidth === 0 || vid.paused) return;

                    canvas.width  = vid.videoWidth;
                    canvas.height = vid.videoHeight;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);

                    // Skip if center pixel is fully transparent (canvas not yet painted)
                    const sample = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
                    if (sample[3] === 0) return;
                    // ──────────────────────────────────────────────────────────

                    canvas.toBlob((blob) => {
                        if (!blob) return;
                        blob.arrayBuffer().then((buf) => {
                            if (ws.readyState === WebSocket.OPEN) { pendingRef.current = true; ws.send(buf); }
                        });
                    }, "image/jpeg", 0.75);
                }, intervalMs);
                return;
            }
            if (data.type === "error") { setWcError(data.msg); stopWebcam(); return; }
            if (data.type === "frame") {
                pendingRef.current = false;
                const entry = {
                    idx: data.frame_idx, score: data.score, isAnomaly: data.is_anomaly,
                    temporal: data.temporal ?? 0, temporalLong: data.temporal_long ?? 0,
                    spatial: data.spatial ?? 0, energy: data.energy ?? 0, uncertainty: data.uncertainty ?? 0,
                    b64: data.frame_b64,
                };
                setWcLastFrame(entry);
                if (entry.isAnomaly) setWcAnomalyCount((n) => n + 1);
                setWcFrames((prev) => { const next = [...prev, entry]; return next.length > 300 ? next.slice(-300) : next; });
            }
        };

        ws.onerror = () => { setWcError("WebSocket connection failed. Make sure the model is trained and calibrated."); stopWebcam(); };
        ws.onclose = () => {
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
            setWcStatus((s) => s === "streaming" ? "stopped" : s);
        };
    }, [wcThresholdOvr, wcFps, stopWebcam]);

    useEffect(() => {
        if (mode === "webcam" && wcThreshold === null) {
            fetch(`${BASE_URL}/api/calibration-status`)
                .then((r) => r.ok ? r.json() : null)
                .then((d) => { if (d?.threshold) setWcThreshold(d.threshold); })
                .catch(() => { });
        }
    }, [mode]);

    // Attach stream to video tag once it mounts during streaming state
    useEffect(() => {
        if (wcStatus === "streaming" && webcamVideoRef.current && streamRef.current) {
            if (webcamVideoRef.current.srcObject !== streamRef.current) {
                webcamVideoRef.current.srcObject = streamRef.current;
            }
            webcamVideoRef.current.play().catch(() => { });
        }
    }, [wcStatus]);

    // ── Derived ───────────────────────────────────────────────────────────────
    const anomalyFrames = frames.filter((f) => f.isAnomaly);
    const anomalyPct = frames.length ? ((anomalyFrames.length / frames.length) * 100).toFixed(1) : "—";
    const maxScore = frames.length ? Math.max(...frames.map((f) => f.score)).toFixed(4) : "—";
    const avgScore = frames.length ? (frames.reduce((s, f) => s + f.score, 0) / frames.length).toFixed(4) : "—";
    const chartData = frames.map((f) => ({ frame: f.idx, score: parseFloat(f.score.toFixed(4)) }));
    const sortedByScore = [...anomalyFrameImages].sort((a, b) => b.score - a.score);
    const wcChartData = wcFrames.map((f) => ({ frame: f.idx, score: parseFloat(f.score.toFixed(4)) }));
    const progressPct = progress && progress.total !== "?"
        ? Math.min(Math.round((progress.current / progress.total) * 100), 100) : null;

    const wcStatusLabel = {
        idle: null, requesting: "Requesting camera…",
        connecting: "Connecting to server…", streaming: "🔴 Live", stopped: "Stream stopped",
    }[wcStatus];

    return (
        <>
            <Navbar />
            <section className="bg-oxford-blue text-tan min-h-screen">
                <style>{`
                    @keyframes fade-up   { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
                    @keyframes bar-shimmer { from { transform:translateX(-100%) } to { transform:translateX(500%) } }
                    @keyframes pulse-border { 0%,100% { opacity:.5 } 50% { opacity:1 } }
                    .fade-up { animation: fade-up .35s ease forwards; }
                    .drop-pulse { animation: pulse-border 1.5s ease-in-out infinite; }
                `}</style>

                {/* ── Mode toggle ── */}
                <div className="flex justify-center gap-3 pt-10 pb-2 px-4">
                    {[
                        { key: "upload", label: "Upload Video", icon: <FolderOpen size={16} /> },
                        { key: "webcam", label: "Live Webcam", icon: <Video size={16} /> },
                    ].map(({ key, label, icon }) => (
                        <button key={key} onClick={() => setMode(key)}
                            className={`px-5 sm:px-7 py-2.5 montserrat font-semibold text-xs sm:text-sm transition-all cursor-pointer duration-600 border border-transparent ${mode === key
                                ? "border-transparent bg-tan text-oxford-blue shadow-lg shadow-tan/20"
                                : "hover:border-white/50 text-tan/60 hover:border-tan/50 hover:text-tan/80"
                                }`}>
                            <div className="flex space-x-4 items-center justify-between">
                                <h1 className="mr-2">{label}</h1>
                                {icon}
                            </div>
                        </button>
                    ))}
                </div>

                {/* ════════════════════════════════════════
                    MODE A — UPLOAD
                   ════════════════════════════════════════ */}
                {mode === "upload" && (
                    <>
                        {/* ── Hero / upload ── */}
                        <div className="flex flex-col w-full min-h-screen px-5 sm:px-10 py-14 items-center justify-center text-center border-b border-tan/10">

                            <div className="flex items-center gap-2 mb-6">
                                <span className="w-5 h-5 rounded-full border border-tan/30 flex items-center justify-center text-[10px] montserrat opacity-50">3</span>
                                <span className="text-[10px] montserrat tracking-[0.25em] uppercase opacity-40">Detection</span>
                            </div>

                            <h2 className="text-4xl sm:text-5xl font-semibold montserrat leading-tight mb-3">Detect Anomalies</h2>
                            <p className="text-sm opacity-40 montserrat max-w-md leading-relaxed mb-12">
                                Upload a test video. The JEPA model scores every frame against the calibrated threshold and flags what doesn't belong.
                            </p>

                            {videoURL && <video ref={hiddenVideoRef} src={videoURL} preload="auto" muted style={{ display: "none" }} />}

                            {/* ── Drop zone ── */}
                            <div className="w-full max-w-2xl">
                                {!video ? (
                                    <div
                                        onClick={() => inputRef.current?.click()}
                                        onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
                                        className={`relative cursor-pointer rounded-2xl transition-all duration-300 select-none ${dragOver ? "scale-[1.01]" : ""
                                            }`}
                                        style={{ padding: "2px" }}
                                    >
                                        {/* Gradient border */}
                                        <div className={`absolute inset-0 rounded-2xl pointer-events-none ${dragOver ? "drop-pulse" : ""}`}
                                            style={{
                                                background: dragOver
                                                    ? "linear-gradient(135deg, #d2b48c, rgba(210,180,140,.3), #d2b48c)"
                                                    : "linear-gradient(135deg, rgba(210,180,140,.25) 0%, rgba(210,180,140,.05) 50%, rgba(210,180,140,.25) 100%)",
                                                WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                                                WebkitMaskComposite: "xor", maskComposite: "exclude",
                                                padding: "1.5px", borderRadius: "1rem",
                                            }} />
                                        <div className={`relative rounded-2xl px-8 py-14 flex flex-col items-center gap-5 transition-colors duration-200 ${dragOver ? "bg-tan/5" : "bg-linear-to-br from-black/20 to-black/80  hover:bg-black/20"
                                            }`}>
                                            <div className={`w-18 h-18 w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${dragOver ? "scale-110 border-tan/50 bg-tan/10" : ""}`}>
                                                {dragOver ? (
                                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-tan">
                                                        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                                                    </svg>
                                                ) : (
                                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-50">
                                                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                                        <line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
                                                    </svg>
                                                )}
                                            </div>
                                            <div>
                                                <p className="montserrat text-base font-semibold opacity-80">
                                                    {dragOver ? "Drop to upload" : "Drop test video here"}
                                                </p>
                                                <p className="montserrat text-xs opacity-35 mt-1.5">
                                                    or <span className="text-tan/70 underline underline-offset-2">browse files</span> · MP4, MOV, AVI · max 200 MB
                                                </p>
                                            </div>
                                            <div className="flex gap-2">
                                                {["MP4", "MOV", "AVI", "MKV"].map((fmt) => (
                                                    <span key={fmt} className="px-2.5 py-0.5 rounded-full text-[10px] montserrat border border-tan/15 opacity-35">{fmt}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-2xl overflow-hidden border border-tan/15 bg-slate-900/40 fade-up">
                                        <video key={videoURL} src={videoURL} controls className="w-full bg-black" style={{ maxHeight: 460 }} />
                                        <div className="flex items-center justify-between px-5 py-3 bg-slate-900/80 border-t border-tan/10">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60">
                                                        <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                                    </svg>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs montserrat opacity-70 truncate leading-none">{video.name}</p>
                                                    <p className="text-[10px] montserrat opacity-30 mt-0.5">{(video.size / 1024 / 1024).toFixed(1)} MB</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                                                <button onClick={() => inputRef.current?.click()} className="text-[11px] montserrat opacity-40 hover:opacity-80 transition underline underline-offset-2">Change</button>
                                                <button onClick={removeFile} className="w-6 h-6 rounded-full border border-tan/20 flex items-center justify-center opacity-40 hover:opacity-80 transition text-xs">✕</button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <input ref={inputRef} type="file" accept="video/*" onChange={handleChange} className="hidden" />

                            {/* Advanced options */}
                            <button onClick={() => setShowAdvanced((v) => !v)}
                                className="text-xs opacity-40 hover:opacity-70 transition underline underline-offset-2 montserrat">
                                {showAdvanced ? "▲ Hide advanced options" : "▼ Show advanced options"}
                            </button>

                            {showAdvanced && (
                                <div className="mt-4 w-full max-w-md bg-linear-to-br from-black/80 via-black/50 to-black/35 rounded-md p-5 grid grid-cols-2 gap-4 text-left montserrat fade-up">
                                    {[
                                        { label: "Max Frames (0 = all)", val: maxFrames, set: setMaxFrames, step: 1, min: 0 },
                                        { label: "Show Frame Every N", val: showEvery, set: setShowEvery, step: 1, min: 1 },
                                        { label: "Threshold Override", val: thresholdOverride, set: setThresholdOverride, step: 0.001, min: 0 },
                                    ].map(({ label, val, set, step, min }) => (
                                        <label key={label} className="flex flex-col gap-1.5 col-span-1">
                                            <span className="opacity-40 text-[10px] uppercase tracking-wide">{label}</span>
                                            <input type="number" min={min} step={step} value={val} onChange={(e) => set(Number(e.target.value))}
                                                className="bg-black/60 rounded-md px-3 py-1.5 text-tan text-xs focus:outline-none focus:border-tan/40" />
                                        </label>
                                    ))}
                                    <label className="flex items-center gap-2 cursor-pointer col-span-1 mt-1">
                                        <input type="checkbox" checked={maskHumans} onChange={(e) => setMaskHumans(e.target.checked)} className="accent-tan w-4 h-4" />
                                        <span className="opacity-60 text-xs">Mask Humans (YOLO)</span>
                                    </label>
                                </div>
                            )}

                            {/* Run button */}
                            <button onClick={handleDetect} disabled={loading || !video}
                                className={`
                                    mt-8 px-12 py-3.5 montserrat font-semibold text-sm tracking-wide
                                    transition-all duration-200
                                    ${!video ? "opacity-20 border border-tan/20 cursor-not-allowed"
                                        : loading ? "border border-tan/40 opacity-60 cursor-wait"
                                            : "bg-tan text-oxford-blue hover:opacity-90 active:scale-95 shadow-lg shadow-tan/20 cursor-pointer"}
                                `}>
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                                        </svg>
                                        Analysing…
                                    </span>
                                ) : "Run Detection →"}
                            </button>

                            {/* Progress bar */}
                            {loading && progress && (
                                <div className="mt-7 w-full max-w-md fade-up">
                                    <div className="flex justify-between text-xs montserrat opacity-50 mb-2">
                                        <span>Frame {progress.current} / {progress.total}</span>
                                        {progressPct !== null && <span>{progressPct}%</span>}
                                    </div>
                                    <div className="relative w-full h-1 bg-black/50 rounded-full overflow-hidden">
                                        <div className="absolute inset-y-0 left-0 bg-tan rounded-full transition-all duration-300"
                                            style={{ width: progressPct !== null ? `${progressPct}%` : "100%" }} />
                                        <div className="absolute inset-y-0 w-12 opacity-60"
                                            style={{
                                                left: `${Math.max((progressPct ?? 50) - 5, 0)}%`,
                                                background: "linear-gradient(90deg,transparent,rgba(210,180,140,.7),transparent)",
                                                animation: "bar-shimmer 1.4s linear infinite",
                                            }} />
                                    </div>
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="mt-6 w-full max-w-xl bg-red-950/40 border border-red-500/40 rounded-xl px-5 py-4 text-left fade-up">
                                    <p className="text-xs font-semibold montserrat text-red-400 mb-1">Error</p>
                                    <p className="text-xs montserrat text-red-300/70">{error}</p>
                                </div>
                            )}

                            {/* Log console */}
                            {logs.length > 0 && (
                                <div className="mt-5 w-full max-w-2xl rounded-md bg-black px-5 py-4 text-[11px] ibm-mono max-h-40 overflow-y-auto fade-up">
                                    {logs.map((log, i) => <div key={i} className="opacity-60 leading-relaxed whitespace-pre-wrap py-0.5">{log}</div>)}
                                    <div ref={logEndRef} />
                                </div>
                            )}
                        </div>

                        {/* ── Live inference ── */}
                        {(lastFrame || frames.length > 0) && (
                            <div className="w-full px-5 sm:px-10 py-14 border-b border-tan/10">
                                <SectionHeader title="Live Inference" sub="Most recently scored frame + component breakdown" />
                                <div className="flex flex-col lg:flex-row gap-8 items-start justify-center max-w-5xl mx-auto">
                                    {lastFrame?.b64 && (
                                        <div className="w-full lg:w-[420px] flex-shrink-0">
                                            <div className={`relative rounded-2xl overflow-hidden border-2 transition-colors duration-300 ${lastFrame.isAnomaly ? "border-red-500" : "border-green-500/40"}`}>
                                                <img src={`data:image/jpeg;base64,${lastFrame.b64}`} alt="" className="w-full object-cover" />
                                                <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-semibold montserrat ${lastFrame.isAnomaly ? "bg-red-500 text-white" : "bg-green-500/80 text-white"}`}>
                                                    {lastFrame.isAnomaly ? "⚠ ANOMALY" : "✓ NORMAL"}
                                                </div>
                                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3">
                                                    <p className="text-xs montserrat opacity-70">
                                                        Frame {lastFrame.idx} &nbsp;·&nbsp; Score:&nbsp;
                                                        <span className={`font-semibold ${lastFrame.isAnomaly ? "text-red-400" : "text-green-400"}`}>
                                                            {lastFrame.score.toFixed(4)}
                                                        </span>
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {lastFrame && (
                                        <div className="flex-1 w-full">
                                            <div className="bg-black/30 rounded-2xl p-5 sm:p-6 space-y-4">
                                                <p className="text-[10px] montserrat tracking-[0.2em] uppercase opacity-35 mb-4">
                                                    Component Scores — Frame {lastFrame.idx}
                                                </p>
                                                <ScoreBar label="Temporal (Short)" value={lastFrame.temporal} color="#8884d8" />
                                                <ScoreBar label="Temporal (Long)" value={lastFrame.temporalLong} color="#a78bfa" />
                                                <ScoreBar label="Spatial" value={lastFrame.spatial} color="#38bdf8" />
                                                <ScoreBar label="Energy (SVDD)" value={lastFrame.energy} color="#fb923c" />
                                                <ScoreBar label="Uncertainty" value={lastFrame.uncertainty} color="#4ade80" max={1} />
                                                <div className="pt-4 mt-2 border-t border-tan/10 space-y-2">
                                                    <div className="flex justify-between text-sm montserrat">
                                                        <span className="opacity-40">Composite Score</span>
                                                        <span className={`font-semibold ${lastFrame.isAnomaly ? "text-red-400" : "text-green-400"}`}>{lastFrame.score.toFixed(4)}</span>
                                                    </div>
                                                    {threshold !== null && (
                                                        <div className="flex justify-between text-sm montserrat">
                                                            <span className="opacity-40">Calibrated Threshold</span>
                                                            <span className="opacity-60">{threshold}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Summary stats ── */}
                        {done && frames.length > 0 && (
                            <div className="w-full px-5 sm:px-10 py-14 border-b border-tan/10">
                                <SectionHeader title="Summary" sub="Overall detection results for this video" />
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto">
                                    <StatCard label="Total Frames" value={totalFrames} />
                                    <StatCard label="Anomaly Frames" value={anomalyFrames.length} highlight={anomalyFrames.length > 0} sub={`of ${totalFrames} frames`} />
                                    <StatCard label="Anomaly %" value={`${anomalyPct}%`} highlight={parseFloat(anomalyPct) > 10} />
                                    <StatCard label="Peak Score" value={maxScore} sub={`avg ${avgScore}`} />
                                </div>
                            </div>
                        )}

                        {/* ── Score timeline ── */}
                        {frames.length > 1 && (
                            <div className="w-full px-5 sm:px-10 py-14 border-b border-tan/10">
                                <SectionHeader title="Anomaly Score Timeline" sub="Per-frame composite score — red dashed line is the calibrated threshold" />
                                {/* FIX: explicit px height wrapper silences width(-1)/height(-1) warning */}
                                <div className="bg-black/30 rounded-2xl p-4 sm:p-6 max-w-5xl mx-auto">
                                    <div style={{ width: "100%", height: 300 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={chartData} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                                <XAxis dataKey="frame" stroke="#475569" tick={{ fill: "#64748b", fontSize: 10 }}
                                                    label={{ value: "Frame", position: "insideBottom", offset: -2, fill: "#64748b" }} />
                                                <YAxis stroke="#475569" tick={{ fill: "#64748b", fontSize: 10 }}
                                                    label={{ value: "Score", angle: -90, position: "insideLeft", fill: "#64748b" }} />
                                                <Tooltip content={<ChartTooltip />} />
                                                {threshold !== null && (
                                                    <ReferenceLine y={threshold} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 4"
                                                        label={{ value: "Threshold", fill: "#ef4444", fontSize: 10, position: "insideTopRight" }} />
                                                )}
                                                <Line type="monotone" dataKey="score" stroke="#8884d8" strokeWidth={1.5} dot={false} activeDot={{ r: 4, fill: "#8884d8" }} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Anomaly gallery ── */}
                        {done && sortedByScore.length > 0 && (
                            <div className="w-full px-5 sm:px-10 py-14 border-b border-tan/10">
                                <SectionHeader
                                    title={`🚨 ${sortedByScore.length} Anomal${sortedByScore.length === 1 ? "y" : "ies"} Detected`}
                                    sub="Ranked by score — highest anomaly confidence first (up to 20)"
                                />
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 max-w-7xl mx-auto">
                                    {sortedByScore.slice(0, 20).map((fr, i) => (
                                        <div key={`anom-${fr.idx}-${i}`}
                                            className="rounded-2xl overflow-hidden border border-red-500/40 bg-slate-900/50 hover:border-red-500/70 transition-colors duration-200">
                                            <div className="relative">
                                                <img src={`data:image/jpeg;base64,${fr.b64}`} alt="" className="w-full object-cover" />
                                                <div className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold montserrat px-2 py-0.5 rounded-full">#{i + 1}</div>
                                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
                                                    <p className="text-[10px] montserrat opacity-60">Frame {fr.idx}</p>
                                                </div>
                                            </div>
                                            <div className="p-3.5 space-y-1.5 text-[11px] montserrat">
                                                <div className="flex justify-between items-center pb-1.5 border-b border-tan/10">
                                                    <span className="opacity-50">Score</span>
                                                    <span className="text-red-400 font-semibold text-xs">{fr.score.toFixed(4)}</span>
                                                </div>
                                                {[
                                                    ["T-Short", fr.temporal],
                                                    ["T-Long", fr.temporalLong],
                                                    ["Spatial", fr.spatial],
                                                    ["Energy", fr.energy],
                                                ].map(([k, v]) => (
                                                    <div key={k} className="flex justify-between">
                                                        <span className="opacity-30">{k}</span>
                                                        <span className="opacity-60">{v.toFixed(3)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {sortedByScore.length > 20 && (
                                    <p className="text-xs opacity-30 montserrat text-center mt-6">… and {sortedByScore.length - 20} more anomaly frames</p>
                                )}
                            </div>
                        )}

                        {/* ── Side-by-side ── */}
                        {done && sortedByScore.length > 0 && Object.keys(originalFrames).length > 0 && (
                            <div className="w-full px-5 sm:px-10 py-14 border-b border-tan/10">
                                <SectionHeader title="Original vs Anomaly" sub="Extracted original frame compared with the detection result" />
                                <div className="space-y-12 max-w-5xl mx-auto">
                                    {sortedByScore.slice(0, 10).map((fr) => originalFrames[fr.idx] && (
                                        <div key={`cmp-${fr.idx}`}>
                                            <p className="text-xs montserrat opacity-40 mb-4 text-center">
                                                Frame #{fr.idx} · Score:&nbsp;
                                                <span className="text-red-400 font-semibold">{fr.score.toFixed(4)}</span>
                                            </p>
                                            <div className="flex flex-col md:flex-row gap-4 items-stretch">
                                                <div className="flex-1 rounded-2xl overflow-hidden border border-green-500/30 bg-slate-900/30">
                                                    <div className="relative">
                                                        <img src={originalFrames[fr.idx]} alt="" className="w-full object-cover" />
                                                        <div className="absolute top-3 right-3 bg-green-500/80 text-white text-[10px] font-bold montserrat px-3 py-1 rounded-full">ORIGINAL</div>
                                                    </div>
                                                </div>
                                                <div className="hidden md:flex items-center justify-center px-2">
                                                    <span className="text-sm font-bold opacity-15 montserrat">VS</span>
                                                </div>
                                                <div className="flex-1 rounded-2xl overflow-hidden border border-red-500/50 bg-slate-900/30">
                                                    <div className="relative">
                                                        <img src={`data:image/jpeg;base64,${fr.b64}`} alt="" className="w-full object-cover" />
                                                        <div className="absolute top-3 right-3 bg-red-500 text-white text-[10px] font-bold montserrat px-3 py-1 rounded-full">⚠ ANOMALY</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {done && anomalyFrames.length === 0 && (
                            <div className="w-full px-5 py-16 text-center fade-up">
                                <div className="inline-flex flex-col items-center gap-3 bg-green-900/20 border border-green-500/30 rounded-2xl px-10 py-7">
                                    <CheckCircle2 size={30} className="text-green-500" />
                                    <p className="text-base montserrat text-green-400 font-semibold">No anomalies detected</p>
                                    <p className="text-xs montserrat opacity-40">All {totalFrames} frames scored within normal range.</p>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ════════════════════════════════════════
                    MODE B — LIVE WEBCAM
                   ════════════════════════════════════════ */}
                {mode === "webcam" && (
                    <div className="w-full px-5 sm:px-10 py-14">
                        <canvas ref={canvasRef} style={{ display: "none" }} />

                        <div className="max-w-5xl mx-auto">
                            {/* Header */}
                            <div className="text-center mb-10">
                                <div className="flex items-center justify-center gap-2 mb-4">
                                    <div className={`w-2 h-2 rounded-full ${wcStatus === "streaming" ? "bg-red-500 animate-pulse" : "bg-tan/30"}`} />
                                    <span className="text-[10px] montserrat tracking-[0.25em] uppercase opacity-40">
                                        {wcStatus === "streaming" ? "Live" : "Webcam"}
                                    </span>
                                </div>
                                <h2 className="text-3xl sm:text-4xl font-semibold montserrat mb-3">Live Anomaly Detection</h2>
                                <p className="text-sm opacity-40 montserrat max-w-md mx-auto leading-relaxed">
                                    Your browser captures the webcam and sends frames to the JEPA model. Results stream back in real-time.
                                </p>
                            </div>

                            {/* Config panel */}
                            {(wcStatus === "idle" || wcStatus === "stopped") && (
                                <div className="max-w-sm mx-auto bg-linear-to-br
                                   from-black/80 via-black/50 to-black/35 rounded-md
                                 p-6 mb-8 fade-up">
                                    <p className="text-[10px] montserrat tracking-[0.2em] uppercase opacity-30 mb-4">Stream Settings</p>
                                    <div className="space-y-4">
                                        <label className="flex flex-col gap-1.5">
                                            <span className="opacity-40 text-[10px] montserrat uppercase tracking-wide">Frames / second</span>
                                            <div className="flex items-center gap-3">
                                                <input type="range" min={1} max={8} value={wcFps}
                                                    onChange={(e) => setWcFps(Number(e.target.value))}
                                                    className="flex-1 accent-tan" />
                                                <span className="text-sm montserrat opacity-70 w-6 text-right">{wcFps}</span>
                                            </div>
                                        </label>
                                        <label className="flex flex-col gap-1.5">
                                            <span className="opacity-40 text-[10px] montserrat uppercase tracking-wide">Threshold override (0 = auto)</span>
                                            <input type="number" min={0} step={0.001} value={wcThresholdOvr}
                                                onChange={(e) => setWcThresholdOvr(Number(e.target.value))}
                                                className="bg-black/60 backdrop-blur-2xl rounded-lg px-3 py-1.5 text-tan text-xs montserrat focus:outline-none focus:border-tan/40" />
                                        </label>
                                    </div>
                                    {wcThreshold !== null && (
                                        <div className="mt-4 pt-4 border-t border-tan/10 flex justify-between text-xs montserrat">
                                            <span className="opacity-35">Calibrated threshold</span>
                                            <span className="opacity-60">{wcThreshold.toFixed(4)}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Start / Stop */}
                            <div className="flex justify-center mb-6">
                                {wcStatus !== "streaming" ? (
                                    <button onClick={startWebcam}
                                        disabled={wcStatus === "requesting" || wcStatus === "connecting"}
                                        className={`px-10 py-3 rounded-md montserrat font-semibold text-sm tracking-wide transition-all duration-200 ${wcStatus === "requesting" || wcStatus === "connecting"
                                            ? "border border-tan/30 opacity-50 cursor-wait"
                                            : "bg-tan text-oxford-blue hover:opacity-90 active:scale-95 shadow-lg shadow-tan/20"
                                            }`}>
                                        {wcStatus === "requesting" ? (
                                            <span className="flex items-center gap-2">
                                                <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                                                </svg>
                                                Requesting camera…
                                            </span>
                                        ) : wcStatus === "connecting" ? "Connecting…" : "▶ Start Stream"}
                                    </button>
                                ) : (
                                    <button onClick={stopWebcam}
                                        className="px-10 py-3 bg-red-500/80 text-white rounded-xl hover:bg-red-600 transition montserrat font-semibold text-sm">
                                        ⏹ Stop Stream
                                    </button>
                                )}
                            </div>

                            {/* Status pill */}
                            {wcStatusLabel && (
                                <div className="flex justify-center mb-6">
                                    <span className={`px-4 py-1.5 rounded-full text-xs font-semibold montserrat  ${wcStatus === "streaming"
                                        ? "bg-red-500/15 text-red-400 border-red-500/30"
                                        : "bg-white/10 backdrop-blur-2xl"
                                        }`}>
                                        {wcStatusLabel}
                                    </span>
                                </div>
                            )}

                            {/* Error */}
                            {wcError && (
                                <div className="max-w-xl mx-auto mb-6 bg-red-950/40 border border-red-500/40 rounded-xl px-5 py-4 fade-up">
                                    <p className="text-xs font-semibold montserrat text-red-400 mb-1">Error</p>
                                    <p className="text-xs montserrat text-red-300/70">{wcError}</p>
                                </div>
                            )}

                            {/* Live feeds */}
                            {(wcStatus === "streaming" || wcLastFrame) && (
                                <div className="flex flex-col lg:flex-row gap-5 items-start justify-center mb-10">
                                    {/* Raw webcam */}
                                    <div className="flex-1 w-full">
                                        <p className="text-[10px] montserrat tracking-[0.2em] uppercase opacity-30 mb-2.5 text-center">Camera Feed</p>
                                        <div className="rounded-2xl overflow-hidden border border-tan/15 bg-black">
                                            <video ref={webcamVideoRef} autoPlay muted playsInline
                                                className="w-full object-cover" style={{ maxHeight: 340 }} />
                                        </div>
                                    </div>

                                    {/* Scored frame */}
                                    {wcLastFrame?.b64 && (
                                        <div className="flex-1 w-full">
                                            <p className="text-[10px] montserrat tracking-[0.2em] uppercase opacity-30 mb-2.5 text-center">Scored Frame</p>
                                            <div className={`rounded-2xl overflow-hidden border-2 transition-colors duration-300 ${wcLastFrame.isAnomaly ? "border-red-500" : "border-green-500/40"
                                                }`}>
                                                <div className="relative">
                                                    <img src={`data:image/jpeg;base64,${wcLastFrame.b64}`} alt=""
                                                        className="w-full object-cover" style={{ maxHeight: 340 }} />
                                                    <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-semibold montserrat ${wcLastFrame.isAnomaly ? "bg-red-500 text-white animate-pulse" : "bg-green-500/80 text-white"
                                                        }`}>
                                                        {wcLastFrame.isAnomaly ? "ANOMALY" : "NORMAL"}
                                                    </div>
                                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3">
                                                        <p className="text-xs montserrat opacity-60">
                                                            Frame {wcLastFrame.idx} · Score:&nbsp;
                                                            <span className={`font-semibold ${wcLastFrame.isAnomaly ? "text-red-400" : "text-green-400"}`}>
                                                                {wcLastFrame.score.toFixed(4)}
                                                            </span>
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={`mt-2 rounded-xl px-4 py-2.5 text-center border ${wcLastFrame.isAnomaly
                                                ? "bg-red-900/30 border-red-500/40"
                                                : "bg-green-900/15 border-green-500/25"
                                                }`}>
                                                <p className={`text-sm montserrat font-semibold ${wcLastFrame.isAnomaly ? "text-red-400 animate-pulse" : "text-green-400"}`}>
                                                    {wcLastFrame.isAnomaly ? "🚨 Anomaly Detected" : "✅ Normal Operation"}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Component scores + session stats */}
                            {wcLastFrame && (
                                <div className="flex flex-col lg:flex-row gap-5 max-w-4xl mx-auto mb-10">
                                    <div className="flex-1 bg-slate-800/30 border border-tan/10 rounded-2xl p-5 space-y-4">
                                        <p className="text-[10px] montserrat tracking-[0.2em] uppercase opacity-30 mb-2">Component Scores</p>
                                        <ScoreBar label="Temporal (Short)" value={wcLastFrame.temporal} color="#8884d8" />
                                        <ScoreBar label="Temporal (Long)" value={wcLastFrame.temporalLong} color="#a78bfa" />
                                        <ScoreBar label="Spatial" value={wcLastFrame.spatial} color="#38bdf8" />
                                        <ScoreBar label="Energy (SVDD)" value={wcLastFrame.energy} color="#fb923c" />
                                        <ScoreBar label="Uncertainty" value={wcLastFrame.uncertainty} color="#4ade80" max={1} />
                                        <div className="pt-3 mt-1 border-t border-tan/10 space-y-2">
                                            <div className="flex justify-between text-xs montserrat">
                                                <span className="opacity-40">Composite</span>
                                                <span className={`font-semibold ${wcLastFrame.isAnomaly ? "text-red-400" : "text-green-400"}`}>{wcLastFrame.score.toFixed(4)}</span>
                                            </div>
                                            {wcThreshold && (
                                                <div className="flex justify-between text-xs montserrat">
                                                    <span className="opacity-40">Threshold</span>
                                                    <span className="opacity-60">{wcThreshold.toFixed(4)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex-1 space-y-3">
                                        <p className="text-[10px] montserrat tracking-[0.2em] uppercase opacity-30 mb-2">Session Stats</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <StatCard label="Frames Scored" value={wcFrames.length} />
                                            <StatCard label="Anomalies" value={wcAnomalyCount} highlight={wcAnomalyCount > 0} />
                                        </div>
                                        {wcFrames.length > 0 && (
                                            <div className="bg-slate-800/30 rounded-2xl p-4">
                                                <p className="text-[10px] montserrat tracking-[0.2em] uppercase opacity-30 mb-3">Anomaly Rate</p>
                                                <div className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-red-500 transition-all duration-500"
                                                        style={{ width: `${Math.min((wcAnomalyCount / wcFrames.length) * 100, 100)}%` }} />
                                                </div>
                                                <p className="text-xs montserrat opacity-40 mt-2">
                                                    {((wcAnomalyCount / wcFrames.length) * 100).toFixed(1)}% of frames flagged
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Live score timeline */}
                            {wcChartData.length > 2 && (
                                <div className="mt-6 mb-4">
                                    <p className="text-[10px] montserrat tracking-[0.2em] uppercase opacity-30 mb-4 text-center">Live Score Timeline</p>
                                    {/* FIX: explicit px height wrapper silences width(-1)/height(-1) warning */}
                                    <div className="bg-slate-800/30 border border-tan/10 rounded-2xl p-4 sm:p-6">
                                        <div style={{ width: "100%", height: 240 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={wcChartData} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                                    <XAxis dataKey="frame" stroke="#475569" tick={{ fill: "#64748b", fontSize: 10 }} />
                                                    <YAxis stroke="#475569" tick={{ fill: "#64748b", fontSize: 10 }} />
                                                    <Tooltip content={<ChartTooltip />} />
                                                    {wcThreshold && (
                                                        <ReferenceLine y={wcThreshold} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 4"
                                                            label={{ value: "Threshold", fill: "#ef4444", fontSize: 10, position: "insideTopRight" }} />
                                                    )}
                                                    <Line type="monotone" dataKey="score" stroke="#8884d8" strokeWidth={1.5}
                                                        dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {wcStatus === "idle" && !wcLastFrame && (
                                <p className="text-xs opacity-25 montserrat text-center mt-8">
                                    Configure settings above, then click "Start Stream" to begin live scoring.
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </section>
        </>
    );
};

export default Detect;