import React from 'react';

const Footer = () => {

    const devs = [
        {
            name: "Abhivanth R",
            github: "https://github.com/Abhivanth-08",
            linkedin: "https://linkedin.com/in/abhivanth-r/",
        } ,
        {
            name: "Barath P",
            github: "https://github.com/Barath4605/",
            linkedin: "https://www.linkedin.com/in/barath4605/"
        },
        {
            name: "Bommaiya Mayuran A S N",
            github: "https://github.com/asnbommaiyamayuran-pixel",
            linkedin: "https://www.linkedin.com/in/bommaiya-mayuran-a-s-n-2617772b8/"
        }
    ]

  return (
      <footer className="w-[80%] mx-auto">
        <h1 className="text-xl font-light ibm-mono text-white ">
            JEPA Exhibit Defect Detections<span className="text-md">©</span>
        </h1>
          <hr className="text-white/40 my-2"/>
          <div className="flex justify-between items-center space-x-2 mb-2 text-2xl text-white ibm-mono">
              {devs.map( (dev) => (
                  <>
                      <div>
                          <h1 className="cursor-pointer w-fit text-3xl text-white border-white">
                              {dev.name}
                          </h1>
                          <ul className="flex flex-col">
                              <li className="ibm-mono text-neutral-50/50 border-b border-neutral-50/50 hover:border-neutral-50
                                            w-fit text-base hover:text-neutral-50 cursor-pointer" onClick={() => window.open(dev.github , "_blank","noopener,noreferrer")}>Github</li>
                              <li className="ibm-mono text-neutral-50/50 border-b border-neutral-50/50 hover:border-neutral-50
                                            w-fit text-base hover:text-neutral-50 cursor-pointer" onClick={() => window.open(dev.linkedin , "_blank","noopener,noreferrer")}>Linkedin</li>
                          </ul>
                      </div>
                  </>

              ))}
          </div>
      </footer>
  );
};

export default Footer;
