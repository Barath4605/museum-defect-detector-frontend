import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const slides = [
    {
        title: "Sample FPS",
        description:
            "Number of video frames sampled per second from CCTV. Controls temporal resolution versus computation cost.",
    },
    {
        title: "Window Size K",
        description:
            "Number of previous frame embeddings used by the temporal predictor to forecast the next representation.",
    },
    {
        title: "Training Epochs",
        description:
            "Total complete passes over the normal dataset during training.",
    },
    {
        title: "Batch Size",
        description:
            "Number of frames or sequences processed together in one forward-backward step.",
    },
    {
        title: "α Temporal (Short)",
        description:
            "Weight assigned to short-term temporal anomaly score in the final composite score.",
    },
    {
        title: "α Temporal (Long)",
        description:
            "Weight assigned to long-term temporal drift anomaly score.",
    },
    {
        title: "β Spatial",
        description:
            "Weight assigned to spatial reconstruction anomaly score.",
    },
    {
        title: "γ Energy (SVDD)",
        description:
            "Weight assigned to latent manifold deviation energy in final anomaly scoring.",
    },
];

const SlideShow = () => {
    const [index, setIndex] = useState(0);

    const nextSlide = () => {
        setIndex((prev) => (prev + 1) % slides.length);
    };

    const prevSlide = () => {
        setIndex((prev) => (prev - 1 + slides.length) % slides.length);
    };

    return (
        <section className="min-h-screen bg-oxford-blue text-white flex flex-col items-center justify-center px-6 py-20">

            <h1 className="text-5xl font-semibold text-tan mb-16 tracking-wide text-center">
                Model Hyperparameters
            </h1>

            <div className="relative w-full max-w-3xl ibm-mono bg-slate-800/60 backdrop-blur-md rounded-2xl p-10 shadow-xl transition-all duration-500">

                <h2 className="text-2xl font-semibold text-tan mb-6 montserrat">
                    {index + 1}. {slides[index].title}
                </h2>
                <p className="text-slate-300 text-tan leading-relaxed montserrat">
                    Definition :
                </p>

                <p className="text-slate-300 leading-relaxed montserrat">
                    {slides[index].description}
                </p>

                <div className="flex justify-between items-center mt-10">

                    <button
                        onClick={prevSlide}
                        className="p-3 rounded-full bg-slate-700 hover:bg-slate-600 transition"
                    >
                        <ChevronLeft />
                    </button>

                    <span className="text-sm text-slate-400">
                        {index + 1} / {slides.length}
                    </span>

                    <button
                        onClick={nextSlide}
                        className="p-3 rounded-full bg-slate-700 hover:bg-slate-600 transition"
                    >
                        <ChevronRight />
                    </button>

                </div>

            </div>
        </section>
    );
};

export default SlideShow;