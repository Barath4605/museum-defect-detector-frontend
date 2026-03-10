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
        <nav className="sticky top-0 z-50 p-2  shadow-md w-full bg-oxford-blue border-b border-white/20 montserrat tracking-widest text-sm text-white">
            <div className="flex justify-center space-x-3">
                {links.map((link) => (
                    <button
                        key={link.link}
                        onClick={() => nav(link.link)}
                        className="p-2 rounded-2xl hover:bg-white/20 transition-all ease-in-out duration-200"
                    >
                        {link.name}
                    </button>
                ))}
            </div>
        </nav>
    );
};

export default Navbar;