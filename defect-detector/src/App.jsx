import './App.css'
import Home from "./pages/Home.jsx"
import { Routes, Route } from "react-router-dom";
import Training from "./pages/Training.jsx";
import Calibration from "./pages/Calibration.jsx";

function App() {

    return (
        <Routes>
            <Route path="/" element={<Home />} ></Route>
            <Route path="/training" element={<Training />} ></Route>
            <Route path="/calibration" element={<Calibration />} ></Route>
        </Routes>
    )

}

export default App
