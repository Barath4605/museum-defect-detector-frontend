import React from "react";
import {useNavigate} from "react-router-dom";

const Navbar = () => {

    const links = [
        { name: "Home", link: "/" },
        { name: "Training", link: "/training" },
        { name: "Calibration", link: "/calibration" },
        { name: "Detect", link: "/detect" }
    ];
    const nav = useNavigate();
    return (
        <nav className="sticky top-5 rounded-full z-50 p-2 lg:w-[50%] w-[95%] m-auto shadow-md backdrop-blur-2xl bg-linear-to-bl from-black/75 via-black/50 to-black/35
         border-t border-white/15 montserrat tracking-widest text-sm text-white">
            <div className="flex justify-center space-x-3">
                {links.map((link) => (
                    <button
                        key={link.link}
                        onClick={() => nav(link.link)}
                        className="lg:p-2 p-1 lg:px-6 rounded-2xl underline lg:no-underline
                        hover:bg-linear-to-br hover:from-black/30 hover:via-black/60 hover:to-black/25
                        transition-all ease-in-out duration-400"
                    >
                        {link.name}
                    </button>
                ))}
            </div>
        </nav>
    );
};

export default Navbar;