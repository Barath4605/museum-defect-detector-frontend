import React, { useState, useRef } from "react";
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
        className={`flex flex-col items-center justify-center p-4 rounded-xl border ${
            highlight
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
    const [video, setVideo]               = useState(null);
    const [loading, setLoading]           = useState(false);
    const [logs, setLogs]                 = useState([]);
    const [error, setError]               = useState(null);
    const [progress, setProgress]         = useState(null);   // { current, total }
    const [threshold, setThreshold]       = useState(null);
    const [frames, setFrames]             = useState([]);      // all scored frames
    const [lastFrame, setLastFrame]       = useState(null);    // { b64, score, isAnomaly, ... }
    const [done, setDone]                 = useState(false);
    const [totalFrames, setTotalFrames]   = useState(0);

    // Advanced options
    const [maxFrames, setMaxFrames]             = useState(0);
    const [showEvery, setShowEvery]             = useState(5);
    const [maskHumans, setMaskHumans]           = useState(true);
    const [thresholdOverride, setThresholdOverride] = useState(0);
    const [showAdvanced, setShowAdvanced]       = useState(false);

    const inputRef  = useRef(null);
    const logEndRef = useRef(null);

    const pushLog = (msg) => {
        setLogs((prev) => [...prev, msg]);
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    };

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
        setVideo(file);
        setError(null);
        setDone(false);
        setFrames([]);
        setLastFrame(null);
        setThreshold(null);
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

        const formData = new FormData();
        formData.append("video",              video);
        formData.append("max_frames",         maxFrames);
        formData.append("show_every",         showEvery);
        formData.append("mask_humans",        maskHumans);
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

            const reader  = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer    = "";

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
                                idx:          data.frame_idx,
                                score:        data.score,
                                isAnomaly:    data.is_anomaly,
                                temporal:     data.temporal      ?? 0,
                                temporalLong: data.temporal_long ?? 0,
                                spatial:      data.spatial       ?? 0,
                                energy:       data.energy        ?? 0,
                                uncertainty:  data.uncertainty   ?? 0,
                            };
                            setFrames((prev) => [...prev, frameEntry]);
                            setProgress({ current: data.frame_idx + 1, total: data.total_est || "?" });

                            if (data.frame_b64) {
                                setLastFrame({ ...frameEntry, b64: data.frame_b64 });
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

    // ── Derived stats ──────────────────────────────────────────────────────────
    const anomalyFrames  = frames.filter((f) => f.isAnomaly);
    const anomalyPct     = frames.length ? ((anomalyFrames.length / frames.length) * 100).toFixed(1) : "—";
    const maxScore       = frames.length ? Math.max(...frames.map((f) => f.score)).toFixed(4) : "—";
    const avgScore       = frames.length
        ? (frames.reduce((s, f) => s + f.score, 0) / frames.length).toFixed(4)
        : "—";

    // Chart data — score per frame index
    const chartData = frames.map((f) => ({
        frame: f.idx,
        score: parseFloat(f.score.toFixed(4)),
    }));

    return (
        <>
            <Navbar />
            <section className="bg-oxford-blue text-tan min-h-screen">

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

                    <input
                        ref={inputRef}
                        type="file"
                        accept="video/*"
                        onChange={handleChange}
                        className="mt-8 lg:p-10 p-3 border border-dashed rounded-md cursor-pointer text-sm"
                    />

                    {video && (
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
                                    <div className={`relative rounded-xl overflow-hidden border-2 ${
                                        lastFrame.isAnomaly ? "border-red-500" : "border-green-500/50"
                                    }`}>
                                        <img
                                            src={`data:image/jpeg;base64,${lastFrame.b64}`}
                                            alt={`Frame ${lastFrame.idx}`}
                                            className="w-full object-cover"
                                        />
                                        {/* Anomaly badge */}
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
                                    <ScoreBar label="Temporal (Short)"  value={lastFrame.temporal}     color="#8884d8" />
                                    <ScoreBar label="Temporal (Long)"   value={lastFrame.temporalLong} color="#a78bfa" />
                                    <ScoreBar label="Spatial"           value={lastFrame.spatial}      color="#38bdf8" />
                                    <ScoreBar label="Energy (SVDD)"     value={lastFrame.energy}       color="#fb923c" />
                                    <ScoreBar label="Uncertainty"       value={lastFrame.uncertainty}  color="#4ade80" max={1} />

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
                            <StatCard label="Total Frames"    value={totalFrames} />
                            <StatCard label="Anomaly Frames"  value={anomalyFrames.length} highlight={anomalyFrames.length > 0} />
                            <StatCard label="Anomaly %"       value={`${anomalyPct}%`}     highlight={parseFloat(anomalyPct) > 10} />
                            <StatCard label="Peak Score"      value={maxScore} />
                        </div>
                    </div>
                )}

                {/* ── Score timeline chart ── */}
                {frames.length > 1 && (
                    <div className="w-full px-6 py-12">
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
            </section>
        </>
    );
};

export default Detect;