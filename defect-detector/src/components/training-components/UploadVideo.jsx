import React, { useState, useRef, useEffect, useCallback } from "react";
import "../../index.css";
import { useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer,
} from "recharts";

const MAX_SIZE = 200 * 1024 * 1024;
const BASE_URL = "https://abhi02072005-jepa-backend.hf.space";

const UploadVideo = () => {
  const navigate = useNavigate();

  const [video, setVideo]             = useState(null);
  const [videoURL, setVideoURL]       = useState(null);
  const [loading, setLoading]         = useState(false);
  const [lossHistory, setLossHistory] = useState([]);
  const [trained, setTrained]         = useState(false);
  const [logs, setLogs]               = useState([]);
  const [error, setError]             = useState(null);
  const [progress, setProgress]       = useState(null);
  const [dragOver, setDragOver]       = useState(false);

  const inputRef  = useRef(null);
  const logEndRef = useRef(null);

  useEffect(() => {
    return () => { if (videoURL) URL.revokeObjectURL(videoURL); };
  }, [videoURL]);

  const pushLog = (msg) => {
    setLogs((prev) => [...prev, msg]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const applyFile = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) { alert("Only video files allowed"); return; }
    if (file.size > MAX_SIZE) { alert("Video must be under 200MB"); return; }
    if (videoURL) URL.revokeObjectURL(videoURL);
    setVideo(file);
    setVideoURL(URL.createObjectURL(file));
    setError(null);
    setTrained(false);
    setLossHistory([]);
    setLogs([]);
  }, [videoURL]);

  const handleChange    = (e)  => applyFile(e.target.files[0]);
  const handleDrop      = useCallback((e) => { e.preventDefault(); setDragOver(false); applyFile(e.dataTransfer.files[0]); }, [applyFile]);
  const handleDragOver  = (e)  => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = ()   => setDragOver(false);

  const removeFile = (e) => {
    e.stopPropagation();
    if (videoURL) URL.revokeObjectURL(videoURL);
    setVideo(null); setVideoURL(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const pollStatus = async () => {
    const res    = await fetch(`${BASE_URL}/api/train/status`);
    const status = await res.json();
    if (status.loss_history?.length) setLossHistory(status.loss_history);
    return status.trained === true;
  };

  const handleUpload = async () => {
    if (!video) { alert("Select a video first"); return; }
    setLoading(true); setLossHistory([]); setTrained(false);
    setLogs([]); setError(null); setProgress(null);

    const formData = new FormData();
    formData.append("video", video);
    let trainingFinished = false;

    try {
      pushLog("📤 Uploading video…");
      const response = await fetch(`${BASE_URL}/api/train`, { method: "POST", body: formData });
      if (!response.ok) { const t = await response.text(); throw new Error(`Server error ${response.status}: ${t}`); }
      pushLog("✅ Upload accepted — training started…");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

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
          try { data = JSON.parse(jsonStr); } catch { continue; }

          switch (data.type) {
            case "log":        pushLog(data.msg); break;
            case "progress_a": setProgress({ label: "JEPA", epoch: data.epoch, total: data.total, loss: data.loss }); break;
            case "stage_a_done":
              if (data.loss_history?.length) setLossHistory(data.loss_history);
              pushLog(`📉 JEPA done — final loss: ${data.final_loss}`);
              break;
            case "progress_b": setProgress({ label: "SVDD", epoch: data.epoch, total: data.total, loss: data.loss }); break;
            case "done":
              trainingFinished = true;
              pushLog(`🎉 Training complete! JEPA: ${data.jepa_loss} | SVDD: ${data.svdd_loss}`);
              break;
            case "error":
              pushLog(`❌ ${data.msg}`);
              if (data.trace) console.error(data.trace);
              setError(data.msg); setLoading(false); return;
            default: break;
          }
        }
      }

      pushLog("⏳ Confirming with server…");
      try {
        const isReady = await pollStatus();
        if (isReady || trainingFinished) { setTrained(true); pushLog("✅ Model is ready!"); }
        else { setError("Checkpoints not found — check HF Space logs."); pushLog("⚠️ Checkpoints missing."); }
      } catch {
        if (trainingFinished) { setTrained(true); pushLog("✅ Complete (poll failed, stream confirmed)."); }
        else setError("Could not confirm training status.");
      }
    } catch (err) {
      setError(err.message); pushLog(`❌ ${err.message}`);
    } finally {
      setLoading(false); setProgress(null);
    }
  };

  const chartData    = lossHistory.map((loss, i) => ({ epoch: i + 1, loss: parseFloat(Number(loss).toFixed(6)) }));
  const progressPct  = progress ? Math.round((progress.epoch / progress.total) * 100) : 0;

  return (
      <section className="bg-oxford-blue text-tan min-h-screen">
        <style>{`
        @keyframes pulse-border { 0%,100% { opacity:.5 } 50% { opacity:1 } }
        @keyframes float-up     { 0% { transform:translateY(6px); opacity:0 } 100% { transform:translateY(0); opacity:1 } }
        @keyframes bar-shimmer  {
          0%   { transform:translateX(-100%); }
          100% { transform:translateX(400%); }
        }
        .drop-zone-active { animation: pulse-border 1.5s ease-in-out infinite; }
        .fade-up          { animation: float-up .35s ease forwards; }
      `}</style>

        {/* ══════════════════════════════════
          HERO / UPLOAD SECTION
         ══════════════════════════════════ */}
        <div className="flex flex-col w-full min-h-screen px-6 py-16 items-center justify-center text-center border-b border-tan/10">

          {/* Step label */}
          <div className="flex items-center gap-2 mb-6">
            <span className="w-5 h-5 rounded-full border border-tan/30 flex items-center justify-center text-[10px] montserrat opacity-50">1</span>
            <span className="text-[10px] montserrat tracking-[0.25em] uppercase opacity-40">Training</span>
          </div>

          <h2 className="text-4xl sm:text-5xl font-semibold montserrat leading-tight mb-3">
            Upload Normal Video
          </h2>
          <p className="text-sm opacity-40 montserrat max-w-sm mb-12 leading-relaxed">
            The model learns what "normal" looks like from this footage. Use clean, representative clips.
          </p>

          {/* ── DROP ZONE ─────────────────────────────────────────────────── */}
          <div className="w-full max-w-2xl fade-up">

            {/* Empty / drag state */}
            {!video && (
                <div
                    onClick={() => inputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={`
                relative cursor-pointer rounded-2xl
                transition-all duration-300 select-none
                ${dragOver
                        ? "bg-tan/8 scale-[1.01]"
                        : "bg-linear-to-br from-black/10 via-black/40 to-black/80 hover:bg-black/50"}
              `}
                    style={{ padding: "3px" }} /* gradient border wrapper */
                >
                  {/* Gradient border */}
                  <div className={`
                absolute inset-0 rounded-2xl pointer-events-none
                ${dragOver ? "drop-zone-active" : ""}
              `}
                       style={{
                         background: dragOver
                             ? "linear-gradient(135deg, #d2b48c 0%, rgba(210,180,140,0.3) 50%, #d2b48c 100%)"
                             : "linear-gradient(135deg, rgba(210,180,140,0.25) 0%, rgba(210,180,140,0.05) 50%, rgba(210,180,140,0.25) 100%)",
                         WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                         WebkitMaskComposite: "xor",
                         maskComposite: "exclude",
                         padding: "1.5px",
                         borderRadius: "1rem",
                       }}
                  />

                  <div className={`
                relative rounded-2xl px-10 py-16 flex flex-col items-center gap-5
                ${dragOver ? "bg-tan/5" : "backdrop-blur-2xl"}
                transition-colors duration-200
              `}>
                    {/* Icon */}
                    <div className={`
                  w-20 h-20 
                  flex items-center justify-center
                  backdrop-blur-2xl
                  transition-all duration-300
                  ${dragOver ? "scale-110 border-tan/50 bg-tan/10" : ""}
                `}>
                      {dragOver ? (
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-tan">
                            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                          </svg>
                      ) : (
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-50">
                            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
                            <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/>
                            <line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/>
                            <line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>
                            <line x1="17" y1="17" x2="22" y2="17"/>
                          </svg>
                      )}
                    </div>

                    <div className="text-center">
                      <p className="montserrat text-lg font-semibold opacity-80">
                        {dragOver ? "Release to upload" : "Drop video here"}
                      </p>
                      <p className="montserrat text-xs opacity-35 mt-1.5">
                        or&nbsp;
                        <span className="text-tan/70 underline underline-offset-2 hover:text-tan transition">
                      click to browse
                    </span>
                        &nbsp;· MP4, MOV, AVI, MKV · up to 200 MB
                      </p>
                    </div>

                    {/* Format pills */}
                    <div className="flex gap-2 mt-1">
                      {["MP4", "MOV", "AVI", "MKV"].map((fmt) => (
                          <span key={fmt} className="px-2.5 py-0.5 rounded-full text-[10px] montserrat border border-tan/15 opacity-40">
                      {fmt}
                    </span>
                      ))}
                    </div>
                  </div>
                </div>
            )}

            {/* File selected state */}
            {video && videoURL && (
                <div className="overflow-hidden fade-up">
                  {/* Video preview */}
                  <video
                      key={videoURL}
                      src={videoURL}
                      controls
                      className="w-full bg-black"
                      style={{ maxHeight: 720, maxWidth: 720 }}
                  />

                  {/* File meta bar */}
                  <div className="flex items-center justify-between px-5 py-3 bg-slate-900/80 border-t border-tan/10">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Video icon */}
                      <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60">
                          <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs montserrat opacity-70 truncate leading-none">{video.name}</p>
                        <p className="text-[10px] montserrat opacity-30 mt-0.5">{(video.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                      <button onClick={() => inputRef.current?.click()}
                              className="text-[11px] montserrat opacity-40 hover:opacity-80 transition underline underline-offset-2">
                        Change
                      </button>
                      <button onClick={removeFile}
                              className="w-6 h-6 rounded-full border border-tan/20 flex items-center justify-center opacity-40 hover:opacity-80 hover:border-tan/50 transition text-xs">
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
            )}
          </div>

          {/* Hidden input */}
          <input ref={inputRef} type="file" accept="video/*" onChange={handleChange} className="hidden" />

          {/* ── Train button ── */}
          <button
              onClick={handleUpload}
              disabled={loading || !video}
              className={`
            mt-8 px-12 py-3.5
            montserrat font-semibold text-sm tracking-wide
            transition-all duration-200
            ${!video
                  ? "opacity-20 border border-tan/20 cursor-not-allowed"
                  : loading
                      ? "border border-tan/40 opacity-60 cursor-wait"
                      : "bg-tan text-oxford-blue hover:opacity-90 active:scale-95 shadow-lg shadow-tan/20 cursor-pointer"}
          `}
          >
            {loading ? (
                <span className="flex items-center gap-2">
              <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              Training…
            </span>
            ) : "Start Training →"}
          </button>

          {/* ── Progress bar ── */}
          {loading && progress && (
              <div className="mt-8 w-full max-w-md fade-up">
                <div className="flex justify-between text-xs montserrat opacity-50 mb-2">
                  <span>{progress.label} · Epoch {progress.epoch} / {progress.total}</span>
                  <span>Loss: {progress.loss}</span>
                </div>
                <div className="relative w-full h-1 bg-slate-700/60 rounded-full overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-tan rounded-full transition-all duration-500"
                       style={{ width: `${progressPct}%` }} />
                  {/* shimmer */}
                  <div className="absolute inset-y-0 w-16 rounded-full opacity-60"
                       style={{
                         left: `${Math.max(progressPct - 8, 0)}%`,
                         background: "linear-gradient(90deg, transparent, rgba(210,180,140,0.6), transparent)",
                         animation: "bar-shimmer 1.4s linear infinite",
                       }} />
                </div>
                <p className="text-right text-[10px] montserrat opacity-25 mt-1">{progressPct}%</p>
              </div>
          )}

          {/* ── Error ── */}
          {error && (
              <div className="mt-6 w-full max-w-xl fade-up">
                <div className="bg-red-950/40 border border-red-500/40 rounded-xl px-5 py-4 text-left">
                  <p className="text-xs font-semibold montserrat text-red-400 mb-1">Error</p>
                  <p className="text-xs montserrat text-red-300/70 leading-relaxed">{error}</p>
                </div>
              </div>
          )}

          {/* ── Log console ── */}
          {logs.length > 0 && (
              <div className="mt-5 w-full max-w-2xl fade-up">
                <div className="bg-black/30 backdrop-blur-2xl text-green-400 px-5 py-4 text-left text-[11px] ibm-mono max-h-48 overflow-y-auto">
                  {logs.map((log, i) => (
                      <div key={i} className="opacity-60 leading-relaxed whitespace-pre-wrap py-0.5">{log}</div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
          )}
        </div>

        {/* ══════════════════════════════════
          LOSS CURVE
         ══════════════════════════════════ */}
        {trained && chartData.length > 0 && (
            <div className="w-full px-6 py-20">
              {/* Header */}
              <div className="text-center mb-12">
                <p className="text-[10px] montserrat tracking-[0.3em] uppercase opacity-30 mb-2">Results</p>
                <h3 className="text-2xl font-semibold montserrat">Training Loss Curve</h3>
                <p className="text-xs opacity-35 montserrat mt-1">JEPA reconstruction loss per epoch</p>
              </div>

              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="epoch" stroke="#475569" tick={{ fill: "#64748b", fontSize: 11 }}
                           label={{ value: "Epoch", position: "insideBottom", offset: -2, fill: "#64748b" }} />
                    <YAxis stroke="#475569" tick={{ fill: "#64748b", fontSize: 11 }}
                           label={{ value: "Loss", angle: -90, position: "insideLeft", fill: "#64748b" }} />
                    <Tooltip
                        contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 10 }}
                        labelStyle={{ color: "#94a3b8" }} itemStyle={{ color: "#d2b48c" }} />
                    <Line type="monotone" dataKey="loss" stroke="#d2b48c" strokeWidth={2}
                          dot={false} activeDot={{ r: 5, fill: "#d2b48c", stroke: "#0f172a", strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* ── CTA ── */}
              <div className="mt-16 flex flex-col items-center gap-5">
                <div className="flex items-center gap-4 w-full max-w-xs">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent to-tan/20" />
                  <span className="text-[10px] montserrat tracking-[0.3em] uppercase opacity-25">Next step</span>
                  <div className="flex-1 h-px bg-gradient-to-l from-transparent to-tan/20" />
                </div>

                <p className="text-sm opacity-40 montserrat">
                  Set the anomaly threshold by running calibration.
                </p>

                <button
                    onClick={() => navigate("/calibration", { state: { autoStart: true } })}
                    className="
                group relative px-12 py-3.5 rounded-xl overflow-hidden
                bg-tan text-oxford-blue
                font-semibold montserrat text-sm tracking-wide
                hover:opacity-95 active:scale-95
                transition-all duration-150
                shadow-xl shadow-tan/20
              "
                >
              <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-500
                               bg-linear-to-r from-transparent via-white/15 to-transparent" />
                  Run Calibration →
                </button>
              </div>
            </div>
        )}
      </section>
  );
};

export default UploadVideo;