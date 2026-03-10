import React, { useState, useRef } from "react";
import "../../index.css";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer
} from "recharts";

const MAX_SIZE = 200 * 1024 * 1024;
const BASE_URL = "https://abhi02072005-jepa-backend.hf.space";

const UploadVideo = () => {
    const [video, setVideo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [lossHistory, setLossHistory] = useState([]);
    const [trained, setTrained] = useState(false);
    const [logs, setLogs] = useState([]);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState(null); // { epoch, total, loss, label? }

    const inputRef = useRef(null);
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
    };

    const handleUpload = async () => {
        if (!video) {
            alert("Select a video first");
            return;
        }

        setLoading(true);
        setLossHistory([]);
        setTrained(false);
        setLogs([]);
        setError(null);
        setProgress(null);

        const formData = new FormData();
        formData.append("video", video);

        try {
            pushLog("📤 Uploading video...");

            const response = await fetch(`${BASE_URL}/api/train`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Server error ${response.status}: ${text}`);
            }

            pushLog("✅ Upload complete. Training started...");

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";
            let trainingFinished = false;
            // Keep a local ref so the status-poll fallback can see the latest value
            let localLossHistory = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const events = buffer.split("\n\n");
                buffer = events.pop(); // keep incomplete trailing chunk

                for (const event of events) {
                    const trimmed = event.trim();
                    if (!trimmed.startsWith("data:")) continue;

                    const jsonString = trimmed.replace(/^data:\s*/, "");
                    if (!jsonString) continue;

                    let data;
                    try {
                        data = JSON.parse(jsonString);
                    } catch (err) {
                        console.warn("SSE parse error:", err, "raw:", jsonString);
                        continue;
                    }

                    switch (data.type) {
                        case "log":
                            pushLog(data.msg);
                            break;

                        case "progress_a":
                            setProgress({ epoch: data.epoch, total: data.total, loss: data.loss });
                            break;

                        case "stage_a_done":
                            if (data.loss_history?.length) {
                                localLossHistory = data.loss_history;
                                setLossHistory(data.loss_history);
                            }
                            pushLog(`📉 JEPA training done. Final loss: ${data.final_loss}`);
                            break;

                        case "progress_b":
                            setProgress({ epoch: data.epoch, total: data.total, loss: data.loss, label: "SVDD" });
                            break;

                        case "done":
                            trainingFinished = true;
                            pushLog(`🎉 Training complete! JEPA loss: ${data.jepa_loss} | SVDD loss: ${data.svdd_loss}`);
                            break;

                        case "stream_end":
                            break;

                        case "error":
                            setError(data.msg);
                            pushLog(`❌ Error: ${data.msg}`);
                            if (data.trace) console.error("Server traceback:\n", data.trace);
                            setLoading(false);
                            return;

                        default:
                            break;
                    }
                }
            }

            // SSE stream finished — confirm via status poll either way
            pushLog("⏳ Confirming training status...");
            try {
                const res = await fetch(`${BASE_URL}/api/train/status`);
                const status = await res.json();

                if (status.loss_history?.length && localLossHistory.length === 0) {
                    setLossHistory(status.loss_history);
                }

                if (status.trained) {
                    setTrained(true);
                    pushLog("✅ Model is ready.");
                    inputRef.current.value = "";
                    setVideo(null);
                } else if (!trainingFinished) {
                    setError("Training may have failed — model checkpoints not found on server.");
                    pushLog("⚠️ Checkpoints not found. Check server logs.");
                }
            } catch (pollErr) {
                console.error("Status poll failed:", pollErr);
                // If we got a done event, trust it anyway
                if (trainingFinished) {
                    setTrained(true);
                } else {
                    setError("Could not confirm training status. Check the HF Space logs.");
                }
            }

        } catch (err) {
            console.error(err);
            setError(err.message || "Something went wrong");
            pushLog(`❌ ${err.message}`);
        } finally {
            setLoading(false);
            setProgress(null);
        }
    };

    const chartData = lossHistory.map((loss, index) => ({
        epoch: index + 1,
        loss: parseFloat(loss.toFixed(6)),
    }));

    return (
        <section className="bg-oxford-blue text-tan min-h-screen">

            {/* ── Upload / hero area ── */}
            <div className="
        flex flex-col
        w-full min-h-screen
        px-6 py-12
        items-center justify-center
        text-center
        border-b border-tan
      ">
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold montserrat">
                    Upload Video
                </h2>

                <input
                    ref={inputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleChange}
                    className="mt-6 lg:p-10 p-3 border border-dashed rounded-md cursor-pointer text-sm"
                />

                {video && (
                    <p className="mt-2 text-sm opacity-60">
                        {video.name} &mdash; {(video.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                )}

                <button
                    onClick={handleUpload}
                    disabled={loading}
                    className="
            mt-6 px-6 py-2
            border border-tan rounded
            hover:bg-tan hover:text-oxford-blue
            transition disabled:opacity-50
          "
                >
                    {loading ? "Training..." : "Train"}
                </button>

                {/* ── Epoch progress bar ── */}
                {loading && progress && (
                    <div className="mt-6 w-full max-w-md">
                        <p className="text-sm mb-1 opacity-70">
                            {progress.label ?? "JEPA"} &mdash; Epoch {progress.epoch} / {progress.total} &mdash; Loss: {progress.loss}
                        </p>
                        <div className="w-full bg-slate-700 rounded-full h-2">
                            <div
                                className="bg-tan h-2 rounded-full transition-all duration-300"
                                style={{ width: `${Math.round((progress.epoch / progress.total) * 100)}%` }}
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

                {/* ── Live log console ── */}
                {logs.length > 0 && (
                    <div className="
            mt-6 w-full max-w-2xl
            bg-black/40 border border-tan/30
            rounded-lg px-4 py-3
            text-left text-xs font-mono
            max-h-52 overflow-y-auto
          ">
                        {logs.map((log, i) => (
                            <div key={i} className="opacity-80 leading-relaxed whitespace-pre-wrap">{log}</div>
                        ))}
                        <div ref={logEndRef} />
                    </div>
                )}
            </div>

            {/* ── Loss curve — only shown after training succeeds ── */}
            {trained && chartData.length > 0 && (
                <div className="w-full px-6 py-12">
                    <h3 className="text-xl font-semibold montserrat mb-6 text-center">
                        Training Loss Curve
                    </h3>
                    {/*
            Use an explicit pixel height on the wrapper div.
            ResponsiveContainer needs a parent with a real height — using
            percentage heights on a flex child gives height=0, which causes
            the "width(-1) and height(-1)" recharts warning.
          */}
                    <div style={{ width: "100%", height: 350 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis
                                    dataKey="epoch"
                                    stroke="#94a3b8"
                                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                                    label={{ value: "Epoch", position: "insideBottom", offset: -2, fill: "#94a3b8" }}
                                />
                                <YAxis
                                    stroke="#94a3b8"
                                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                                    label={{ value: "Loss", angle: -90, position: "insideLeft", fill: "#94a3b8" }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "#1e293b",
                                        border: "1px solid #475569",
                                        borderRadius: 6,
                                    }}
                                    labelStyle={{ color: "#94a3b8" }}
                                    itemStyle={{ color: "#a5b4fc" }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="loss"
                                    stroke="#8884d8"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 5 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </section>
    );
};

export default UploadVideo;