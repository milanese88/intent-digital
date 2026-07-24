# Intent Digital Website

React frontend built with Vite, connected to a serverless Vercel backend for live Cal.com calendar syncing.

## Production Environment Variables
To deploy this project to production (e.g., Vercel), the following Environment Variables must be strictly configured in your hosting platform dashboard. If these are missing, the Calendar on the Contact page will fail to load with a `500 Server configuration error`.

- `CAL_COM_API_KEY` (or `CAL_API_KEY`): Your private Cal.com API key. Keep this secure.
- `CAL_EVENT_TYPE_ID` (or `CAL_COM_EVENT_TYPE_ID`): The ID of the meeting type.
  - *Current Web Design Consult ID*: `6441308`

## Development
Run the local Vite server:
```bash
npm run dev
```
*(Note: A local proxy middleware in `vite.config.js` simulates the Vercel backend using `.env.local` for testing)*

## Build
```bash
npm run build
```
