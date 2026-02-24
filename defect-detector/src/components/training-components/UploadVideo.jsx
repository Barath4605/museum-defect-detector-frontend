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

const UploadVideo = () => {
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lossHistory, setLossHistory] = useState([]);
  const [trained, setTrained] = useState(false);

  const inputRef = useRef(null);

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

    setLoading(true);
    setLossHistory([]);
    setTrained(false);

    const formData = new FormData();
    formData.append("video", video);

    try {
      const response = await fetch("http://localhost:5000/api/train", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop(); // keep incomplete chunk

        for (const event of events) {
          if (!event.startsWith("data:")) continue;

          const jsonString = event.replace("data:", "").trim();

          try {
            const data = JSON.parse(jsonString);

            if (data.type === "progress_a" || data.type === "progress_b") {
              setLossHistory((prev) => [...prev, data.loss]);
            }

            if (data.type === "done") {
              setTrained(true);
            }

            if (data.type === "error") {
              console.error("Training error:", data.msg);
              setLoading(false);
              return;
            }

          } catch (err) {
            console.error("SSE parse error:", err);
          }
        }
      }

    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const chartData = lossHistory.map((loss, index) => ({
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

        {lossHistory.length > 0 && (
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