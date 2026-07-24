require('@babel/register')({
  presets: ['@babel/preset-react']
});
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const { default: DashboardLayout } = require('./src/pages/DashboardLayout.jsx');

console.log('Rendering DashboardLayout...');
const html = ReactDOMServer.renderToString(
  React.createElement(DashboardLayout, {
    activeTab: 'overview',
    setActiveTab: () => {},
    navigateTo: () => {}
  })
);
console.log('--- HTML OUTPUT ---');
console.log(html);
