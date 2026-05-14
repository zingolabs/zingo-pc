import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import Routes from "./Routes";

const Root = () => (
  <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes />
  </Router>
);

export default Root;
