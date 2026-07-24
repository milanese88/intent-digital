const babel = require('@babel/core');
const fs = require('fs');

const code = `
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import DashboardLayout from './src/pages/DashboardLayout.jsx';

const html = ReactDOMServer.renderToString(
  <DashboardLayout activeTab="overview" setActiveTab={() => {}} navigateTo={() => {}} />
);
console.log(html);
`;

const result = babel.transformSync(code, {
  presets: ['@babel/preset-react', '@babel/preset-env'],
  filename: 'test.jsx'
});

fs.writeFileSync('babel-test-compiled.cjs', result.code);
