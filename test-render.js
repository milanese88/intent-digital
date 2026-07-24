import React from 'react';
import ReactDOMServer from 'react-dom/server';
import AdminDashboard from './src/pages/AdminDashboard.jsx';

const html = ReactDOMServer.renderToString(<AdminDashboard />);
console.log(html);
