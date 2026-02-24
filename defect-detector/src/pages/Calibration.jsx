import React, { useState } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer,
    ReferenceLine
} from "recharts";

const Calibration = () => {
    const [loading, setLoading] = useState(false);

    const [threshold, setThreshold] = useState(null);
    const [tScale, setTScale] = useState(null);
    const [tLongScale, setTLongScale] = useState(null);
    const [sScale, setSScale] = useState(null);
    const [eScale, setEScale] = useState(null);
    const [scores, setScores] = useState([]);

    const handleCalibration = async () => {
        setLoading(true);
        setThreshold(null);
        setScores([]);

        try {
            const response = await fetch("http://localhost:5000/api/calibrate", {
                method: "POST"
            });

            if (!response.ok) throw new Error("Calibration failed");

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
                    if (!event.startsWith("data:")) continue;

                    const jsonString = event.replace("data:", "").trim();

                    try {
                        const data = JSON.parse(jsonString);

                        if (data.type === "progress") {
                            console.log("Calibration progress:", data.current, "/", data.total);
                        }

                        if (data.type === "done") {
                            setThreshold(data.threshold);
                            setTScale(data.t_scale);
                            setTLongScale(data.t_long_scale);
                            setSScale(data.s_scale);
                            setEScale(data.e_scale);
                            setScores(data.scores || []);
                            setLoading(false);
                        }

                        if (data.type === "error") {
                            console.error("Calibration error:", data.msg);
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
            setLoading(false);
        }
    };

    const createHistogram = (data, binCount = 20) => {
        if (!data.length) return [];

        const min = Math.min(...data);
        const max = Math.max(...data);
        const binSize = (max - min) / binCount;

        const bins = [];

        for (let i = 0; i < binCount; i++) {
            const start = min + i * binSize;
            const end = start + binSize;

            bins.push({
                range: `${start.toFixed(2)}-${end.toFixed(2)}`,
                count: data.filter(v => v >= start && v < end).length,
                start,
                end
            });
        }

        return bins;
    };

    const histogramData = createHistogram(scores);

    return (
        <section>
            <div className="w-full min-h-screen px-6 py-12 bg-oxford-blue text-tan border-b border-tan">
                <h1 className="text-3xl font-semibold montserrat border-b border-yellow-500/50 pb-1 w-fit">
                    Calibrate Anomaly Threshold
                </h1>

                <p className="w-full sm:w-[80%] lg:w-[40%] text-sm sm:text-lg my-2">
                    Computes 97th percentile threshold from normal embeddings.
                </p>

                <button
                    onClick={handleCalibration}
                    disabled={loading}
                    className="p-2 px-4 my-5 border border-tan rounded-sm hover:bg-tan hover:text-black transition"
                >
                    {loading ? "Calibrating..." : "Run Calibration"}
                </button>

                {threshold !== null && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-6 my-6 text-center">
                        <div>
                            <p className="text-sm opacity-70">Threshold</p>
                            <p className="text-2xl">{threshold.toFixed(4)}</p>
                        </div>
                        <div>
                            <p className="text-sm opacity-70">t_scale</p>
                            <p className="text-2xl">{tScale?.toFixed(4)}</p>
                        </div>
                        <div>
                            <p className="text-sm opacity-70">t_long</p>
                            <p className="text-2xl">{tLongScale?.toFixed(4)}</p>
                        </div>
                        <div>
                            <p className="text-sm opacity-70">s_scale</p>
                            <p className="text-2xl">{sScale?.toFixed(4)}</p>
                        </div>
                        <div>
                            <p className="text-sm opacity-70">e_scale</p>
                            <p className="text-2xl">{eScale?.toFixed(4)}</p>
                        </div>
                    </div>
                )}

                {histogramData.length > 0 && (
                    <div className="w-full h-96 mt-10">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={histogramData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="range" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="count" fill="#3182ce" />

                                {threshold !== null && (
                                    <ReferenceLine
                                        x={
                                            histogramData.find(
                                                b => threshold >= b.start && threshold < b.end
                                            )?.range
                                        }
                                        stroke="red"
                                        strokeDasharray="4 4"
                                    />
                                )}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </section>
    );
};

export default Calibration;