import React, { useState, useRef, useEffect } from "react";
import "../../index.css";
import { useNavigate } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

const MAX_SIZE = 200 * 1024 * 1024;
const BASE_URL = "https://abhi02072005-jepa-backend.hf.space";

const UploadVideo = () => {
  const navigate = useNavigate();

  const [video, setVideo]               = useState(null);
  const [videoURL, setVideoURL]         = useState(null);   // object URL for preview
  const [loading, setLoading]           = useState(false);
  const [lossHistory, setLossHistory]   = useState([]);
  const [trained, setTrained]           = useState(false);
  const [logs, setLogs]                 = useState([]);
  const [error, setError]               = useState(null);
  const [progress, setProgress]         = useState(null);

  const inputRef  = useRef(null);
  const logEndRef = useRef(null);

  // Revoke the object URL when video changes or component unmounts
  useEffect(() => {
    return () => {
      if (videoURL) URL.revokeObjectURL(videoURL);
    };
  }, [videoURL]);

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

    // Revoke previous preview URL to avoid memory leaks
    if (videoURL) URL.revokeObjectURL(videoURL);

    setVideo(file);
    setVideoURL(URL.createObjectURL(file));
    setError(null);
    // Reset results when a new file is picked
    setTrained(false);
    setLossHistory([]);
    setLogs([]);
  };

  const pollStatus = async () => {
    const res    = await fetch(`${BASE_URL}/api/train/status`);
    const status = await res.json();
    if (status.loss_history?.length) setLossHistory(status.loss_history);
    return status.trained === true;
  };

  const handleUpload = async () => {
    if (!video) { alert("Select a video first"); return; }

    setLoading(true);
    setLossHistory([]);
    setTrained(false);
    setLogs([]);
    setError(null);
    setProgress(null);

    const formData = new FormData();
    formData.append("video", video);

    let localLossHistory = [];
    let trainingFinished = false;

    try {
      pushLog("📤 Uploading video…");

      const response = await fetch(`${BASE_URL}/api/train`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server error ${response.status}: ${text}`);
      }

      pushLog("✅ Upload accepted — training started…");

      const reader  = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

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
            case "progress_a":
              setProgress({ label: "JEPA", epoch: data.epoch, total: data.total, loss: data.loss });
              break;
            case "stage_a_done":
              if (data.loss_history?.length) {
                localLossHistory = data.loss_history;
                setLossHistory(data.loss_history);
              }
              pushLog(`📉 JEPA done — final loss: ${data.final_loss}`);
              break;
            case "progress_b":
              setProgress({ label: "SVDD", epoch: data.epoch, total: data.total, loss: data.loss });
              break;
            case "done":
              trainingFinished = true;
              pushLog(`🎉 Training complete! JEPA: ${data.jepa_loss} | SVDD: ${data.svdd_loss}`);
              break;
            case "stream_end":
              break;
            case "error":
              pushLog(`❌ Server error: ${data.msg}`);
              if (data.trace) console.error("Traceback:\n", data.trace);
              setError(data.msg);
              setLoading(false);
              return;
            default:
              break;
          }
        }
      }

      pushLog("⏳ Confirming with server…");
      try {
        const isReady = await pollStatus();
        if (isReady) {
          setTrained(true);
          pushLog("✅ Model is ready!");
        } else if (trainingFinished) {
          setTrained(true);
          pushLog("✅ Training complete (confirmed via stream).");
        } else {
          setError("Training may have failed — checkpoints not found. Check HF Space logs.");
          pushLog("⚠️ Model checkpoints not found on server.");
        }
      } catch (pollErr) {
        if (trainingFinished) {
          setTrained(true);
          pushLog("✅ Training complete (poll failed but stream confirmed).");
        } else {
          setError("Could not confirm training status — check HF Space logs.");
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

  const chartData = lossHistory.map((loss, i) => ({
    epoch: i + 1,
    loss:  parseFloat(Number(loss).toFixed(6)),
  }));

  return (
      <section className="bg-oxford-blue text-tan min-h-screen">

        {/* ── Upload / hero ── */}
        <div className="
        flex flex-col w-full min-h-screen
        px-6 py-12
        items-center justify-center text-center
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

          {/* ── Video preview ── */}
          {videoURL && (
              <div className="mt-6 w-full max-w-fit">
                <p className="text-xs opacity-50 montserrat mb-2 text-left">
                  Preview — {video?.name} &nbsp;&middot;&nbsp; {(video?.size / 1024 / 1024).toFixed(1)} MB
                </p>
                <video
                    key={videoURL}           /* remount when file changes */
                    src={videoURL}
                    controls
                    className="w-full rounded-xl bg-black"
                    style={{ maxHeight: 640, minWidth:640 }}
                />
              </div>
          )}

          <button
              onClick={handleUpload}
              disabled={loading}
              className="
            mt-6 px-6 py-2
            border border-tan rounded
            hover:bg-tan  hover:text-yellow-700 cursor-pointer
            transition disabled:opacity-50
          "
          >
            {loading ? "Training…" : "Train"}
          </button>

          {/* ── Epoch progress bar ── */}
          {loading && progress && (
              <div className="mt-6 w-full max-w-md">
                <p className="text-sm mb-1 opacity-70 montserrat">
                  {progress.label} &mdash; Epoch {progress.epoch} / {progress.total} &mdash; Loss: {progress.loss}
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
            bg-black/40 border border-tan/30 rounded-lg
            px-4 py-3 text-left text-xs font-mono
            max-h-52 overflow-y-auto
          ">
                {logs.map((log, i) => (
                    <div key={i} className="opacity-80 leading-relaxed whitespace-pre-wrap">{log}</div>
                ))}
                <div ref={logEndRef} />
              </div>
          )}
        </div>

        {/* ── Loss curve ── */}
        {trained && chartData.length > 0 && (
            <div className="w-full px-6 py-12 border-b border-tan/20">
              <h3 className="text-xl font-semibold montserrat mb-6 text-center">
                Training Loss Curve
              </h3>
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
                        contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: 6 }}
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

              {/* ── Go calibrate CTA ── */}
              <div className="mt-10 flex flex-col items-center gap-3 text-center">
                <p className="text-sm opacity-60 montserrat">
                  Training complete. Next step: calibrate the anomaly threshold.
                </p>
                <button
                    onClick={() => navigate("/calibration", { state: { autoStart: true } })}
                    className="
                px-8 py-3
                bg-tan text-oxford-blue
                font-semibold montserrat rounded-lg
                hover:opacity-90 active:scale-95
                transition-all duration-150
                shadow-lg shadow-tan/20
              "
                >
                  Run Calibration →
                </button>
              </div>
            </div>
        )}
      </section>
  );
};

export default UploadVideo;