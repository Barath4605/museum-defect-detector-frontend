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
                text-center
                border-b border-tan
          ">
                <h1 className="
                  text-3xl
                  sm:text-4xl
                  lg:text-6xl
                  font-semibold
                  montserrat
                ">
                    JEPA Exhibit Defect Detection
                </h1>

                <p className="

                  w-full
                  sm:w-[80%]
                  lg:w-[40%]
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