import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync(path.resolve('./dist/index.html'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  resources: "usable",
  url: "http://localhost/"
});

dom.window.console.log = (...args) => {
  console.log('BROWSER LOG:', ...args);
};

dom.window.addEventListener('load', () => {
  console.log('Page loaded!');
  setTimeout(() => {
    // Navigate to admin
    dom.window.history.pushState({}, '', '/?route=admin');
    const event = new dom.window.PopStateEvent('popstate');
    dom.window.dispatchEvent(event);
    
    setTimeout(() => {
      console.log('HTML after navigation:', dom.window.document.body.innerHTML.substring(0, 500));
      const sidebar = dom.window.document.querySelector('.dashboard-sidebar');
      const mainContent = dom.window.document.querySelector('main');
      console.log('Sidebar exists?', !!sidebar);
      console.log('Main content HTML:', mainContent ? mainContent.innerHTML : 'No main');
    }, 1000);
  }, 1000);
});
