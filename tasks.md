# Implementation Plan: Spooky College Planner

## Overview

Tasks run in order. Each task depends on the one before it, so the tracker runs one task at a time. Tasks 1 through 32 are complete. Work resumes at Task 33.

Each task lists its steps and verification checks as plain bullets. Only the top-level task line is a checkbox, so the tracker counts one item per task.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3"] },
    { "wave": 4, "tasks": ["4"] },
    { "wave": 5, "tasks": ["5"] },
    { "wave": 6, "tasks": ["6"] },
    { "wave": 7, "tasks": ["7"] },
    { "wave": 8, "tasks": ["8"] },
    { "wave": 9, "tasks": ["9"] },
    { "wave": 10, "tasks": ["10"] },
    { "wave": 11, "tasks": ["11"] },
    { "wave": 12, "tasks": ["12"] },
    { "wave": 13, "tasks": ["13"] },
    { "wave": 14, "tasks": ["14"] },
    { "wave": 15, "tasks": ["15"] },
    { "wave": 16, "tasks": ["16"] },
    { "wave": 17, "tasks": ["17"] },
    { "wave": 18, "tasks": ["18"] },
    { "wave": 19, "tasks": ["19"] },
    { "wave": 20, "tasks": ["20"] },
    { "wave": 21, "tasks": ["21"] },
    { "wave": 22, "tasks": ["22"] },
    { "wave": 23, "tasks": ["23"] },
    { "wave": 24, "tasks": ["24"] },
    { "wave": 25, "tasks": ["25"] },
    { "wave": 26, "tasks": ["26"] },
    { "wave": 27, "tasks": ["27"] },
    { "wave": 28, "tasks": ["28"] },
    { "wave": 29, "tasks": ["29"] },
    { "wave": 30, "tasks": ["30"] },
    { "wave": 31, "tasks": ["31"] },
    { "wave": 32, "tasks": ["32"] },
    { "wave": 33, "tasks": ["33"] },
    { "wave": 34, "tasks": ["34"] },
    { "wave": 35, "tasks": ["35"] },
    { "wave": 36, "tasks": ["36"] },
    { "wave": 37, "tasks": ["37", "38", "39", "40"] },
    { "wave": 38, "tasks": ["41"] },
    { "wave": 39, "tasks": ["42"] }
  ]
}
```

## Tasks

### Setup Phase

- [x] 1. Project Setup & Dependencies
  - Description: Initialize Node.js project and install required dependencies.
  - Steps:
    1. Create root directory structure (frontend/, backend/, package.json).
    2. Run npm init -y to create package.json.
    3. Install dependencies: npm install express pg cors dotenv.
    4. Create backend/server.js starter file with basic Express setup.
    5. Create .gitignore with node_modules/ and .env.
    6. Create backend/config/.env template file.
  - Verification:
    - node backend/server.js runs without errors.
    - Console logs "Server running on port 3000".
    - npm list shows express, pg, cors, dotenv installed.

- [x] 2. Database Connection Setup
  - Description: Configure PostgreSQL connection with pg-pool for connection pooling.
  - Steps:
    1. Create backend/db/connection.js with pg.Pool initialization.
    2. Read DATABASE_URL from .env.
    3. Export connection pool for use across app.
    4. Create test query function to verify connectivity.
    5. Update backend/server.js to initialize db connection on startup.
  - Verification:
    - .env contains a valid DATABASE_URL.
    - Running SELECT 1 through connection.js returns a row.
    - Console shows successful database connection.

- [x] 3. Database Schema Creation
  - Description: Create PostgreSQL tables for students, colleges, and applications.
  - Steps:
    1. Create backend/db/schema.sql with table definitions:
       - students (id, email, name, created_at)
       - colleges (id, student_id, name, state, location, acceptance_rate, scorecard_id, created_at)
       - applications (id, student_id, college_id, status, deadline_date, days_remaining, submitted_at, created_at, updated_at)
    2. Add indexes on student_id and college_id.
    3. Create backend/db/init.js script to run schema.sql.
    4. Run node backend/db/init.js to initialize tables.
  - Verification:
    - psql lists students, colleges, and applications tables.
    - \d colleges shows the columns and indexes.

### Backend API Phase

- [x] 4. Express Server Initialization
  - Description: Set up Express server with CORS, middleware, and basic routing structure.
  - Steps:
    1. Update backend/server.js with: load .env variables, enable CORS, JSON body parser, error handling middleware, database connection initialization.
    2. Create backend/routes/ directory.
    3. Create backend/controllers/ directory.
    4. Add basic route registration structure.
    5. Start server on configurable PORT from .env.
  - Verification:
    - Server starts on port 3000.
    - CORS preflight to /api/colleges returns an Access-Control-Allow-Origin header.

- [x] 5. College Endpoints (CRUD)
  - Description: Implement GET, POST, DELETE, and PATCH endpoints for college management.
  - Steps:
    1. Create backend/controllers/collegeController.js with getAllColleges(studentId), addCollege(studentId, collegeData), deleteCollege(collegeId), and updateCollege(collegeId, updates).
    2. Create backend/routes/colleges.js with GET /api/colleges?studentId=X, POST /api/colleges, DELETE /api/colleges/:collegeId, and PATCH /api/colleges/:collegeId.
    3. Add input validation (non-empty college name, valid state).
    4. Return standardized JSON response format.
  - Verification:
    - GET, POST, PATCH, and DELETE work against the database.

- [x] 6. Scorecard API Integration (Lookup)
  - Description: Integrate U.S. College Scorecard API for college auto-lookup.
  - Steps:
    1. Get a free API key from https://api.data.gov.
    2. Add COLLEGE_SCORECARD_API_KEY to .env.
    3. Create backend/controllers/lookupController.js.
    4. Implement searchCollege(collegeName).
    5. Create backend/routes/lookup.js.
  - Verification:
    - GET /api/lookup/college?name=Harvard returns name, state, and acceptance_rate.
    - A non-existent college returns a clear error.

- [x] 7. Application Status Endpoints
  - Description: Implement endpoints to track application status.
  - Steps:
    1. Create backend/controllers/applicationController.js.
    2. Create backend/routes/applications.js.
    3. Add a PATCH endpoint for status updates (pending, submitted, accepted, rejected, waitlisted).
    4. Add validation for valid status values.
  - Verification:
    - PATCH with status "submitted" updates the database.
    - submitted_at is set.

- [x] 8. Deadline Tracking Endpoints
  - Description: Implement endpoints to manage deadlines and calculate days remaining.
  - Steps:
    1. Create backend/controllers/deadlineController.js.
    2. Create backend/routes/deadlines.js.
    3. Add a GET endpoint that returns deadline info with days_remaining.
    4. Add a PATCH endpoint that updates the deadline date.
    5. Calculate zombieProgress as a percentage.
  - Verification:
    - GET /api/deadlines/<collegeId> returns days_remaining.
    - Response includes zombie_progress from 0 to 100.

- [x] 9. Error Handling & CORS Middleware
  - Description: Add error handling and CORS configuration. Allow only the origins listed in the CORS_ORIGIN environment variable. Return known errors with their own status code. Log each request with the morgan library.
  - Steps:
    1. Create backend/middleware/errorHandler.js. Known errors keep their status code. Unknown errors return 500 with a generic message, and the full detail is logged on the server.
    2. Create backend/middleware/cors.js. Read CORS_ORIGIN from .env as a comma-separated list. Reject origins not in the list.
    3. Apply the middleware globally in backend/server.js.
    4. Return all error responses in the format {success, error, code}.
    5. Add request logging with morgan.
  - Verification:
    - Trigger a known error, such as an invalid status, and confirm it returns its own status code with an error field.
    - Trigger an unknown error and confirm it returns 500 with an error field.
    - A request from an origin in CORS_ORIGIN gets an Access-Control-Allow-Origin header. A request from any other origin does not.
    - Each request appears in the server log with method, path, status, and duration.

### Frontend Setup Phase

- [x] 10. HTML Structure & Layout
  - Description: Create base HTML file with layout sections.
  - Steps:
    1. Create frontend/index.html.
    2. Add semantic HTML5 structure.
    3. Include header, graveyard container with Add College and Deadline Tracker tombstones, the add-college dialog, the detail dialog, and a separate deadlines.html page.
    4. Add script and link tags for CSS and JS.
  - Verification:
    - frontend/index.html opens in a browser with all sections visible and no console errors.
    - The page title shows "Spooky College Planner."

- [x] 11. Base CSS & Spooky Theme Styling
  - Description: Create main CSS with spooky aesthetic.
  - Steps:
    1. Create frontend/css/style.css.
    2. Define color variables: dark purple header with orange highlights, grass green graveyard ground, muted gray-green stone tones, and a white outline for text on dark backgrounds.
    3. Style body, header, grass graveyard, form, modal, detailed tombstones in rounded, pointed, cross, slab, and arched shapes, and a detailed moon with craters and a glow.
    4. Use flexbox for layout.
    5. Add a single responsive breakpoint at 768px.
  - Verification:
    - The page has a dark theme.
    - The graveyard scrolls horizontally.
    - The layout is responsive on a mobile view.

- [x] 12. CSS Animations (Zombie, Cards, Transitions)
  - Description: Create CSS keyframe animations for the zombie walk, tombstone reveal, zombie defeat with a dirt burst, and modal fade-in, disabled under reduced motion.
  - Steps:
    1. Create frontend/css/animations.css.
    2. Define zombieWalk (looping walk), cardReveal (tombstone rises from the grass), zombieDefeat (zombie falls backward, with dirt particles), and modalFadeIn.
    3. Use CSS transforms for performance.
    4. Set durations (zombie 0.5s, card 0.3s). Add a prefers-reduced-motion media query that disables all animations.
  - Verification:
    - Animations play smoothly with no stutter.

### Frontend Components Phase

- [x] 13. Graveyard Container & Tombstone Cards
  - Description: Implement JavaScript to render tombstone cards.
  - Steps:
    1. Create frontend/js/ui/tombstone.js with createTombstoneCard(collegeData).
    2. Create frontend/js/ui/graveyard.js with renderTombstones(), addTombstone(), and removeTombstone().
    3. Add event listeners for click and delete.
  - Verification:
    - Tombstone cards render, scroll horizontally, open the detail modal on click, and delete on the delete button.

- [x] 14. Detail View Modal Component
  - Description: Create modal popup for college details.
  - Steps:
    1. Create frontend/js/ui/modal.js with openDetailModal() and closeDetailModal().
    2. Display name, location, state, acceptance rate, and deadline info.
    3. Add application status buttons.
    4. Handle close events from the close button, backdrop click, and Escape key.
  - Verification:
    - The modal opens on tombstone click, shows the correct details, and closes by all three methods.

- [x] 15. Deadline Tracker Component
  - Description: Create a Plants vs. Zombies-style lane tracker on the separate deadlines.html page, with one lane per college, a detailed zombie, a sunflower end marker, a days-remaining label, and a Mark as completed button per lane.
  - Steps:
    1. Create frontend/js/ui/deadline-tracker.js.
    2. Implement initDeadlineTracker().
    3. Implement updateZombiePosition() with the position calculation.
    4. Display one lane per college with a detailed CSS zombie, a sunflower end marker showing the college name, and days remaining between them.
    5. Add smooth transitions. Add a Mark as completed button per lane that plays a zombie death animation, replaces the zombie with a tombstone dated with the completion date, and calls apiClient.updateApplicationStatus() with submitted. When days remaining reaches 0, replace the sunflower with a tombstone that reads "deadline has passed."
  - Verification:
    - Each college has its own lane. The zombie position matches days remaining. Mark as completed plays the death animation and leaves a dated tombstone. A deadline at 0 days shows "deadline has passed."

- [x] 16. Auto-Fill College Form
  - Description: Create the add-college form, shown inside the add-college dialog, with college search and auto-fill.
  - Steps:
    1. Create frontend/js/ui/form.js.
    2. Implement initForm(), setupSearchInput(), and handleSearch().
    3. Implement autoFillForm(), getFormData(), and resetForm().
    4. Add autocomplete with suggestions.
    5. Show a loading spinner and error messages.
  - Verification:
    - Typing a college name shows suggestions. Selecting one fills the form. A fake college shows an error. The deadline date picker works. The form resets after a successful submit.

### Frontend API Integration Phase

- [x] 17. API Client Setup (Fetch Wrapper)
  - Description: Create fetch wrapper for API communication.
  - Steps:
    1. Create frontend/js/api/client.js.
    2. Implement apiClient with GET, POST, PATCH, and DELETE methods.
    3. Add a 5-second timeout.
    4. Export wrapper functions for all endpoints.
    5. Handle errors gracefully.
  - Verification:
    - apiClient.get('/api/colleges?studentId=test') resolves with data. Errors are handled.

- [x] 18. College Lookup & Form Auto-Fill Logic
  - Description: Implement search-as-you-type college lookup.
  - Steps:
    1. Add a 300ms debounce to the college name input.
    2. Call apiClient.lookupCollege() on search.
    3. Display a suggestions dropdown.
    4. Auto-fill form fields on suggestion click.
    5. Show loading and error states.
  - Verification:
    - "Harvard" shows suggestions after 300ms. An invalid name shows "College not found."

- [x] 19. Add College to Graveyard Logic
  - Description: Connect form submission to graveyard.
  - Steps:
    1. On form submit, collect the data.
    2. Validate required fields.
    3. Call apiClient.addCollege().
    4. On success, add the tombstone, reset the form, and show a success message.
    5. On error, show the error and keep the data for retry.
  - Verification:
    - A submitted college appears as a tombstone with the card reveal animation, and the tombstone persists after page refresh.

- [x] 20. Update Deadline & Zombie Animation
  - Description: Connect deadline updates to zombie animation.
  - Steps:
    1. Create frontend/js/app.js (main controller).
    2. Initialize all components on page load.
    3. Load all colleges and deadlines.
    4. On deadline change in the modal, call updateDeadline().
    5. Fetch fresh deadline info and animate the zombie.
  - Verification:
    - A deadline change moves the zombie to the new position, and the position persists after refresh.

- [x] 21. Mark Application as Submitted
  - Description: Implement submission with completion animation.
  - Steps:
    1. Click the Submitted button in the modal.
    2. Call apiClient.updateApplicationStatus().
    3. Play the zombie defeat animation.
    4. Update the tombstone with a checkmark or styling.
    5. Update the modal to show submitted status.
  - Verification:
    - The defeat animation plays, the tombstone shows a checkmark, and the submitted status persists after refresh.

## Testing & Polish

- [x] 22. End-to-End Flow Testing
  - Description: Test complete workflow from start to finish.
  - Steps:
    1. Add 3 colleges with different deadlines.
    2. View details, update deadlines, and mark one as submitted.
    3. Refresh the page and verify persistence.
    4. Test a very soon deadline and a far future deadline.
    5. Check browser DevTools for network requests, console errors, and performance.
  - Verification:
    - All 3 colleges display correctly, zombie positions match deadlines, the submitted college shows the defeat animation, and no network or console errors appear.

- [x] 23. Error Handling & Edge Cases
  - Description: Test error scenarios and recovery.
  - Steps:
    1. Test a non-existent college and missing required fields.
    2. Test a deadline in the past and a duplicate college.
    3. Test network errors and API timeouts.
    4. Verify error messages are helpful.
    5. Verify form data is kept after a validation error.
  - Verification:
    - Each error shows an appropriate message, no unhandled exceptions occur, retry works, and form data is preserved.

- [x] 24. Performance & Cleanup
  - Description: Optimize performance and clean up code.
  - Steps:
    1. Use CSS transforms for animations.
    2. Debounce the search input.
    3. Lazy load modals.
    4. Remove console.log statements.
    5. Add JSDoc comments.
    6. Test on multiple browsers and mobile.
  - Verification:
    - Lighthouse score above 80, no layout shifts, responsive at 375px width, and works in Chrome, Firefox, and Safari.

## Follow-up Fixes

- [x] 25. Local Date Parsing
  - Description: Parse YYYY-MM-DD deadline strings as local midnight so a deadline of today is not rejected in time zones behind UTC.
  - Steps:
    1. Create backend/utils/dates.js with a local-date parser.
    2. Use it in deadlineController.updateDeadline and the days-remaining calculation.
    3. Check applicationController and other controllers for the same UTC parsing.
  - Verification:
    - tests/e2e-flow.test.js "a deadline of today gives 0 days" passes.

- [x] 26. Reject Past Dates
  - Description: Reject past deadlines everywhere. A deadline of today stays allowed.
  - Steps:
    1. Reject past or malformed dates in POST /api/applications and PATCH deadline with a 400 in the standard error envelope.
    2. Keep the add-college form and the detail modal rejecting past dates.
  - Verification:
    - Past dates return 400 from both endpoints. Today is accepted.

- [x] 27. Env Password Alignment & Log Redaction
  - Description: Use the root .env database password in every env file and stop logging the password.
  - Steps:
    1. Copy the password from the root .env into backend/config/.env without printing it.
    2. Keep a placeholder password in backend/config/.env.example.
    3. Change backend/db/connection.js and backend/db/testConnection.js to log only the host and database name.
  - Verification:
    - Both real env files connect. No log line contains the password.

- [x] 28. Missing Lookup Data Dialog
  - Description: When a looked-up college lacks attributes, show a dialog that lists every missing attribute with an input for each.
  - Steps:
    1. Fix lookupController so a missing acceptance rate returns null, not "NaN".
    2. Add a parchment dialog that lists all missing attributes (location, state, acceptance rate) with one input each.
    3. Validate the entries (rate 0 to 100, valid state, location length) and copy them into the add-college form on Continue.
    4. Add a Skip button. Show no dialog when nothing is missing.
  - Verification:
    - A college with no acceptance rate opens the dialog. The entered values appear in the form.

- [x] 29. Full State Names
  - Description: Store and show full state names instead of two-letter codes.
  - Steps:
    1. Create backend/utils/states.js mapping the 50 states, DC, and the territories to full names.
    2. Widen colleges.state to VARCHAR(50) in schema.sql and migrate the live database, converting existing rows.
    3. Accept a code or a full name in the backend, store the full name, and return 400 for anything else.
    4. Show full names in the form and detail modal.
  - Verification:
    - A college with state "Massachusetts" saves, and an existing two-letter row shows its full name.

- [x] 30. Zombie Movement With Transform
  - Description: Move the lane zombie with transform instead of left.
  - Steps:
    1. Add a rail wrapper in deadline-tracker.js and move it with translateX. Keep the position formula.
    2. Update the tests that read style.left.
    3. Keep the reduced-motion behavior.
  - Verification:
    - The zombie has no inline left. Its position matches the days remaining.

- [x] 31. Persistent College Delete
  - Description: Make a deleted college stay deleted after a refresh.
  - Steps:
    1. Call DELETE /api/colleges/:collegeId from the delete button and remove the card only after the server confirms.
    2. On failure keep the card and show an error.
    3. Delete the college's application in the same transaction and clear its deadline cache and lane.
  - Verification:
    - A deleted college does not return after a reload and has no lane on deadlines.html.

- [x] 32. Prevent Duplicate Applications
  - Description: Stop the API from creating a second application row for the same college.
  - Steps:
    1. Check the live database for existing duplicate applications per college. Report them, and keep the newest row for each college.
    2. Add a unique index on applications.college_id in schema.sql and in the live database.
    3. Return 409 with code DUPLICATE_APPLICATION from POST /api/applications when one already exists, in the standard error envelope.
    4. Make the frontend treat a 409 as "application exists" and update the existing one. This also covers the case where a database error is read as a 404.
    5. Convert the todo test in tests/error-handling-backend.test.js into a passing test.
  - Verification:
    - A second POST for the same college returns 409 and the table holds one row. The full test suite passes with the backend running and E2E_LIVE=1.

## Deployment (Render, single host)

- [x] 33. Serve Frontend From Express
  - Description: Serve the frontend from the backend so one Render web service hosts the whole app, and make the API base URL relative.
  - Steps:
    1. Serve frontend/ as static files from backend/server.js, after the /api routes are registered, with index.html at / and deadlines.html at /deadlines.html.
    2. Change DEFAULT_BASE_URL in frontend/js/api/client.js to a relative base (empty string) so requests go to /api on the same origin. Keep the SPOOKY_API_BASE_URL override.
    3. Keep unknown /api routes returning the JSON 404 envelope.
    4. Update CORS so same-origin requests work without CORS_ORIGIN, and CORS_ORIGIN still applies to listed origins.
    5. Update tests that assume the localhost:3000 default.
  - Verification:
    - With only the backend running on port 3000, opening http://localhost:3000/ loads the graveyard, adds a college, and survives a refresh. /deadlines.html loads. Unknown /api paths return JSON 404.

- [x] 34. Production Hardening
  - Description: Add basic security and reproducibility for a public deploy.
  - Steps:
    1. Add helmet with a content security policy that allows the app's own scripts and styles. Check the pages for CSP errors in headless Chrome.
    2. Add express-rate-limit: a general limit on /api, and tighter limits on /api/lookup and POST /api/students. Return the standard error envelope with code RATE_LIMITED.
    3. Set trust proxy for Render so rate limiting uses the client IP.
    4. Remove package-lock.json from .gitignore and make sure it is up to date. Add an engines field to package.json for a pinned Node version.
    5. In production (NODE_ENV=production), exit with a non-zero code if the database connection test fails at startup. In development keep the current log-and-continue behavior.
    6. Listen on process.env.PORT and bind 0.0.0.0.
  - Verification:
    - Security headers are present, no CSP errors in the browser, a burst of lookup requests returns 429 in the error envelope, and the full test suite passes.

- [x] 35. Render Deployment Config & Docs
  - Description: Add the files and steps needed to deploy to Render with a hosted PostgreSQL database.
  - Steps:
    1. Add render.yaml with a Node web service (build npm ci, start npm start, health check path /api/health) and a PostgreSQL database, with DATABASE_URL taken from the database and secrets (COLLEGE_SCORECARD_API_KEY) marked sync: false.
    2. Make backend/db/connection.js accept an SSL setting for hosted databases (for example DATABASE_SSL=true or ssl when NODE_ENV=production), without breaking local use.
    3. Verify backend/db/init.js plus schema.sql alone creates the current schema (full state names VARCHAR(50), unique index on applications.college_id) on an empty database. Use a temporary scratch database and drop it afterwards.
    4. Update backend/config/.env.example with every variable the app reads.
    5. Add DEPLOY.md with step-by-step Render instructions: create the repo, create the database and service, set environment variables, run init.js once, check /api/health, and a post-deploy smoke test checklist. Note that the free database may expire.
  - Verification:
    - init.js creates the full schema on an empty database. The server starts with NODE_ENV=production against a database with SSL settings configured. DEPLOY.md steps are complete and match render.yaml.

## UI Polish

Refer to requirements.md section 3.5 and design.md section 3.4. Every task keeps the single 768px breakpoint, animates only transform and opacity, and disables new motion under prefers-reduced-motion.

- [x] 36. Fonts & Embossed Typography
  - Description: Switch to Fraunces for headers and larger text and Plus Jakarta Sans for body and smaller text, and give display text an embossed look.
  - Steps:
    1. Add woff2 files for both fonts under frontend/fonts/ (self-hosted, so the content security policy stays unchanged) and declare them with @font-face and font-display: swap.
    2. Replace --font-display with Fraunces plus a serif fallback, add --font-body with Plus Jakarta Sans plus a sans-serif fallback, and set body text to --font-body.
    3. Add --text-emboss and --text-emboss-parchment (layered text-shadow, keeping the white outline on dark backgrounds) and apply them to the page title, headings, tombstone names and dialog titles.
    4. Update tests that assume the Georgia font stack.
  - Verification:
    - Headings render in Fraunces and paragraphs in Plus Jakarta Sans on both pages. Embossed text stays legible on the header, tombstones and dialogs. No CSP errors in the browser console.

- [x] 37. Parallax Night Scenery
  - Description: Add a multi-layer parallax background with a glowing moon, faint clouds, hills, and twisted trees with graveyard silhouettes.
  - Steps:
    1. Add a fixed .scenery container on both pages behind the content (pointer-events: none, aria-hidden) with layers for moon, clouds, hills and trees/graveyard, each drawn as SVG.
    2. Move the existing moon into the moon layer, keeping its craters and glow.
    3. Create frontend/js/ui/parallax.js that moves each layer by its own speed factor on scroll, using a passive listener and requestAnimationFrame. Do nothing under reduced motion.
    4. Check that the layers do not block clicks, hide tombstones, or lower text contrast.
  - Verification:
    - Scrolling moves distant layers slower than near layers. Tombstones, the form and dialogs stay clickable and legible. With reduced motion on, the layers stay still.

- [x] 38. Wobbly Stones
  - Description: Tilt a tombstone card 1 to 2 degrees with a subtle earth-rumble motion on hover.
  - Steps:
    1. Add a stoneRumble keyframe to animations.css (rotation within 2 degrees, small translateY jolts, about 0.4s, transform-origin at the bottom center).
    2. Play it on .tombstone:hover and :focus-visible, and on a touch tap through wobble.js, and make the card settle back afterwards.
    3. Make sure it does not conflict with the cardReveal and delete animations or move neighboring cards.
  - Verification:
    - Hovering a card tilts it by no more than 2 degrees and then settles. Clicking and deleting still work. Nothing animates under reduced motion.

- [x] 39. Victorian Gate Dividers
  - Description: Style every horizontal rule as a custom SVG border inspired by Victorian cemetery gates. The pages have no <hr> today, so this is saved for future <hr> elements and none are added.
  - Steps:
    1. Design the SVG (thin vertical bars, spearhead tips, delicate scrollwork) in #2E323E, as a unit that repeats sideways without a seam.
    2. Add a global hr rule that uses it as a repeat-x background with no default border.
  - Verification:
    - The SVG uses only #2E323E and tiles evenly. Any <hr> picks up the style with no extra markup.

- [x] 40. Drifting Ground Fog
  - Description: Add a blurred, semi-transparent gradient over the base of the tombstone cards that slowly drifts horizontally.
  - Steps:
    1. Add a fog layer at the bottom of each tombstone card (pointer-events: none) with a blurred gradient at low opacity, plus one shared fog strip in the scenery behind the graveyard.
    2. Add a fogDrift keyframe (translateX only, 20 to 40 seconds, looping) to animations.css.
    3. Confirm card text and buttons stay readable and clickable, and that many cards do not slow scrolling. Use one shared fog strip if they do.
  - Verification:
    - Stones look like they rise from mist, the fog drifts slowly, and clicks pass through it. The fog is static under reduced motion.

- [x] 41. UI Polish Tests & Review
  - Description: Cover the new visuals with automated checks and a visual pass.
  - Steps:
    1. Add at least 5 tests: fonts declared and applied, embossed class present, scenery layers exist with aria-hidden and pointer-events none, rumble keyframe stays within 2 degrees, dividers use #2E323E, and reduced motion disables the new animations.
    2. Confirm the existing test that keyframes animate only transform and opacity still passes.
    3. Check both pages in headless Chrome at 375px and desktop width for console errors and CSP errors.
  - Verification:
    - The full test suite passes and the pages show no console errors.
- [x] 42. Delete From the Detail View & Plain Text
  - Description: Move Delete from the tombstone cards into the detail dialog, and remove the white outline around text.
  - Steps:
    1. Remove the Delete button from tombstone cards. Add a red "Delete college" button below the application status box in the detail dialog.
    2. Keep the confirmation. After a successful delete, close the dialog and remove the tombstone and its deadline lane. On failure, keep the dialog open and show the error inside it.
    3. Remove the white text outline. Bright text gets a soft dark shadow, dark text on stone gets a light letterpress edge, and the deadline page heading becomes bright.
    4. Update the tests that clicked the card's Delete button.
  - Verification:
    - Cards have no Delete button. Delete from the dialog removes the college on the server and the page, survives a refresh, and a failed delete leaves the college in place with an error in the dialog.
## Notes

- Estimated timeline: 15 to 21 hours of development.
- Execute tasks in order to keep the app working at each step.
