import React from "react";
import { ArrowDown } from "lucide-react";

const Step = ({ children }) => {
    return (
        <div className="w-full max-w-3xl ibm-mono bg-slate-800/60 backdrop-blur-md rounded-2xl p-6 shadow-lg hover:shadow-xl transition duration-300">
            {children}
        </div>
    );
};

const Arrow = () => {
    return (
        <div className="flex items-center justify-center text-tan">
            <ArrowDown size={28} />
        </div>
    );
};

const Flowchart = () => {
    return (
        <section className="min-h-screen bg-oxford-blue text-white py-20 px-6 border-b border-tan">

            <h1 className="text-5xl font-semibold text-tan text-center mb-16 tracking-wide">
                Video Anomaly Detection Workflow
            </h1>

            <div className="flex flex-col items-center space-y-8">

                <Step>
                    <h2 className="text-xl font-semibold text-tan mb-2">
                        Input Video
                    </h2>
                    <p className="text-slate-300">Normal Video (2.mp4)</p>
                </Step>

                <Arrow />

                <Step>
                    <h2 className="text-xl font-semibold text-tan mb-2">
                        Frame Sampler
                    </h2>
                    <p className="text-slate-300">
                        3 FPS • 224×224 resolution
                    </p>
                    <p className="text-sm text-slate-400">
                        CLAHE normalization applied
                    </p>
                </Step>

                <Arrow />

                <Step>
                    <h2 className="text-xl font-semibold text-tan mb-2">
                        Frozen ViT-B/16
                    </h2>
                    <p className="text-slate-300">
                        CLS token (768D) + 196 patch tokens
                    </p>
                    <p className="text-sm text-slate-400">
                        Embeddings cached to disk
                    </p>
                </Step>

                <Arrow />

                <Step>
                    <h2 className="text-xl font-semibold text-tan mb-4">
                        JEPA Training
                    </h2>

                    <ul className="space-y-2 text-slate-300">
                        <li>Temporal Transformer → Predict Eₜ from Eₜ₋ₖ</li>
                        <li>Spatial JEPA Head → Reconstruct masked patches</li>
                    </ul>
                </Step>

                <Arrow />

                <Step>
                    <h2 className="text-xl font-semibold text-tan mb-2">
                        Statistical Calibration
                    </h2>
                    <p className="text-slate-300">
                        Mahalanobis Fit + Percentile Thresholding
                    </p>
                </Step>

                <Arrow />

                <Step>
                    <h2 className="text-xl font-semibold text-tan mb-2">
                        Test Video Inference
                    </h2>
                </Step>

                <Arrow />

                <Step>
                    <h2 className="text-xl font-semibold text-tan mb-2">
                        Final Anomaly Score
                    </h2>
                    <p className="text-slate-300 font-medium">
                        α·Temporal + β·Spatial + γ·Mahalanobis
                    </p>
                </Step>

                <Arrow />

                <Step>
                    <h2 className="text-xl font-semibold text-red-400 mb-2">
                        Alert Trigger
                    </h2>
                    <p className="text-slate-300">
                        Trigger when Score &gt; Threshold
                    </p>
                </Step>

            </div>
        </section>
    );
};

export default Flowchart;