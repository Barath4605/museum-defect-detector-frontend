import React, { useState, useEffect } from "react";
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
    const [isPolling, setIsPolling] = useState(false);

    const [threshold, setThreshold] = useState(null);
    const [tScale, setTScale] = useState(null);
    const [sScale, setSScale] = useState(null);
    const [eScale, setEScale] = useState(null);
    const [scores, setScores] = useState([]);

    useEffect(() => {
        if (!isPolling) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch("http://localhost:5000/api/calibration-status");
                const data = await res.json();

                if (data.threshold) {
                    setThreshold(data.threshold);
                    setTScale(data.t_scale);
                    setSScale(data.s_scale);
                    setEScale(data.e_scale);
                    setScores(data.scores || []);

                    clearInterval(interval);
                    setIsPolling(false);
                    setLoading(false);
                }
            } catch (err) {
                console.error("Calibration polling error:", err);
                clearInterval(interval);
                setIsPolling(false);
                setLoading(false);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [isPolling]);

    const handleCalibration = async () => {
        try {
            setLoading(true);
            setThreshold(null);
            setScores([]);

            const response = await fetch("http://localhost:5000/api/calibrate", {
                method: "POST"
            });

            if (!response.ok) throw new Error("Calibration failed");

            setIsPolling(true);
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    };

    const createHistogram = (data, binSize = 5) => {
        if (!data.length) return [];

        const min = Math.min(...data);
        const max = Math.max(...data);

        const bins = [];

        for (let start = min; start <= max; start += binSize) {
            bins.push({
                range: `${start.toFixed(0)}-${(start + binSize).toFixed(0)}`,
                count: data.filter(v => v >= start && v < start + binSize).length,
                start
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
                    Runs trained models on normal embeddings and computes the 97th percentile threshold.
                </p>

                <button
                    onClick={handleCalibration}
                    disabled={loading}
                    className="p-2 px-4 my-5 border border-tan rounded-sm hover:bg-tan hover:text-black transition"
                >
                    {loading ? "Calibrating..." : "Run Calibration"}
                </button>

                {threshold && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 my-6 text-center">
                        <div>
                            <p className="text-sm opacity-70">Threshold</p>
                            <p className="text-2xl">{threshold.toFixed(4)}</p>
                        </div>
                        <div>
                            <p className="text-sm opacity-70">t_scale</p>
                            <p className="text-2xl">{tScale?.toFixed(4)}</p>
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
                                <ReferenceLine
                                    x={histogramData.find(
                                        b => threshold >= b.start && threshold < b.start + 5
                                    )?.range}
                                    stroke="red"
                                    strokeDasharray="4 4"
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </section>
    );
};

export default Calibration;