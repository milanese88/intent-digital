# Intent Digital Website

React frontend built with Vite, connected to a serverless Vercel backend for live Cal.com calendar syncing.

## Production Environment Variables
To deploy this project to production (e.g., Vercel), the following Environment Variables must be strictly configured in your hosting platform dashboard. If these are missing, the Calendar on the Contact page will fail to load with a `500 Server configuration error`.

- `CAL_COM_API_KEY` (or `CAL_API_KEY`): Your private Cal.com API key. Keep this secure.
- `CAL_EVENT_TYPE_ID` (or `CAL_COM_EVENT_TYPE_ID`): The ID of the meeting type.
  - *Current Web Design Consult ID*: `6441308`
- `DATABASE_URL`: Your Neon Postgres connection string.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`: Used to securely seed the admin account initially.
- `AUTH_SECRET`: Used to generate magic link HMAC tokens.
- `SETUP_SECRET`: A master key protecting your diagnostic endpoint (`/api/auth-status`) and seed endpoint (`/api/seed-admin`).
- `RESEND_API_KEY`: Used to send emails.
- `BLOB_READ_WRITE_TOKEN`: Used to upload profile pictures.

## Emergency Admin Recovery

If you ever get locked out of your admin account and cannot use the Magic Link, you can manually reset your password against the production database using the provided CLI script. 

Ensure your `.env.local` contains your `DATABASE_URL`, then run:
```bash
node scripts/reset-admin-password.js <your_admin_email> <new_password>
```

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
