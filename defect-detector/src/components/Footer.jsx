import React from 'react';

const Footer = () => {

    const devs = [
        {
            name: "Abhivanth R",
            github: "https://github.com/Abhivanth-08",
        } ,
        {
            name: "Barath P",
            github: "https://github.com/Barath4605/",
        },
        {
            name: "Bommaiya Mayuran A S N",
            github: "abhivanth",
        }
    ]

  return (
      <footer className="w-[80%] mx-auto">
        <h1 className="text-9xl font-bold ibm-mono
                        bg-linear-to-b from-black/80 via-black/80 to-transparent
                        bg-clip-text text-transparent
        ">
            JEPA <br/> Exhibit Defect Detections
        </h1>
          <span className="text-white/40 mt-2 font-light text-lg">by</span>
          <div className="flex justify-between items-center space-x-2 mb-2 text-2xl text-white ibm-mono">
              {devs.map( (dev) => (
                  <button className="cursor-pointer border-b text-white/50 hover:text-white border-white/50 hover:border-white"
                          onClick={() => window.open(dev.github, "_blank")}>
                      {dev.name}
                  </button>
              ))}
          </div>
      </footer>
  );
};

export default Footer;
