import React from 'react';
import "../../index.css"

const Landing = () => {
    return (
        <section>
            <div className="
                flex flex-col
                w-full min-h-screen
                px-6 py-12
                text-white
                bg-oxford-blue text-tan
                items-center justify-center
                border-b border-tan
          ">
                <h1 className="text-9xl font-bold ibm-mono
                        bg-linear-to-b from-white/80 via-white/60 to-transparent
                        bg-clip-text text-transparent w-[75%]
        ">
                    JEPA <br/> Exhibit Defect Detections
                </h1>

                <p className="
                  text-center montserrat
                  w-full
                  sm:w-[80%]
                  lg:w-[50%]
                  text-base
                  sm:text-lg
                ">
                    Self-supervised spatio-temporal AI that
                    learns an exhibit’s normal behavior and flags
                    anomalies in latent space without defect labels.
                </p>
            </div>
        </section>
    );
};

export default Landing;