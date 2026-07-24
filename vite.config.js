import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dotenv from 'dotenv'
import http from 'http'

// Load environment variables for local dev
dotenv.config({ path: '.env.local' });

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
            
            // Use native global fetch (Node 18+)
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

        next();
      });
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), vercelApiMock()],
})
