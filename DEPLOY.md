# Deploying to Render

One Render web service serves the API and the frontend. A Render PostgreSQL database stores the data. `render.yaml` describes both.

## Known limitation: no login

The app has no user accounts. Anyone who has a student UUID can read and change that student's data. The UUID is random and stays in the browser's localStorage, so it works like a secret link, but it is not real access control. Do not store anything sensitive. Adding login is a later task.

## Before you start

- A GitHub (or GitLab) account and a Render account.
- A College Scorecard API key from https://api.data.gov/signup/.
- Node 24 locally (`package.json` pins `24.x`, and Render reads that field).

## 1. Create the repository

1. Commit the project, including `package-lock.json` (it is no longer ignored) and `render.yaml`. `.env` files are ignored and must stay out of git.
2. Create an empty repository on GitHub and push the project to it.

## 2. Create the database and the service

Option A, Blueprint (uses `render.yaml`):

1. In the Render dashboard choose New, then Blueprint, and select the repository.
2. Render shows the web service `spooky-college-planner` and the database `spooky-planner-db`. Enter a value for `COLLEGE_SCORECARD_API_KEY` when asked (it is `sync: false`, so it is never stored in the file).
3. Apply the Blueprint.

Option B, by hand:

1. New, then PostgreSQL. Name `spooky-planner-db`, database `spooky_planner`, user `spooky`, plan Free.
2. New, then Web Service, pick the repository. Runtime Node, build command `npm ci`, start command `npm start`, health check path `/api/health`, plan Free.
3. Set the environment variables below.

## 3. Environment variables

| Variable | Value | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | Turns on trust proxy, `upgrade-insecure-requests`, and exit-on-database-failure. |
| `DATABASE_URL` | Internal Database URL of `spooky-planner-db` | The Blueprint wires this from the database. |
| `DATABASE_SSL` | `false` | The internal URL needs no TLS. Use `true` with the External Database URL. |
| `COLLEGE_SCORECARD_API_KEY` | your key | Secret. Set in the dashboard. |
| `PORT` | (do not set) | Render provides it. The server listens on it and binds `0.0.0.0`. |
| `CORS_ORIGIN` | (leave unset) | The frontend is served by the same host. Set it only to allow another site to call the API. |
| `RATE_LIMIT_*` | (optional) | `RATE_LIMIT_MAX` (default 300), `RATE_LIMIT_LOOKUP_MAX` (60), `RATE_LIMIT_WINDOW_MS` (900000), `RATE_LIMIT_STUDENTS_MAX` (10), `RATE_LIMIT_STUDENTS_WINDOW_MS` (3600000). |

The full list is in `backend/config/.env.example`.

## 4. Create the tables (run init.js once)

The free web service has no shell, so run `backend/db/init.js` from your own machine against the database's External Database URL. In PowerShell, from the project root:

```powershell
$env:DATABASE_URL = "<External Database URL from the Render dashboard>"
$env:DATABASE_SSL = "true"
npm run db:init
Remove-Item Env:DATABASE_URL, Env:DATABASE_SSL
```

`npm run db:init` runs `node backend/db/init.js`. The script is safe to repeat: every statement uses `IF NOT EXISTS`. It creates `students`, `colleges` and `applications` with full state names (`VARCHAR(50)`) and the unique index on `applications.college_id`. On a paid plan you can run the same command from the service's Shell tab, with `DATABASE_SSL` left at `false`.

Keep the External Database URL out of chat, issues and commits. It contains the password.

## 5. Check the deploy

1. Wait for the deploy to show Live. If the service exits at start, open the logs: in production the server exits when it cannot reach the database.
2. Open `https://<your-service>.onrender.com/api/health`. Expect JSON with `"status": "Server is running"` and `"environment": "production"`.

## 6. Post-deploy smoke test

- [ ] `/` loads the graveyard with no errors in the browser console.
- [ ] `/deadlines.html` loads.
- [ ] `/api/nope` returns JSON `{"success":false,"error":"Route not found","code":"NOT_FOUND"}`, not a web page.
- [ ] Add a college by typing a name. The lookup fills in location and acceptance rate.
- [ ] Refresh the page. The tombstone is still there.
- [ ] Set a deadline on the college and reload the deadline page.
- [ ] Delete the test college.
- [ ] Response headers include `content-security-policy`, `x-content-type-options` and `strict-transport-security`.

## Notes

- The free database may expire (Render deletes free PostgreSQL instances after a fixed period unless you upgrade). Check the dashboard for the expiry date, and move to a paid plan or export the data before then.
- The free web service sleeps after a period without traffic. The first request after a sleep takes a while.
- Rate limits are counted in memory per instance, so they reset on every restart. That is enough for one instance.
- Content security policy: the pages load only their own scripts and styles. If you point `SPOOKY_API_BASE_URL` at another host, add that host to `connect-src` in `backend/middleware/security.js`.
