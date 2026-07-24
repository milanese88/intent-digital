import React from 'react';
import ReactDOMServer from 'react-dom/server';
import DashboardLayout from './src/pages/DashboardLayout.jsx';
import { jsxDEV as _jsxDEV } from "react/jsx-dev-runtime";
const html = ReactDOMServer.renderToString(/*#__PURE__*/_jsxDEV(DashboardLayout, {
  activeTab: "overview",
  setActiveTab: () => {},
  navigateTo: () => {}
}, void 0, false));
console.log(html);