import React, { useState, useRef, useEffect, useCallback } from "react";
import "../index.css";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer,
    ReferenceLine,
} from "recharts";
import Navbar from "../components/Navbar.jsx";

const MAX_SIZE = 200 * 1024 * 1024;
const BASE_URL = "https://abhi02072005-jepa-backend.hf.space";
const WS_URL = BASE_URL.replace(/^https?/, "wss") + "/ws/webcam";

// ── Small UI primitives ──────────────────────────────────────────────────────

const ScoreBar = ({ label, value, max = 2, color = "#8884d8" }) => {
    const pct = Math.min((value / max) * 100, 100);
    return (
        <div className="w-full">
            <div className="flex justify-between text-xs opacity-60 mb-1 montserrat">
                <span>{label}</span>
                <span>{value.toFixed(4)}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-1.5">
                <div
                    className="h-1.5 rounded-full transition-all duration-200"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                />
            </div>
        </div>
    );
};

const StatCard = ({ label, value, highlight }) => (
    <div
        className={`flex flex-col items-center justify-center p-4 rounded-xl border ${highlight
            ? "border-red-500/60 bg-red-900/20"
            : "border-tan/20 bg-slate-800/40"
            }`}
    >
        <p className="text-xs opacity-50 montserrat mb-1">{label}</p>
        <p className={`text-2xl font-semibold montserrat ${highlight ? "text-red-400" : "text-tan"}`}>
            {value}
        </p>
    </div>
);

// ── Main component ───────────────────────────────────────────────────────────

const Detect = () => {
    // ── Mode toggle ──
    const [mode, setMode] = useState("upload"); // "upload" | "webcam"

    // ── Upload mode state ──
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
    const [originalFrames, setOriginalFrames] = useState({});  // { frameIdx: dataURL }

    // Advanced options
    const [maxFrames, setMaxFrames] = useState(0);
    const [showEvery, setShowEvery] = useState(5);
    const [maskHumans, setMaskHumans] = useState(true);
    const [thresholdOverride, setThresholdOverride] = useState(0);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // ── Webcam mode state ──
    const [wcConnected, setWcConnected] = useState(false);
    const [wcLoading, setWcLoading] = useState(false);
    const [wcFrames, setWcFrames] = useState([]);
    const [wcLastFrame, setWcLastFrame] = useState(null);
    const [wcThreshold, setWcThreshold] = useState(null);
    const [wcCamIndex, setWcCamIndex] = useState(0);
    const [wcAnalyzeEvery, setWcAnalyzeEvery] = useState(2);
    const [wcThresholdOvr, setWcThresholdOvr] = useState(0);
    const [wcError, setWcError] = useState(null);

    const wsRef = useRef(null);
    const inputRef = useRef(null);
    const logEndRef = useRef(null);
    const hiddenVideoRef = useRef(null);

    // Revoke object URL on cleanup
    useEffect(() => {
        return () => { if (videoURL) URL.revokeObjectURL(videoURL); };
    }, [videoURL]);

    // Cleanup websocket on unmount
    useEffect(() => {
        return () => {
            if (wsRef.current) {
                try { wsRef.current.send("stop"); } catch (_) { }
                wsRef.current.close();
            }
        };
    }, []);

    const pushLog = (msg) => {
        setLogs((prev) => [...prev, msg]);
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    };

    // ── Upload handlers ──────────────────────────────────────────────────────

    const handleChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith("video/")) {
            alert("Only video files allowed");
            e.target.value = "";
            return;
        }
        if (file.size > MAX_SIZE) {
            alert("Video must be under 200MB");
            e.target.value = "";
            return;
        }
        if (videoURL) URL.revokeObjectURL(videoURL);
        setVideo(file);
        setVideoURL(URL.createObjectURL(file));
        setError(null);
        setDone(false);
        setFrames([]);
        setLastFrame(null);
        setThreshold(null);
        setAnomalyFrameImages([]);
        setOriginalFrames({});
    };

    const handleDetect = async () => {
        if (!video) { alert("Select a video first"); return; }

        setLoading(true);
        setLogs([]);
        setError(null);
        setFrames([]);
        setLastFrame(null);
        setProgress(null);
        setThreshold(null);
        setDone(false);
        setTotalFrames(0);
        setAnomalyFrameImages([]);
        setOriginalFrames({});

        const formData = new FormData();
        formData.append("video", video);
        formData.append("max_frames", maxFrames);
        formData.append("show_every", showEvery);
        formData.append("mask_humans", maskHumans);
        formData.append("threshold_override", thresholdOverride);

        try {
            pushLog("📤 Uploading video for inference…");

            const response = await fetch(`${BASE_URL}/api/detect`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Server error ${response.status}: ${text}`);
            }

            pushLog("✅ Upload accepted — running inference…");

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";

            while (true) {
                const { done: streamDone, value } = await reader.read();
                if (streamDone) break;

                buffer += decoder.decode(value, { stream: true });

                const events = buffer.split("\n\n");
                buffer = events.pop();

                for (const raw of events) {
                    const trimmed = raw.trim();
                    if (!trimmed.startsWith("data:")) continue;

                    const jsonStr = trimmed.replace(/^data:\s*/, "");
                    if (!jsonStr) continue;

                    let data;
                    try { data = JSON.parse(jsonStr); }
                    catch (err) { console.warn("SSE parse error:", err, jsonStr); continue; }

                    switch (data.type) {
                        case "log":
                            pushLog(data.msg);
                            break;

                        case "threshold":
                            setThreshold(data.value);
                            pushLog(`🎯 Threshold: ${data.value}`);
                            break;

                        case "frame": {
                            const frameEntry = {
                                idx: data.frame_idx,
                                score: data.score,
                                isAnomaly: data.is_anomaly,
                                temporal: data.temporal ?? 0,
                                temporalLong: data.temporal_long ?? 0,
                                spatial: data.spatial ?? 0,
                                energy: data.energy ?? 0,
                                uncertainty: data.uncertainty ?? 0,
                            };
                            setFrames((prev) => [...prev, frameEntry]);
                            setProgress({ current: data.frame_idx + 1, total: data.total_est || "?" });

                            if (data.frame_b64) {
                                setLastFrame({ ...frameEntry, b64: data.frame_b64 });

                                // Store anomaly frames with images for the gallery
                                if (data.is_anomaly) {
                                    setAnomalyFrameImages((prev) => [
                                        ...prev,
                                        { ...frameEntry, b64: data.frame_b64 },
                                    ]);
                                }
                            }
                            break;
                        }

                        case "done":
                            setDone(true);
                            setTotalFrames(data.total_frames);
                            pushLog(`🏁 Inference complete — ${data.total_frames} frames processed.`);
                            break;

                        case "stream_end":
                            break;

                        case "error":
                            pushLog(`Server error: ${data.msg}`);
                            if (data.trace) console.error("Traceback:\n", data.trace);
                            setError(data.msg);
                            setLoading(false);
                            return;

                        default:
                            break;
                    }
                }
            }

        } catch (err) {
            console.error(err);
            setError(err.message || "Something went wrong");
            pushLog(`${err.message}`);
        } finally {
            setLoading(false);
            setProgress(null);
        }
    };

    // ── Webcam handlers ──────────────────────────────────────────────────────

    const startWebcam = useCallback(() => {
        setWcLoading(true);
        setWcError(null);
        setWcFrames([]);
        setWcLastFrame(null);

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            setWcConnected(true);
            setWcLoading(false);
            // Send config
            ws.send(JSON.stringify({
                cam_index: wcCamIndex,
                analyze_every: wcAnalyzeEvery,
                mask_humans: true,
                threshold_override: wcThresholdOvr,
            }));
        };

        ws.onmessage = (event) => {
            let data;
            try { data = JSON.parse(event.data); }
            catch (_) { return; }

            if (data.type === "error") {
                setWcError(data.msg);
                setWcConnected(false);
                return;
            }

            if (data.type === "frame") {
                const entry = {
                    idx: data.frame_idx,
                    score: data.score,
                    isAnomaly: data.is_anomaly,
                    temporal: data.temporal ?? 0,
                    temporalLong: data.temporal_long ?? 0,
                    spatial: data.spatial ?? 0,
                    energy: data.energy ?? 0,
                    uncertainty: data.uncertainty ?? 0,
                    b64: data.frame_b64,
                };
                setWcLastFrame(entry);
                setWcFrames((prev) => {
                    const next = [...prev, entry];
                    return next.length > 200 ? next.slice(-200) : next;
                });
                if (!wcThreshold && data.score) {
                    // We'll get threshold from calibration status
                }
            }
        };

        ws.onerror = () => {
            setWcError("WebSocket connection error");
            setWcLoading(false);
        };

        ws.onclose = () => {
            setWcConnected(false);
            setWcLoading(false);
        };
    }, [wcCamIndex, wcAnalyzeEvery, wcThresholdOvr, wcThreshold]);

    const stopWebcam = useCallback(() => {
        if (wsRef.current) {
            try { wsRef.current.send("stop"); } catch (_) { }
            wsRef.current.close();
            wsRef.current = null;
        }
        setWcConnected(false);
    }, []);

    // Fetch threshold for webcam mode
    useEffect(() => {
        if (mode === "webcam" && !wcThreshold) {
            fetch(`${BASE_URL}/api/calibration-status`)
                .then(r => r.ok ? r.json() : null)
                .then(d => { if (d) setWcThreshold(d.threshold); })
                .catch(() => { });
        }
    }, [mode, wcThreshold]);

    // ── Extract original frames from uploaded video for side-by-side ──
    const extractFrameFromVideo = useCallback((videoEl, timeSec) => {
        return new Promise((resolve) => {
            const canvas = document.createElement("canvas");
            const onSeeked = () => {
                canvas.width = videoEl.videoWidth;
                canvas.height = videoEl.videoHeight;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/jpeg", 0.85));
                videoEl.removeEventListener("seeked", onSeeked);
            };
            videoEl.addEventListener("seeked", onSeeked);
            videoEl.currentTime = timeSec;
        });
    }, []);

    useEffect(() => {
        if (!done || anomalyFrameImages.length === 0 || !videoURL) return;
        const videoEl = hiddenVideoRef.current;
        if (!videoEl) return;

        const doExtract = async () => {
            // Wait for video metadata to load
            if (videoEl.readyState < 1) {
                await new Promise((r) => videoEl.addEventListener("loadedmetadata", r, { once: true }));
            }
            const duration = videoEl.duration;
            const estTotal = totalFrames || frames.length || 1;

            const top = [...anomalyFrameImages]
                .sort((a, b) => b.score - a.score)
                .slice(0, 10);

            const extracted = {};
            for (const fr of top) {
                const timeSec = Math.min((fr.idx / estTotal) * duration, duration - 0.01);
                try {
                    extracted[fr.idx] = await extractFrameFromVideo(videoEl, timeSec);
                } catch (_) { /* skip */ }
            }
            setOriginalFrames(extracted);
        };

        doExtract();
    }, [done, anomalyFrameImages, videoURL, totalFrames, frames.length, extractFrameFromVideo]);

    // ── Derived stats ──────────────────────────────────────────────────────

    const anomalyFrames = frames.filter((f) => f.isAnomaly);
    const anomalyPct = frames.length ? ((anomalyFrames.length / frames.length) * 100).toFixed(1) : "—";
    const maxScore = frames.length ? Math.max(...frames.map((f) => f.score)).toFixed(4) : "—";
    const avgScore = frames.length
        ? (frames.reduce((s, f) => s + f.score, 0) / frames.length).toFixed(4)
        : "—";

    const chartData = frames.map((f) => ({
        frame: f.idx,
        score: parseFloat(f.score.toFixed(4)),
    }));

    const sortedByScore = [...anomalyFrameImages].sort((a, b) => b.score - a.score);

    // Webcam chart data
    const wcChartData = wcFrames.map((f) => ({
        frame: f.idx,
        score: parseFloat(f.score.toFixed(4)),
    }));

    const wcAnomalyCount = wcFrames.filter(f => f.isAnomaly).length;

    return (
        <>
            <Navbar />
            <section className="bg-oxford-blue text-tan min-h-screen">

                {/* ── Mode toggle ── */}
                <div className="flex justify-center gap-4 pt-8 pb-2">
                    <button
                        onClick={() => setMode("upload")}
                        className={`px-6 py-2 rounded-lg montserrat font-semibold text-sm transition-all duration-200 ${mode === "upload"
                            ? "bg-tan text-oxford-blue"
                            : "border border-tan/40 text-tan/70 hover:bg-tan/10"
                            }`}
                    >
                        📁 Upload Test Video
                    </button>
                    <button
                        onClick={() => setMode("webcam")}
                        className={`px-6 py-2 rounded-lg montserrat font-semibold text-sm transition-all duration-200 ${mode === "webcam"
                            ? "bg-tan text-oxford-blue"
                            : "border border-tan/40 text-tan/70 hover:bg-tan/10"
                            }`}
                    >
                        📹 Live Webcam Stream
                    </button>
                </div>

                {/* ════════════════════════════════════════════════════════════
                    MODE A — UPLOAD TEST VIDEO
                   ════════════════════════════════════════════════════════════ */}
                {mode === "upload" && (
                    <>
                        {/* ── Hero / upload ── */}
                        <div className="
                            flex flex-col w-full min-h-screen
                            px-6 py-12
                            items-center justify-center text-center
                            border-b border-tan
                        ">
                            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold montserrat">
                                Detect Anomalies
                            </h2>
                            <p className="mt-3 text-sm sm:text-base opacity-60 w-full sm:w-[70%] lg:w-[40%]">
                                Upload a test video to run frame-by-frame anomaly scoring against the trained JEPA model.
                            </p>

                            {/* Hidden video element for frame extraction */}
                            {videoURL && (
                                <video
                                    ref={hiddenVideoRef}
                                    src={videoURL}
                                    preload="auto"
                                    muted
                                    style={{ display: "none" }}
                                />
                            )}

                            <input
                                ref={inputRef}
                                type="file"
                                accept="video/*"
                                onChange={handleChange}
                                className="mt-8 lg:p-10 p-3 border border-dashed rounded-md cursor-pointer text-sm"
                            />

                            {/* ── Video preview ── */}
                            {videoURL && (
                                <div className="mt-6 w-full max-w-fit">
                                    <p className="text-xs opacity-50 montserrat mb-2 text-left">
                                        Preview — {video?.name} &nbsp;·&nbsp; {(video?.size / 1024 / 1024).toFixed(1)} MB
                                    </p>
                                    <video
                                        key={videoURL}
                                        src={videoURL}
                                        controls
                                        className="w-full rounded-xl bg-black"
                                        style={{ maxHeight: 480, minWidth: 480 }}
                                    />
                                </div>
                            )}

                            {video && !videoURL && (
                                <p className="mt-2 text-sm opacity-60">
                                    {video.name} &mdash; {(video.size / 1024 / 1024).toFixed(1)} MB
                                </p>
                            )}

                            {/* ── Advanced options toggle ── */}
                            <button
                                onClick={() => setShowAdvanced((v) => !v)}
                                className="mt-5 text-xs opacity-50 hover:opacity-100 transition underline montserrat"
                            >
                                {showAdvanced ? "▲ Hide advanced options" : "▼ Show advanced options"}
                            </button>

                            {showAdvanced && (
                                <div className="
                                    mt-4 w-full max-w-md
                                    bg-slate-800/50 border border-tan/20
                                    rounded-xl p-5
                                    grid grid-cols-2 gap-4
                                    text-left text-sm montserrat
                                ">
                                    <label className="flex flex-col gap-1">
                                        <span className="opacity-60 text-xs">Max Frames (0 = all)</span>
                                        <input
                                            type="number" min={0}
                                            value={maxFrames}
                                            onChange={(e) => setMaxFrames(Number(e.target.value))}
                                            className="bg-slate-700 border border-tan/20 rounded px-2 py-1 text-tan text-sm"
                                        />
                                    </label>

                                    <label className="flex flex-col gap-1">
                                        <span className="opacity-60 text-xs">Show Frame Every N</span>
                                        <input
                                            type="number" min={1}
                                            value={showEvery}
                                            onChange={(e) => setShowEvery(Number(e.target.value))}
                                            className="bg-slate-700 border border-tan/20 rounded px-2 py-1 text-tan text-sm"
                                        />
                                    </label>

                                    <label className="flex flex-col gap-1">
                                        <span className="opacity-60 text-xs">Threshold Override (0 = auto)</span>
                                        <input
                                            type="number" min={0} step={0.001}
                                            value={thresholdOverride}
                                            onChange={(e) => setThresholdOverride(Number(e.target.value))}
                                            className="bg-slate-700 border border-tan/20 rounded px-2 py-1 text-tan text-sm"
                                        />
                                    </label>

                                    <label className="flex items-center gap-2 cursor-pointer mt-4">
                                        <input
                                            type="checkbox"
                                            checked={maskHumans}
                                            onChange={(e) => setMaskHumans(e.target.checked)}
                                            className="accent-tan w-4 h-4"
                                        />
                                        <span className="opacity-80 text-xs">Mask Humans (YOLO)</span>
                                    </label>
                                </div>
                            )}

                            <button
                                onClick={handleDetect}
                                disabled={loading}
                                className="
                                    mt-6 px-8 py-2
                                    border border-tan rounded
                                    hover:bg-tan hover:text-yellow-700 cursor-pointer
                                    transition disabled:opacity-50 montserrat
                                "
                            >
                                {loading ? "Analysing…" : "Run Detection"}
                            </button>

                            {/* ── Progress bar ── */}
                            {loading && progress && (
                                <div className="mt-6 w-full max-w-md">
                                    <p className="text-sm mb-1 opacity-60 montserrat">
                                        Frame {progress.current} / {progress.total}
                                    </p>
                                    <div className="w-full bg-slate-700 rounded-full h-2">
                                        <div
                                            className="bg-tan h-2 rounded-full transition-all duration-150"
                                            style={{
                                                width: progress.total !== "?"
                                                    ? `${Math.min(Math.round((progress.current / progress.total) * 100), 100)}%`
                                                    : "100%",
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* ── Error banner ── */}
                            {error && (
                                <div className="mt-6 w-full max-w-xl bg-red-900/40 border border-red-500 rounded px-4 py-3 text-sm text-red-300 text-left">
                                    <strong>Error:</strong> {error}
                                </div>
                            )}

                            {/* ── Log console ── */}
                            {logs.length > 0 && (
                                <div className="
                                    mt-6 w-full max-w-2xl
                                    bg-black/40 border border-tan/20 rounded-lg
                                    px-4 py-3 text-left text-xs font-mono
                                    max-h-40 overflow-y-auto
                                ">
                                    {logs.map((log, i) => (
                                        <div key={i} className="opacity-70 leading-relaxed whitespace-pre-wrap">{log}</div>
                                    ))}
                                    <div ref={logEndRef} />
                                </div>
                            )}
                        </div>

                        {/* ── Live frame preview + component scores ── */}
                        {(lastFrame || frames.length > 0) && (
                            <div className="w-full px-6 py-12 border-b border-tan/20">
                                <h3 className="text-2xl font-semibold montserrat mb-8 text-center">
                                    Live Inference
                                </h3>

                                <div className="flex flex-col lg:flex-row gap-8 items-start justify-center max-w-5xl mx-auto">

                                    {/* Frame preview */}
                                    {lastFrame?.b64 && (
                                        <div className="flex-shrink-0 w-full lg:w-96">
                                            <div className={`relative rounded-xl overflow-hidden border-2 ${lastFrame.isAnomaly ? "border-red-500" : "border-green-500/50"
                                                }`}>
                                                <img
                                                    src={`data:image/jpeg;base64,${lastFrame.b64}`}
                                                    alt={`Frame ${lastFrame.idx}`}
                                                    className="w-full object-cover"
                                                />
                                                <div className={`
                                                    absolute top-3 right-3
                                                    px-3 py-1 rounded-full text-xs font-semibold montserrat
                                                    ${lastFrame.isAnomaly
                                                        ? "bg-red-500 text-white"
                                                        : "bg-green-500/80 text-white"}
                                                `}>
                                                    {lastFrame.isAnomaly ? "⚠ ANOMALY" : "✓ NORMAL"}
                                                </div>
                                                <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs montserrat">
                                                    Frame {lastFrame.idx} &nbsp;|&nbsp; Score: {lastFrame.score.toFixed(4)}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Component score bars */}
                                    {lastFrame && (
                                        <div className="flex-1 w-full space-y-4">
                                            <p className="text-sm opacity-50 montserrat mb-2">Component Scores — Frame {lastFrame.idx}</p>
                                            <ScoreBar label="Temporal (Short)" value={lastFrame.temporal} color="#8884d8" />
                                            <ScoreBar label="Temporal (Long)" value={lastFrame.temporalLong} color="#a78bfa" />
                                            <ScoreBar label="Spatial" value={lastFrame.spatial} color="#38bdf8" />
                                            <ScoreBar label="Energy (SVDD)" value={lastFrame.energy} color="#fb923c" />
                                            <ScoreBar label="Uncertainty" value={lastFrame.uncertainty} color="#4ade80" max={1} />

                                            <div className="mt-4 pt-4 border-t border-tan/10">
                                                <div className="flex justify-between text-sm montserrat">
                                                    <span className="opacity-50">Composite Score</span>
                                                    <span className={`font-semibold ${lastFrame.isAnomaly ? "text-red-400" : "text-green-400"}`}>
                                                        {lastFrame.score.toFixed(4)}
                                                    </span>
                                                </div>
                                                {threshold !== null && (
                                                    <div className="flex justify-between text-sm montserrat mt-1">
                                                        <span className="opacity-50">Threshold</span>
                                                        <span className="opacity-70">{threshold}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Summary stats ── */}
                        {done && frames.length > 0 && (
                            <div className="w-full px-6 py-12 border-b border-tan/20">
                                <h3 className="text-2xl font-semibold montserrat mb-8 text-center">
                                    Summary
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
                                    <StatCard label="Total Frames" value={totalFrames} />
                                    <StatCard label="Anomaly Frames" value={anomalyFrames.length} highlight={anomalyFrames.length > 0} />
                                    <StatCard label="Anomaly %" value={`${anomalyPct}%`} highlight={parseFloat(anomalyPct) > 10} />
                                    <StatCard label="Peak Score" value={maxScore} />
                                </div>
                            </div>
                        )}

                        {/* ── Score timeline chart ── */}
                        {frames.length > 1 && (
                            <div className="w-full px-6 py-12 border-b border-tan/20">
                                <h3 className="text-2xl font-semibold montserrat mb-8 text-center">
                                    Anomaly Score Timeline
                                </h3>
                                <div style={{ width: "100%", height: 350 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                            <XAxis
                                                dataKey="frame"
                                                stroke="#94a3b8"
                                                tick={{ fill: "#94a3b8", fontSize: 11 }}
                                                label={{ value: "Frame", position: "insideBottom", offset: -2, fill: "#94a3b8" }}
                                            />
                                            <YAxis
                                                stroke="#94a3b8"
                                                tick={{ fill: "#94a3b8", fontSize: 11 }}
                                                label={{ value: "Score", angle: -90, position: "insideLeft", fill: "#94a3b8" }}
                                            />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: 6 }}
                                                labelStyle={{ color: "#94a3b8" }}
                                                itemStyle={{ color: "#a5b4fc" }}
                                                formatter={(v) => [v.toFixed(4), "Score"]}
                                                labelFormatter={(l) => `Frame ${l}`}
                                            />
                                            {threshold !== null && (
                                                <ReferenceLine
                                                    y={threshold}
                                                    stroke="#ef4444"
                                                    strokeDasharray="5 5"
                                                    label={{ value: "Threshold", fill: "#ef4444", fontSize: 11, position: "insideTopRight" }}
                                                />
                                            )}
                                            <Line
                                                type="monotone"
                                                dataKey="score"
                                                stroke="#8884d8"
                                                strokeWidth={1.5}
                                                dot={false}
                                                activeDot={{ r: 4 }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {/* ── Anomaly Frames Gallery ── */}
                        {done && sortedByScore.length > 0 && (
                            <div className="w-full px-6 py-12 border-b border-tan/20">
                                <h3 className="text-2xl font-semibold montserrat mb-2 text-center">
                                    🚨 {sortedByScore.length} Anomaly Frame{sortedByScore.length > 1 ? "s" : ""} Detected
                                </h3>
                                <p className="text-sm opacity-50 montserrat mb-8 text-center">
                                    Top anomaly frames ranked by score (showing up to 20)
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
                                    {sortedByScore.slice(0, 20).map((fr, i) => (
                                        <div
                                            key={`anom-${fr.idx}-${i}`}
                                            className="rounded-xl overflow-hidden border-2 border-red-500/60 bg-slate-900/60"
                                        >
                                            <div className="relative">
                                                <img
                                                    src={`data:image/jpeg;base64,${fr.b64}`}
                                                    alt={`Anomaly frame ${fr.idx}`}
                                                    className="w-full object-cover"
                                                />
                                                <div className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold montserrat px-2 py-0.5 rounded-full">
                                                    #{i + 1}
                                                </div>
                                                <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded text-[10px] montserrat">
                                                    Frame {fr.idx}
                                                </div>
                                            </div>
                                            <div className="p-3 space-y-1 text-xs montserrat">
                                                <div className="flex justify-between">
                                                    <span className="opacity-60">Score</span>
                                                    <span className="text-red-400 font-semibold">{fr.score.toFixed(4)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="opacity-40">T-Short</span>
                                                    <span className="opacity-70">{fr.temporal.toFixed(3)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="opacity-40">T-Long</span>
                                                    <span className="opacity-70">{fr.temporalLong.toFixed(3)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="opacity-40">Spatial</span>
                                                    <span className="opacity-70">{fr.spatial.toFixed(3)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="opacity-40">Energy</span>
                                                    <span className="opacity-70">{fr.energy.toFixed(3)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="opacity-40">Uncertainty</span>
                                                    <span className="opacity-70">{fr.uncertainty.toFixed(4)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {sortedByScore.length > 20 && (
                                    <p className="text-xs opacity-40 montserrat text-center mt-4">
                                        … and {sortedByScore.length - 20} more anomaly frames
                                    </p>
                                )}
                            </div>
                        )}

                        {/* ── Normal vs Anomaly Side-by-Side ── */}
                        {done && sortedByScore.length > 0 && Object.keys(originalFrames).length > 0 && (
                            <div className="w-full px-6 py-12">
                                <h3 className="text-2xl font-semibold montserrat mb-2 text-center">
                                    🖼 Original vs Anomaly — Side-by-Side
                                </h3>
                                <p className="text-sm opacity-50 montserrat mb-8 text-center">
                                    Original frame from uploaded video compared with detection result at the same frame index
                                </p>

                                <div className="space-y-10 max-w-5xl mx-auto">
                                    {sortedByScore.slice(0, 10).map((fr, i) => (
                                        originalFrames[fr.idx] && (
                                            <div key={`cmp-${fr.idx}`}>
                                                <p className="text-sm montserrat opacity-50 mb-3 text-center">
                                                    Frame #{fr.idx} · Score: <span className="text-red-400 font-semibold">{fr.score.toFixed(4)}</span>
                                                </p>
                                                <div className="flex flex-col md:flex-row gap-4">
                                                    {/* Original frame from video */}
                                                    <div className="flex-1 rounded-xl overflow-hidden border-2 border-green-500/50 bg-slate-900/40">
                                                        <div className="relative">
                                                            <img
                                                                src={originalFrames[fr.idx]}
                                                                alt={`Original frame ${fr.idx}`}
                                                                className="w-full object-cover"
                                                            />
                                                            <div className="absolute top-3 right-3 bg-green-500/80 text-white text-xs font-bold montserrat px-3 py-1 rounded-full">
                                                                ORIGINAL
                                                            </div>
                                                        </div>
                                                        <div className="p-3 text-center">
                                                            <p className="text-xs montserrat opacity-50">Original — Frame {fr.idx}</p>
                                                        </div>
                                                    </div>

                                                    {/* VS divider */}
                                                    <div className="flex items-center justify-center">
                                                        <span className="text-xl font-bold opacity-20 montserrat">VS</span>
                                                    </div>

                                                    {/* Detection result */}
                                                    <div className="flex-1 rounded-xl overflow-hidden border-2 border-red-500 bg-slate-900/40">
                                                        <div className="relative">
                                                            <img
                                                                src={`data:image/jpeg;base64,${fr.b64}`}
                                                                alt={`Anomaly frame ${fr.idx}`}
                                                                className="w-full object-cover"
                                                            />
                                                            <div className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold montserrat px-3 py-1 rounded-full">
                                                                ⚠ ANOMALY
                                                            </div>
                                                        </div>
                                                        <div className="p-3 text-center">
                                                            <p className="text-xs montserrat opacity-50">Detection — Score: {fr.score.toFixed(4)}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                {i < sortedByScore.slice(0, 10).length - 1 && (
                                                    <hr className="border-tan/10 mt-8" />
                                                )}
                                            </div>
                                        )
                                    ))}
                                </div>

                                <p className="text-xs opacity-30 montserrat text-center mt-8">
                                    Component legend: T-Short = Temporal (K=8, uncertainty-damped) · T-Long = Temporal (K=32 drift) ·
                                    Spatial = Cross-attn patches · Energy = Deep SVDD · Uncertainty = MC dropout variance
                                </p>
                            </div>
                        )}

                        {/* ── No anomalies message ── */}
                        {done && anomalyFrames.length === 0 && (
                            <div className="w-full px-6 py-12 text-center">
                                <div className="inline-block bg-green-900/30 border border-green-500/40 rounded-xl px-8 py-4">
                                    <p className="text-lg montserrat text-green-400 font-semibold">
                                        ✅ No anomalies detected — video looks normal.
                                    </p>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ════════════════════════════════════════════════════════════
                    MODE B — LIVE WEBCAM STREAM
                   ════════════════════════════════════════════════════════════ */}
                {mode === "webcam" && (
                    <div className="w-full px-6 py-12">
                        <div className="max-w-5xl mx-auto">
                            <h2 className="text-3xl sm:text-4xl font-semibold montserrat text-center mb-3">
                                📹 Live Webcam Stream
                            </h2>
                            <p className="text-sm opacity-60 montserrat text-center mb-8 max-w-xl mx-auto">
                                The webcam feed is analyzed frame-by-frame on the server using all 5 model components.
                                Each analyzed frame is scored and streamed back in real-time.
                            </p>

                            {/* ── Webcam config ── */}
                            {!wcConnected && (
                                <div className="max-w-md mx-auto bg-slate-800/50 border border-tan/20 rounded-xl p-6 mb-8">
                                    <div className="grid grid-cols-2 gap-4 text-sm montserrat">
                                        <label className="flex flex-col gap-1">
                                            <span className="opacity-60 text-xs">Camera Index</span>
                                            <input
                                                type="number" min={0} max={5}
                                                value={wcCamIndex}
                                                onChange={(e) => setWcCamIndex(Number(e.target.value))}
                                                className="bg-slate-700 border border-tan/20 rounded px-2 py-1 text-tan text-sm"
                                            />
                                        </label>
                                        <label className="flex flex-col gap-1">
                                            <span className="opacity-60 text-xs">Analyze Every N Frames</span>
                                            <input
                                                type="number" min={1} max={10}
                                                value={wcAnalyzeEvery}
                                                onChange={(e) => setWcAnalyzeEvery(Number(e.target.value))}
                                                className="bg-slate-700 border border-tan/20 rounded px-2 py-1 text-tan text-sm"
                                            />
                                        </label>
                                        <label className="flex flex-col gap-1 col-span-2">
                                            <span className="opacity-60 text-xs">Threshold Override (0 = auto)</span>
                                            <input
                                                type="number" min={0} step={0.001}
                                                value={wcThresholdOvr}
                                                onChange={(e) => setWcThresholdOvr(Number(e.target.value))}
                                                className="bg-slate-700 border border-tan/20 rounded px-2 py-1 text-tan text-sm"
                                            />
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* ── Start / Stop buttons ── */}
                            <div className="flex justify-center gap-4 mb-8">
                                {!wcConnected ? (
                                    <button
                                        onClick={startWebcam}
                                        disabled={wcLoading}
                                        className="px-8 py-3 border border-tan rounded-lg hover:bg-tan hover:text-oxford-blue
                                                   transition montserrat font-semibold disabled:opacity-50"
                                    >
                                        {wcLoading ? "Connecting…" : "▶ Start Stream"}
                                    </button>
                                ) : (
                                    <button
                                        onClick={stopWebcam}
                                        className="px-8 py-3 bg-red-500/80 text-white rounded-lg hover:bg-red-600
                                                   transition montserrat font-semibold"
                                    >
                                        ⏹ Stop Stream
                                    </button>
                                )}
                            </div>

                            {/* ── Webcam error ── */}
                            {wcError && (
                                <div className="max-w-xl mx-auto mb-6 bg-red-900/40 border border-red-500 rounded px-4 py-3 text-sm text-red-300 text-left">
                                    <strong>Error:</strong> {wcError}
                                </div>
                            )}

                            {/* ── Live feed ── */}
                            {(wcConnected || wcLastFrame) && (
                                <div className="flex flex-col lg:flex-row gap-8 items-start justify-center">

                                    {/* Frame */}
                                    {wcLastFrame?.b64 && (
                                        <div className="flex-shrink-0 w-full lg:w-[480px]">
                                            <div className={`relative rounded-xl overflow-hidden border-2 ${wcLastFrame.isAnomaly ? "border-red-500" : "border-green-500/50"
                                                }`}>
                                                <img
                                                    src={`data:image/jpeg;base64,${wcLastFrame.b64}`}
                                                    alt={`Webcam frame ${wcLastFrame.idx}`}
                                                    className="w-full object-cover"
                                                />
                                                {/* Status badge */}
                                                <div className={`
                                                    absolute top-3 right-3
                                                    px-3 py-1 rounded-full text-xs font-semibold montserrat
                                                    ${wcLastFrame.isAnomaly
                                                        ? "bg-red-500 text-white animate-pulse"
                                                        : "bg-green-500/80 text-white"}
                                                `}>
                                                    {wcLastFrame.isAnomaly ? "🚨 ANOMALY" : "✓ NORMAL"}
                                                </div>
                                                <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs montserrat">
                                                    Frame {wcLastFrame.idx} &nbsp;|&nbsp; Score: {wcLastFrame.score.toFixed(4)}
                                                </div>
                                            </div>

                                            {/* ── Alert banner ── */}
                                            {wcLastFrame.isAnomaly ? (
                                                <div className="mt-3 bg-red-900/40 border border-red-500/60 rounded-lg px-4 py-2 text-center">
                                                    <p className="text-red-400 font-semibold montserrat text-sm animate-pulse">
                                                        🚨 ANOMALY DETECTED
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="mt-3 bg-green-900/20 border border-green-500/30 rounded-lg px-4 py-2 text-center">
                                                    <p className="text-green-400 font-semibold montserrat text-sm">
                                                        ✅ Normal Operation
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Component scores + stats */}
                                    {wcLastFrame && (
                                        <div className="flex-1 w-full space-y-4">
                                            <p className="text-sm opacity-50 montserrat mb-2">
                                                Component Scores — Frame {wcLastFrame.idx}
                                            </p>
                                            <ScoreBar label="Temporal (Short)" value={wcLastFrame.temporal} color="#8884d8" />
                                            <ScoreBar label="Temporal (Long)" value={wcLastFrame.temporalLong} color="#a78bfa" />
                                            <ScoreBar label="Spatial" value={wcLastFrame.spatial} color="#38bdf8" />
                                            <ScoreBar label="Energy (SVDD)" value={wcLastFrame.energy} color="#fb923c" />
                                            <ScoreBar label="Uncertainty" value={wcLastFrame.uncertainty} color="#4ade80" max={1} />

                                            <div className="mt-4 pt-4 border-t border-tan/10">
                                                <div className="flex justify-between text-sm montserrat">
                                                    <span className="opacity-50">Composite Score</span>
                                                    <span className={`font-semibold ${wcLastFrame.isAnomaly ? "text-red-400" : "text-green-400"}`}>
                                                        {wcLastFrame.score.toFixed(4)}
                                                    </span>
                                                </div>
                                                {wcThreshold && (
                                                    <div className="flex justify-between text-sm montserrat mt-1">
                                                        <span className="opacity-50">Threshold</span>
                                                        <span className="opacity-70">{wcThreshold.toFixed(4)}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Session stats */}
                                            <div className="mt-6 pt-4 border-t border-tan/10">
                                                <p className="text-xs opacity-40 montserrat mb-3">Session Stats</p>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <StatCard label="Frames Analyzed" value={wcFrames.length} />
                                                    <StatCard label="Anomalies" value={wcAnomalyCount} highlight={wcAnomalyCount > 0} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Webcam score timeline ── */}
                            {wcChartData.length > 2 && (
                                <div className="mt-12">
                                    <h3 className="text-xl font-semibold montserrat mb-6 text-center">
                                        Live Score Timeline
                                    </h3>
                                    <div style={{ width: "100%", height: 280 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={wcChartData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                                <XAxis
                                                    dataKey="frame"
                                                    stroke="#94a3b8"
                                                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                                                    label={{ value: "Frame", position: "insideBottom", offset: -2, fill: "#94a3b8" }}
                                                />
                                                <YAxis
                                                    stroke="#94a3b8"
                                                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                                                    label={{ value: "Score", angle: -90, position: "insideLeft", fill: "#94a3b8" }}
                                                />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: 6 }}
                                                    labelStyle={{ color: "#94a3b8" }}
                                                    itemStyle={{ color: "#a5b4fc" }}
                                                    formatter={(v) => [v.toFixed(4), "Score"]}
                                                    labelFormatter={(l) => `Frame ${l}`}
                                                />
                                                {wcThreshold && (
                                                    <ReferenceLine
                                                        y={wcThreshold}
                                                        stroke="#ef4444"
                                                        strokeDasharray="5 5"
                                                        label={{ value: "Threshold", fill: "#ef4444", fontSize: 11, position: "insideTopRight" }}
                                                    />
                                                )}
                                                <Line
                                                    type="monotone"
                                                    dataKey="score"
                                                    stroke="#8884d8"
                                                    strokeWidth={1.5}
                                                    dot={false}
                                                    activeDot={{ r: 4 }}
                                                    isAnimationActive={false}
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            {/* ── Not connected placeholder ── */}
                            {!wcConnected && !wcLastFrame && !wcLoading && (
                                <div className="text-center mt-8">
                                    <p className="text-sm opacity-40 montserrat">
                                        Configure settings above and click "Start Stream" to begin live analysis.
                                    </p>
                                    <p className="text-xs opacity-25 montserrat mt-2">
                                        Note: The webcam is accessed server-side. Make sure the backend server has camera access.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </section>
        </>
    );
};

export default Detect;