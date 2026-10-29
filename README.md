# BAPD Boxing Association platform

A responsive full-stack association site for the Boxing Association of Palghar District. It includes the public site, athlete directory, event registration, rankings, news, player portal, staff dashboard, Clerk sign-in and a Groq assistant.

## Stack

- React + Vite for the public website and dashboards
- Node.js + Express for the API
- SQLite locally, accessed through `@libsql/client`
- Turso Cloud (libSQL/SQLite) for persistent cloud SQL on Vercel
- Clerk for sign-in and staff allowlists; Groq for chat

## Run locally

Requires Node.js 22.13 or newer.

```powershell
npm install
npm run dev
```

Open **http://localhost:5173**. The API runs at `http://localhost:5000`. Without `TURSO_DATABASE_URL`, the app uses the local `server/bapd.sqlite` file. If Turso variables are present, the app uses that cloud database instead.

For a production-style local preview:

```powershell
npm run build
npm start
```

Then open **http://localhost:5000**.

## Open the admin dashboard

1. Open the website and choose **Staff login** in the navigation or **Association staff** in the footer.
2. Sign in with Clerk. Create an account with **Join BAPD** if needed.
3. Admin access is granted by a Clerk user ID in `CLERK_ADMIN_USER_IDS`, or a verified email in `CLERK_ADMIN_EMAILS`. Separate multiple entries with commas.
4. Restart the server after editing `.env.local`.

The server verifies allowlisted emails with Clerk before granting access. Signed-in non-admin accounts cannot use staff APIs.

## Use Turso with Vercel

1. In Vercel, connect a Turso Cloud database from the Marketplace. The integration supplies `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to the project. Install the integration for Production and Preview environments as needed.
2. For a local import, link the repository to Vercel and pull the Turso variables into `.env.local` with `vercel env pull .env.local` (or set both variables locally without committing them).
3. Import the existing local SQLite data once:

   ```powershell
   npm run db:migrate:turso
   ```

   The import preserves players, events, registrations, linked player accounts, news and contact messages. It only runs against a Turso database that contains the automatic demo seed and refuses to overwrite existing non-demo cloud data.
4. Push the project to the Git repository connected to Vercel. `vercel.json` runs the build. The Express app is exported from the root entry point; the build copies the Vite output into `public/` so Vercel can serve the page and assets alongside the API.
5. Add the Clerk publishable key, Clerk secret, Clerk admin allowlist, Groq key/model, and Turso integration variables to the Vercel project environments. Use production Clerk keys for the production deployment. Redeploy after changing environment variables.

The app now uses the same libSQL client for local SQLite and remote Turso, so API routes and SQL schema work in both environments. The Turso database itself must be created and connected to your Vercel project before cloud requests can work.

## Connected services

Copy `.env.example` to `.env.local` for local settings. Never commit `.env.local`, `.env`, or API keys.

- **Turso:** set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to use cloud SQL. The aliases `TURSO_DB_URL` and `TURSO_TOKEN` are also accepted.
- **Clerk:** set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and either admin allowlist variable.
- **Groq:** set `GROQ_API_KEY`; the current workspace model is `openai/gpt-oss-20b`.

## Preview data and replacing it

The database seeds eight approved sample boxers, three pending sample applications, three sample fixtures, six sample event entries, three sample stories, and one sourced historical Palghar boxing report. The site shows a demo notice while sample records exist. Sample emails use the reserved `.invalid` domain. Replace sample records and verify event dates and points before presenting them as official association data.

Staff can review applications, add fixtures, approve or decline athletes, and check registrations. Public applications and contact messages are stored in the database.
