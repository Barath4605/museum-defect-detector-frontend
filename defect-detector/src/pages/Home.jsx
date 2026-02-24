import React from 'react';
import Landing from "../components/homepage-components/Landing.jsx";
import Flowchart from "../components/homepage-components/Flowchart.jsx";
import SlideShow from "../components/homepage-components/SlideShow.jsx";
import Navbar from "../components/Navbar.jsx";

const Home = () => {
  return (
      <>
          <Navbar />
          <Landing />
          <Flowchart />
          <SlideShow />
      </>
  );
};

export default Home;
