import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

// Load environment variables for local dev
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production.local' });
dotenv.config();

// Simple Vite middleware to mimic Vercel Serverless Functions locally
const vercelApiMock = () => {
  return {
    name: 'vercel-api-mock',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url.startsWith('/api/get-availability')) {
          try {
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const dateFrom = urlObj.searchParams.get('dateFrom');
            const dateTo = urlObj.searchParams.get('dateTo');
            const apiKey = process.env.CAL_COM_API_KEY;
            const eventTypeId = process.env.CAL_COM_EVENT_TYPE_ID;

            const fetchUrl = `https://api.cal.com/v2/slots/available?eventTypeId=${eventTypeId}&startTime=${dateFrom.substring(0,10)}&endTime=${dateTo.substring(0,10)}`;
            
            const fetchRes = await fetch(fetchUrl, {
              headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            const json = await fetchRes.json();
            
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify(json.data));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        if (req.url.startsWith('/api/book-slot') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body);
              const apiKey = process.env.CAL_COM_API_KEY;
              
              const fetchRes = await fetch(`https://api.cal.com/v2/bookings`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  eventTypeId: parseInt(process.env.CAL_COM_EVENT_TYPE_ID, 10),
                  start: payload.start,
                  responses: payload.responses,
                  metadata: {},
                  timeZone: payload.timeZone || 'America/New_York',
                  language: 'en'
                })
              });

              const json = await fetchRes.json();
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify(json.data));
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        // General serverless function runner for local dev
        if (req.url.startsWith('/api/')) {
          const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
          const endpoint = urlObj.pathname.replace('/api/', '');
          const filePath = path.resolve(`./api/${endpoint}.js`);

          if (fs.existsSync(filePath)) {
            let bodyStr = '';
            req.on('data', chunk => { bodyStr += chunk; });
            req.on('end', async () => {
              try {
                if (bodyStr) {
                  try {
                    req.body = JSON.parse(bodyStr);
                  } catch {
                    req.body = bodyStr;
                  }
                } else {
                  req.body = {};
                }

                req.query = Object.fromEntries(urlObj.searchParams.entries());

                if (!req.headers.cookie || !req.headers.cookie.includes('auth_session')) {
                  req._user = {
                    id: 'a145b049-c360-4664-99c6-f029ce1b83b3',
                    email: process.env.ADMIN_EMAIL || 'mn.florenciaok@gmail.com',
                    username: '@florencianuñez',
                    full_name: 'Florencia Nuñez',
                    profile_image_url: null
                  };
                }

                res.status = function(code) {
                  this.statusCode = code;
                  return this;
                };
                res.json = function(data) {
                  this.setHeader('Content-Type', 'application/json');
                  this.end(JSON.stringify(data));
                  return this;
                };
                res.redirect = function(url, status = 302) {
                  this.statusCode = status;
                  this.setHeader('Location', url);
                  this.end();
                  return this;
                };

                const mod = await import(`file://${filePath}?t=${Date.now()}`);
                await mod.default(req, res);
              } catch (err) {
                console.error('Vite local API error:', err);
                if (!res.writableEnded) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err.message }));
                }
              }
            });
            return;
          }
        }

        next();
      });
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), vercelApiMock()],
})
