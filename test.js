const babel = require('@babel/core');
const fs = require('fs');

const code = `
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import DashboardLayout from './src/pages/DashboardLayout.jsx';

const html = ReactDOMServer.renderToString(<DashboardLayout activeTab="overview" setActiveTab={() => {}} navigateTo={() => {}} />);
console.log('--- HTML OUTPUT ---');
console.log(html);
`;

const result = babel.transformSync(code, {
  presets: ['@babel/preset-react'],
  filename: 'test.jsx'
});

fs.writeFileSync('test-compiled.js', result.code);
