import React, { useState, useEffect, useRef } from "react";
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

const MAX_SIZE = 200 * 1024 * 1024; // 200MB

const UploadVideo = () => {
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(false);

  const [lossHistory, setLossHistory] = useState([]);
  const [trained, setTrained] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  const inputRef = useRef(null);

  // Poll training status
  useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("http://localhost:5000/api/train/status");
        const data = await res.json();

        setTrained(data.trained);

        if (data.lossHistory) {
          setLossHistory(data.lossHistory);
        }

        if (data.trained) {
          clearInterval(interval);
          setIsPolling(false);
        }
      } catch (err) {
        console.error("Polling error:", err);
        clearInterval(interval);
        setIsPolling(false);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isPolling]);

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
  };

  const handleUpload = async () => {
    if (!video) {
      alert("Select a video first");
      return;
    }

    const formData = new FormData();
    formData.append("video", video);

    try {
      setLoading(true);
      setTrained(false);
      setLossHistory([]);

      const response = await fetch("http://localhost:5000/api/train", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      setIsPolling(true);

    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const chartData = (lossHistory || []).map((loss, index) => ({
    epoch: index + 1,
    loss: loss
  }));

  return (
      <section>
        <div
            className="
          flex flex-col
          w-full min-h-screen
          px-6 py-12
          bg-oxford-blue text-tan
          items-center justify-center
          text-center
          border-b border-tan
        "
        >
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

          <button
              onClick={handleUpload}
              disabled={loading}
              className="
            mt-6
            px-6 py-2
            border border-tan
            rounded
            hover:bg-tan hover:text-white
            transition
            disabled:opacity-50
          "
          >
            {loading ? "Training..." : "Train"}
          </button>
        </div>

        {trained && lossHistory.length > 0 && (
            <div className="w-full h-96 mt-10 px-6">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="epoch" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="loss" stroke="#8884d8" />
                </LineChart>
              </ResponsiveContainer>
            </div>
        )}
      </section>
  );
};

export default UploadVideo;