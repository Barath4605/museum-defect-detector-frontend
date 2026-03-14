import React, { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Target, Scale, RefreshCw } from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip,
    CartesianGrid, ResponsiveContainer, ReferenceLine,
} from "recharts";
import Navbar from "../components/Navbar.jsx";

const BASE_URL = "https://abhi02072005-jepa-backend.hf.space";

// ── Small primitives ──────────────────────────────────────────────────────────

const MetricCard = ({ label, value, sub, highlight }) => (
    <div className={`
        flex flex-col gap-1.5 p-5 rounded-2xl
        ${highlight
            ? "bg-tan/8"
            : " bg-slate-800/30"}
    `}>
        <p className="text-[10px] montserrat tracking-[0.2em] uppercase opacity-40">{label}</p>
        <p className={`text-2xl sm:text-3xl font-semibold montserrat ${highlight ? "text-tan" : "opacity-90"}`}>
            {value ?? "—"}
        </p>
        {sub && <p className="text-[10px] montserrat opacity-30 leading-snug">{sub}</p>}
    </div>
);

const ScaleBar = ({ label, value, color }) => {
    const pct = value ? Math.min((value / 3) * 100, 100) : 0;
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs montserrat">
                <span className="opacity-50">{label}</span>
                <span className="opacity-70">{value?.toFixed(4) ?? "—"}</span>
            </div>
            <div className="w-full h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
        </div>
    );
};

// Custom tooltip for histogram
const HistoTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-slate-900 border border-tan/20 rounded-xl px-4 py-3 text-xs montserrat shadow-xl">
            <p className="opacity-40 mb-1">Score range</p>
            <p className="text-tan font-semibold">{payload[0]?.payload?.range}</p>
            <p className="opacity-60 mt-1">{payload[0]?.value} frames</p>
        </div>
    );
};

// ── Main ──────────────────────────────────────────────────────────────────────

const Calibration = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const logEndRef = useRef(null);

    const [loading, setLoading] = useState(false);
    const [calibProgress, setCalibProgress] = useState(null);
    const [threshold, setThreshold] = useState(null);
    const [tScale, setTScale] = useState(null);
    const [tLongScale, setTLongScale] = useState(null);
    const [sScale, setSScale] = useState(null);
    const [eScale, setEScale] = useState(null);
    const [scores, setScores] = useState([]);
    const [logs, setLogs] = useState([]);
    const [error, setError] = useState(null);

    const pushLog = (msg) => {
        setLogs((prev) => [...prev, msg]);
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    };

    useEffect(() => {
        if (location.state?.autoStart) handleCalibration();
    }, []);

    const handleCalibration = async () => {
        setLoading(true);
        setThreshold(null); setScores([]); setCalibProgress(null);
        setLogs([]); setError(null);

        try {
            pushLog("🔧 Loading trained model…");
            const response = await fetch(`${BASE_URL}/api/calibrate`, { method: "POST" });
            if (!response.ok) throw new Error(`Server error ${response.status}`);

            pushLog("📊 Scoring normal frames…");
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split("\n\n");
                buffer = events.pop();

                for (const event of events) {
                    const trimmed = event.trim();
                    if (!trimmed.startsWith("data:")) continue;
                    const jsonStr = trimmed.replace(/^data:\s*/, "");
                    let data;
                    try { data = JSON.parse(jsonStr); } catch { continue; }

                    if (data.type === "log") { pushLog(data.msg); }
                    if (data.type === "progress") { setCalibProgress({ current: data.current, total: data.total }); }
                    if (data.type === "done") {
                        setThreshold(data.threshold);
                        setTScale(data.t_scale);
                        setTLongScale(data.t_long_scale);
                        setSScale(data.s_scale);
                        setEScale(data.e_scale);
                        setScores(data.scores || []);
                        setCalibProgress(null);
                        setLoading(false);
                        pushLog(`✅ Threshold set: ${data.threshold?.toFixed(4)}`);
                    }
                    if (data.type === "error") {
                        pushLog(`❌ ${data.msg}`);
                        setError(data.msg);
                        setCalibProgress(null);
                        setLoading(false);
                        return;
                    }
                }
            }
        } catch (err) {
            setError(err.message);
            pushLog(`❌ ${err.message}`);
            setLoading(false);
        }
    };

    // Build histogram bins
    const createHistogram = (data, binCount = 24) => {
        if (!data.length) return [];
        const min = Math.min(...data);
        const max = Math.max(...data);
        const binSize = (max - min) / binCount;
        return Array.from({ length: binCount }, (_, i) => {
            const start = min + i * binSize;
            const end = start + binSize;
            return {
                range: `${start.toFixed(3)}`,
                rangeFull: `${start.toFixed(3)} – ${end.toFixed(3)}`,
                count: data.filter((v) => v >= start && v < end).length,
                start, end,
            };
        });
    };

    const histogramData = createHistogram(scores);
    const progressPct = calibProgress
        ? Math.min(Math.round((calibProgress.current / calibProgress.total) * 100), 100)
        : 0;

    // Stats derived from scores
    const mean = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(4) : null;
    const median = scores.length ? [...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)]?.toFixed(4) : null;
    const maxScore = scores.length ? Math.max(...scores).toFixed(4) : null;

    return (
        <>
            <Navbar />
            <section className="bg-oxford-blue text-tan min-h-screen">
                <style>{`
                    @keyframes fade-up { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
                    .fade-up { animation: fade-up .4s ease forwards; }
                    @keyframes bar-shimmer { from { transform:translateX(-100%) } to { transform:translateX(500%) } }
                `}</style>

                {/* ── Hero ── */}
                <div className="px-5 sm:px-10 pt-14 pb-12  max-w-5xl mx-auto">

                    {/* Step label */}
                    <div className="flex items-center gap-2 mb-6">
                        <span className="w-5 h-5 rounded-full border border-tan/30 flex items-center justify-center text-[10px] montserrat opacity-50">2</span>
                        <span className="text-[10px] montserrat tracking-[0.25em] uppercase opacity-40">Calibration</span>
                    </div>

                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold montserrat leading-tight mb-3">
                        Calibrate Threshold
                    </h1>
                    <p className="text-sm opacity-40 montserrat max-w-lg leading-relaxed mb-8">
                        Scores every frame from the training video under the trained model.
                        The 97th-percentile score becomes the anomaly decision boundary —
                        anything above this line in production is flagged as anomalous.
                    </p>

                    {/* ── Run button ── */}
                    <button
                        onClick={handleCalibration}
                        disabled={loading}
                        className={`
                            px-10 py-3 montserrat font-semibold text-sm tracking-wide
                            transition-all duration-200
                            ${loading
                                ? "border border-tan/30 opacity-50 cursor-wait"
                                : "bg-tan text-oxford-blue hover:opacity-90 active:scale-95 shadow-lg shadow-tan/20 cursor-pointer"}
                        `}
                    >
                        {loading ? (
                            <span className="flex items-center gap-2">
                                <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                                </svg>
                                Calibrating…
                            </span>
                        ) : threshold !== null ? "Re-run Calibration" : "Run Calibration"}
                    </button>

                    {/* ── Progress ── */}
                    {loading && calibProgress && (
                        <div className="mt-7 max-w-md fade-up">
                            <div className="flex justify-between text-xs montserrat opacity-50 mb-2">
                                <span>Scoring frame {calibProgress.current} / {calibProgress.total}</span>
                                <span>{progressPct}%</span>
                            </div>
                            <div className="relative w-full h-1 bg-slate-700/50 rounded-full overflow-hidden">
                                <div className="absolute inset-y-0 left-0 bg-tan rounded-full transition-all duration-300"
                                    style={{ width: `${progressPct}%` }} />
                                <div className="absolute inset-y-0 w-12 opacity-60"
                                    style={{
                                        left: `${Math.max(progressPct - 5, 0)}%`,
                                        background: "linear-gradient(90deg,transparent,rgba(210,180,140,.7),transparent)",
                                        animation: "bar-shimmer 1.4s linear infinite",
                                    }} />
                            </div>
                        </div>
                    )}

                    {/* ── Log console ── */}
                    {logs.length > 0 && (
                        <>
                            <h1 className="montserrat text-gray-200 mt-6">Logs</h1>
                            <div className="rounded-md  bg-black/70 max-w-2xl text-green-400 px-5 py-4 text-[11px] ibm-mono max-h-40 overflow-y-auto fade-up">
                                {logs.map((l, i) => <div key={i} className="opacity-60 leading-relaxed whitespace-pre-wrap py-0.5">{l}</div>)}
                                <div ref={logEndRef} />
                            </div>
                        </>
                    )}

                    {/* ── Error ── */}
                    {error && (
                        <div className="mt-6 max-w-xl bg-red-950/40 border border-red-500/40 rounded-xl px-5 py-4 fade-up">
                            <p className="text-xs font-semibold montserrat text-red-400 mb-1">Error</p>
                            <p className="text-xs montserrat text-red-300/70">{error}</p>
                        </div>
                    )}
                </div>

                {/* ── Results ── */}
                {threshold !== null && (
                    <div className="px-5 sm:px-10 py-14 max-w-5xl mx-auto space-y-14 fade-up">

                        {/* ── Threshold hero card ── */}
                        <div className="relative rounded-3xl border border-tan/20 bg-linear-to-br from-gray-700/50 to-slate-700/50 via-gray-600/50w-[50%] p-8 overflow-hidden">
                            {/* Decorative glow */}
                            <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-10"
                                style={{ background: "radial-gradient(circle, #d2b48c 0%, transparent 70%)" }} />

                            <p className="text-[10px] montserrat tracking-[0.25em] uppercase opacity-35 mb-2">Decision Boundary</p>
                            <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-6">
                                <div>
                                    <p className="text-5xl sm:text-6xl font-semibold montserrat text-tan">{threshold.toFixed(4)}</p>
                                    <p className="text-xs montserrat opacity-40 mt-2 max-w-xs leading-relaxed">
                                        97th-percentile anomaly score. Frames scoring above this threshold will be flagged in detection.
                                    </p>
                                </div>
                                <div className="flex flex-col gap-2 sm:mb-1">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-400" />
                                        <span className="text-xs montserrat opacity-50">Below → Normal</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-red-400" />
                                        <span className="text-xs montserrat opacity-50">Above → Anomaly</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Score stats ── */}
                        <div>
                            <p className="text-xs montserrat tracking-[0.2em] uppercase opacity-30 mb-4">Score Distribution Stats</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                                <MetricCard label="Threshold (97th %ile)" value={threshold.toFixed(4)} highlight />
                                <MetricCard label="Mean Score" value={mean} sub="Average over all normal frames" />
                                <MetricCard label="Median Score" value={median} sub="50th percentile" />
                                <MetricCard label="Max Score" value={maxScore} sub="Highest normal score seen" />
                            </div>
                        </div>

                        {/* ── Component scales ── */}
                        <div>
                            <p className="text-xs montserrat tracking-[0.2em] uppercase opacity-30 mb-1">Component Scales</p>
                            <p className="text-xs montserrat opacity-30 mb-5 leading-relaxed max-w-lg">
                                Per-component normalization factors. Higher values mean that component contributes more variance to the composite score.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                                <div className="bg-slate-800/40 rounded-2xl p-5 space-y-4">
                                    <ScaleBar label="Temporal Short (t_scale)" value={tScale} color="#8884d8" />
                                    <ScaleBar label="Temporal Long (t_long)" value={tLongScale} color="#a78bfa" />
                                </div>
                                <div className="bg-slate-800/40 rounded-2xl p-5 space-y-4">
                                    <ScaleBar label="Spatial (s_scale)" value={sScale} color="#38bdf8" />
                                    <ScaleBar label="Energy / SVDD (e_scale)" value={eScale} color="#fb923c" />
                                </div>
                            </div>
                        </div>

                        {/* ── Score histogram ── */}
                        {histogramData.length > 0 && (
                            <div>
                                <p className="text-xs montserrat tracking-[0.2em] uppercase opacity-30 mb-1">Normal Score Distribution</p>
                                <p className="text-xs montserrat opacity-30 mb-6 max-w-lg leading-relaxed">
                                    Histogram of anomaly scores on training (normal) frames. The red dashed line is the calibrated threshold the long tail to the right represents the hardest normal frames.
                                </p>

                                <div className="bg-slate-800/30 rounded-2xl p-5 sm:p-7">
                                    <div style={{ width: "100%", height: 280 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={histogramData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                                <XAxis dataKey="range" stroke="#475569"
                                                    tick={{ fill: "#64748b", fontSize: 10 }}
                                                    interval={Math.floor(histogramData.length / 6)} />
                                                <YAxis stroke="#475569" tick={{ fill: "#64748b", fontSize: 10 }} />
                                                <Tooltip content={<HistoTooltip />} />
                                                <Bar dataKey="count" fill="#d2b48c" opacity={0.7} radius={[3, 3, 0, 0]} />
                                                {threshold !== null && (
                                                    <ReferenceLine
                                                        x={histogramData.find((b) => threshold >= b.start && threshold < b.end)?.range}
                                                        stroke="#ef4444"
                                                        strokeWidth={2}
                                                        strokeDasharray="5 4"
                                                        label={{ value: "Threshold", fill: "#ef4444", fontSize: 10, position: "insideTopRight" }}
                                                    />
                                                )}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Legend */}
                                    <div className="flex flex-wrap gap-4 mt-5 text-[11px] montserrat opacity-40">
                                        <span className="flex items-center gap-1.5">
                                            <span className="w-3 h-3 rounded-sm bg-tan/70 inline-block" /> Normal frame scores
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <span className="w-5 border-t-2 border-dashed border-red-500 inline-block" /> Threshold ({threshold.toFixed(4)})
                                        </span>
                                        <span className="flex items-center gap-1.5 ml-auto">
                                            {scores.length} frames scored
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── What this means explainer ── */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {[
                                {
                                    icon: <Target size={18} />,
                                    title: "97th Percentile",
                                    body: "Only 3% of normal frames score above the threshold, keeping false-alarm rates very low during detection.",
                                },
                                {
                                    icon: <Scale size={18} />,
                                    title: "Component Weighting",
                                    body: "Each of the 5 model components (temporal, spatial, energy…) is scaled so no single one dominates the composite score.",
                                },
                                {
                                    icon: <RefreshCw size={18} />,
                                    title: "Re-calibrate Anytime",
                                    body: "If the environment changes (lighting, camera angle) re-run calibration on updated normal footage to stay accurate.",
                                },
                            ].map((c) => (
                                <div key={c.title} className="bg-slate-800/30 rounded-2xl p-5">
                                    <p className="mb-3 opacity-70">{c.icon}</p>
                                    <p className="text-sm font-semibold montserrat mb-2">{c.title}</p>
                                    <p className="text-xs montserrat opacity-40 leading-relaxed">{c.body}</p>
                                </div>
                            ))}
                        </div>

                        {/* ── CTA → Detection ── */}
                        <div className="flex flex-col items-center gap-5 pt-4 pb-6">
                            <div className="flex items-center gap-4 w-full max-w-xs">
                                <div className="flex-1 h-px bg-gradient-to-r from-transparent to-tan/20" />
                                <span className="text-[10px] montserrat tracking-[0.3em] uppercase opacity-25">Next step</span>
                                <div className="flex-1 h-px bg-gradient-to-l from-transparent to-tan/20" />
                            </div>

                            <p className="text-sm opacity-40 montserrat text-center">
                                Threshold is saved. You're ready to run anomaly detection.
                            </p>

                            <button
                                onClick={() => navigate("/detect")}
                                className="
                                    group relative px-12 py-3.5 rounded-xl overflow-hidden
                                    bg-tan text-oxford-blue
                                    font-semibold montserrat text-sm tracking-wide
                                    hover:opacity-95 active:scale-95
                                    transition-all duration-150 shadow-xl shadow-tan/20
                                "
                            >
                                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-500
                                                 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                                Run Detection →
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </>
    );
};

export default Calibration;