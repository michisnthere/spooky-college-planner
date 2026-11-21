# Spooky College Planner - Technical Design

## 1. System Overview

Spooky College Planner is a web application that helps students organize and track their college application process through a visual "graveyard" metaphor. The system combines a creative UI with practical application management features, including an auto-fill college lookup, deadline tracking with zombie animations, and a visual college comparison interface.

## 2. Architecture

### 2.1 High-Level Architecture

The system is built using a client-server architecture with separation of concerns:

**Frontend (HTML/CSS/Vanilla JavaScript)**
- Graveyard visualization and tombstone cards
- Deadline page (separate page, opened from the Deadline Tracker tombstone) with zombie progression
- Add College dialog containing the auto-fill form
- Detail view modal

**Backend (Node.js + Express)**
- RESTful API for data management
- College Scorecard API integration
- Database query layer

**Database (PostgreSQL)**
- Persistent storage for students, colleges, and application data

### 2.2 Data Flow

1. **College Lookup**: User enters college name → Frontend queries backend → Backend queries College Scorecard API → Returns college data → Frontend auto-fills form
2. **Add College**: User submits form → Backend validates and stores → Frontend updates graveyard display
3. **Update Deadline**: User enters/edits deadline → Backend calculates remaining days → Frontend animates zombie position
4. **Mark Submitted**: User clicks submit button → Backend updates status → Frontend triggers completion animation
5. **Delete College**: User opens the detail view and clicks Delete college → Frontend asks for confirmation → `DELETE /api/colleges/:id` → On success the detail view closes, the tombstone and the deadline lane are removed. On failure the detail view stays open and shows the error.

## 3. Frontend Architecture

### 3.1 Pages & Components

**Main Dashboard**
- Graveyard container (horizontally scrollable)
- Tombstone cards (one per college)
- "Add College" tombstone that opens the add-college dialog
- "Deadline Tracker" tombstone that opens deadlines.html

**Tombstone Card Component**
- College name (RIP text)
- College icon or grave marker
- Click to expand detail view
- No delete button on the card (delete lives in the detail view)

**Detail View Modal**
- College location
- State
- Acceptance rate
- Deadline countdown
- Application status buttons
- Red "Delete college" button below the status box. It asks for confirmation, then deletes. On success the modal closes and the tombstone is removed. On failure the modal stays open and shows the error in its message line. The button is disabled while the request runs.

**Deadline Tracker Component**
- Horizontal timeline
- Zombie icon that moves based on deadline proximity
- Target completion line
- Days remaining label
- Plants vs. Zombies-style lawn lanes on the deadlines.html page, with one lane per tracked college
- Each lane: a wooden sign with the college name at the bottom-left, the zombie (which starts just right of the sign), a plain sunflower at the right end, and a days-remaining label between the zombie and the sunflower
- "Mark as completed" button per lane: plays a zombie death animation, replaces the zombie with a tombstone dated with the completion date, and sets the application status to submitted
- Days remaining at 0: the sunflower is replaced with a tombstone that reads "deadline has passed"

**Missing-Info Dialog**
- Opens after a lookup when location, state or acceptance rate is missing
- One input per missing detail, with validation. The user can fill them in or skip.

**Auto-Fill Form**
- Search input with autocomplete
- Location, state, acceptance rate fields (auto-populated)
- Deadline date picker
- Submit button

### 3.2 Styling Approach

- **Theme**: Night graveyard. The header uses dark purple with orange highlights. The graveyard ground is grass, with muted gray-green tombstones on it. The night sky sits above the graveyard. The moon is a detailed CSS element with craters and a glow. Dialogs use a parchment surface.
- **Text legibility**: No white outline around letters. Bright text on a dark background uses a soft dark shadow (--text-shadow-bright). Dark text on a stone uses a light letterpress edge (--text-emboss-stone). The deadline page heading is bright.
- **Layout**: Flexbox for responsive design, with a single breakpoint at 768px
- **Scrolling**: Horizontal scroll for graveyard and deadline tracker
- **Animations**: CSS keyframes in animations.css: zombieWalk (looping walk), cardReveal (tombstone rises from the grass), zombieDefeat (zombie falls backward, with a dirt particle burst), modalFadeIn, stoneRumble (and stoneRumbleTap, the same motion for taps) and fogDrift. Animations use only transform and opacity. All animations are disabled under prefers-reduced-motion.

### 3.3 Tombstone Shape System

Each tombstone is a single element with a shape modifier class, for example `.tombstone--rounded`, `.tombstone--pointed`, `.tombstone--cross`, `.tombstone--slab`, and `.tombstone--arched`. Each shape is styled in CSS with layered gradients, borders, and shadows, plus carved-detail and weathering pseudo-elements.

**Future ranking categories (not implemented in the current release):**
- A `getTombstoneShape(college)` function returns the shape modifier for a college.
- Colleges in the top 10 category use one shape, colleges in the top 50 category use a different shape, and all other colleges use the default shape.
- The ranking source is not yet defined. The College Scorecard data does not provide a rank, so the source must be chosen before this feature is built.

### 3.4 Visual Polish Design (shipped, then restyled)

These features implement requirements section 3.5. Their structure (scenery layers, parallax module, wobble, fog layers, gate rule) is still current. Their look was replaced by the pixel-art redesign in section 3.6: the fonts, the blur, the soft shadows and the smooth SVG art described below are no longer used. They are CSS, small SVG files and small vanilla JavaScript modules. There are no new runtime dependencies.

- **Fonts**: Fraunces for headers and large text, Plus Jakarta Sans for body and small text. `--font-display` is `"Fraunces", Georgia, "Times New Roman", serif` and `--font-body` is `"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Both are variable woff2 files in `frontend/fonts/`, declared with `@font-face` and `font-display: swap`. They are served from the same origin, so the content security policy (`font-src 'self'`) needs no change. `body` uses `--font-body`. `h1` to `h4` and `.tombstone` use `--font-display`.
- **Text without an outline**: there is no white outline. `--text-shadow-bright` (a soft dark shadow, `0 1px 2px` at 0.75 opacity) is used on bright text over the dark sky: the header, tagline, back link, deadline lane labels and messages.
- **Embossed text**: three variables built from layered `text-shadow`.
  - `--text-emboss`: bright text on the dark sky. A faint light edge above and a dark offset shadow below right. Used on the page title and the deadline page heading.
  - `--text-emboss-stone`: dark text on a stone. A light edge below and a dark edge above. Used on tombstone names.
  - `--text-emboss-parchment`: dialog titles. Light edge above, dark edge below, so the letters look pressed in.
- **Parallax**: a fixed `.scenery` container is the first child of `<body>` on both pages. It has `z-index: 0`, `pointer-events: none` and `aria-hidden="true"`. `.main-content` has `z-index: 1`, so the page paints above it.
  - Layers, far to near, with `data-parallax-speed`: moon 0.03 (CSS disc and craters, built from two pseudo-elements), clouds 0.08, hills 0.15, trees and graveyard silhouettes 0.3. The clouds, hills and trees are SVG files in `frontend/assets/`.
  - The tiled layers are one tile (1200, 1600 and 1400 px) wider than the screen. `parallax.js` moves them by `scroll * speed` and wraps the result with a modulo of the tile width, so the artwork never runs out. The moon has no tile and stops at 80 px of sideways travel. Vertical travel stops at 120 px, which is why the layers extend `--scenery-overscan` (8rem) below the screen.
  - `frontend/js/ui/parallax.js` adds the window scroll and `#graveyard.scrollLeft`. Scroll events do not bubble, so one capturing listener on the document hears both. Updates are batched with `requestAnimationFrame` and write `translate3d` only. With reduced motion on, the module leaves the layers at rest.
  - On the index page, `.main-content--graveyard` pushes the graveyard to the bottom of the screen, so the hills and trees stand directly behind it.
- **Wobbly stones**: on `.tombstone:hover` and `:focus-visible`, the `stoneRumble` keyframe plays for 0.45s. It rotates the stone between -1.5 and 1.5 degrees (never beyond 2) with small `translateY` jolts, pivoting on `transform-origin: 50% 100%` so the base stays on the ground. The keyframe reads `--stone-lift`, which hover sets to `-6px`, so the stone stays raised while it rumbles. On touch screens `frontend/js/ui/wobble.js` adds `.tombstone--wobble` when a touch or pen click lands on a stone. That class plays the identical motion under the name `stoneRumbleTap`, so it restarts on every tap. The class is removed on `animationend`, with a 700 ms fallback timer kept per stone. Mouse clicks are ignored because hover covers them.
- **Gate dividers**: `frontend/assets/gate-divider.svg` is one repeating unit (thin vertical bars, spearhead tips, a scrollwork medallion) drawn only in `#2E323E`. The bars are 24 units apart, including across the tile edge, so the tiles join without a seam. A global `hr` rule in style.css uses the file as a `repeat-x` background with no border, and adds a faint light edge so it shows on the dark sky. The pages have no `<hr>` today, so no dividers are placed. Any `<hr>` added later is styled with no extra markup.
- **Ground fog**: each stone has a `.tombstone__fog` span with `aria-hidden="true"`, created by `createFog()` in `tombstone.js` for college stones and written into `index.html` for the Add College and Deadline Tracker stones. It is wider than the stone (`left` and `right` of -25%), spills below the base, ignores the pointer, and is a blurred set of radial gradients (`filter: blur(7px)`, set once and never animated). The `fogDrift` keyframe moves it with `translateX` between -8% and 8% and fades the opacity between 0.75 and 1, over 24 seconds, alternating. Neighboring cards use negative `animation-delay` values so they drift out of step. A shared `.scenery__fog` strip behind the graveyard uses the same keyframe over 45 seconds.
- **Constraints**: keyframes still animate only `transform` and `opacity`. The single 768px breakpoint still holds. Every new animated selector is listed in the `prefers-reduced-motion` block at the end of animations.css, which an automated test enforces.

### 3.5 Delete From the Detail View

Delete lives in the detail dialog, not on the tombstone card.

- `index.html` has `#detail-delete-button` ("Delete college", class `btn btn--delete`) inside `.detail-danger`, after the status box and the message line. It is red (`#b81d1d` gradient, white text).
- `modal.js` takes an `onDelete(college)` callback in `initDetailModal`. The button is disabled when no callback exists, and `aria-label` is set to `Delete <college name>` each time the dialog opens. A click disables the button, awaits the callback, and closes the dialog only when the callback resolves `true`. A result of `false` (cancelled or failed) keeps the dialog open. A thrown error shows `Could not delete: <reason>` in `#detail-status-message`. The button is enabled again afterwards. A late answer is ignored if another college has been opened by then.
- `graveyard.js` exports `requestDeleteCollege(college)`. It asks `confirm()`, ignores a second request for the same college while one runs, calls the `onDelete` callback from `initGraveyard`, and removes the card only after that succeeds. It returns `true` when the college was deleted.
- `app.js` wires both together. `deleteCollegeOnServer` calls `DELETE /api/colleges/:id` (a 404 counts as already deleted), clears the cached deadline, and removes the lane from the deadline tracker. If a delete fails while the dialog is open, `showDeleteError` writes the message inside the dialog. Otherwise it goes above the graveyard.
- The "zombie falls on the card" animation sits at `bottom: 0.5rem` of the card, since there is no button under the stone.

### 3.6 Pixel-Art Visual Identity (implemented)

This implements requirements section 3.6, and replaces the blurred and soft details of section 3.4 above. Where 3.4 and this section differ, this section is current: the fonts, the moon, the mist, the stones, the shadows and the gate are now pixel art. Behaviour, data and API are unchanged.

**Decisions**
- Pixel art replaces every blur, glow and soft gradient.
- Fonts: Silkscreen (title, buttons, small labels), Pixelify Sans (headings, tombstone names, dialog titles), Plus Jakarta Sans (body, forms, details). Fraunces is removed.
- Orange (header, highlights, submit button) and red (Delete button) stay for now, to be reviewed after the owner has seen the look.
- The Plants vs. Zombies lawn stays, drawn in pixel art.

**Pixel grid and art**
- One art pixel is 4 CSS px (`--px`). Every sprite is an SVG file in `frontend/assets/`, drawn on an integer grid by `scripts/make-pixel-assets.js` (`npm run assets`) with `shape-rendering="crispEdges"`, and shown with `image-rendering: pixelated`. The tool uses fixed palettes and a seeded random generator, so a rerun writes identical files. A test regenerates the files into a temporary folder and compares them byte for byte.
- Files: `moon`, `clouds`, `hills`, `trees` (twisted trees, crosses, headstones, iron fence, ornamental gate, bushes, plants), `ground` (grass, flowers and a cobblestone path), `mist` and `mist-strip`, the stones (`stone-rounded` and its `-add`, `-deadline` and `-submitted` edge colours, `stone-slab`, `stone-pointed`, `stone-cross`, `stone-arched`, `stone-mini`), `stone-wear` (cracks, chips, moss), `gate-divider`, `lawn`, `zombie`, `sunflower`.
- Hard edges everywhere: no `blur()`, no radial or conic gradients, no `border-radius`, and every shadow has a blur of 0. The sky and the header are flat colour bands (hard-stop linear gradients). Tests enforce all of this.

**Palette** (CSS variables in `:root`): navy, charcoal, indigo and purple for the night; royal blue, electric blue, cyan, teal and lavender for the environment; pixel yellow and magenta for accents. Text and controls reach 4.5:1 contrast. A test computes the WCAG ratio for 22 text and background pairs, including the three stone shading bands.

**Components**
- **Tombstones**: the stone sprite is the `::before` of `.tombstone`, drawn as a nine-slice `border-image` (76 px corners, 64 px base), so the outline and corners keep their size while the stone grows with the name. `::after` lays the wear sprite over it. Each shape modifier has its own sprite. The Add College (orange), Deadline Tracker (purple) and submitted (green) stones swap only the edge colour. A hard `drop-shadow` with no blur grounds the stone.
- **Mist**: dithered pixels at two opacities (a 4 x 4 Bayer pattern), thickest at the bottom. The card mist and the shared strip are tiles that slide sideways in 4 px steps.
- **Interface**: dialogs are dark indigo dialogue boxes with a pale 4 px border, a royal-blue inner frame and an 8 px hard drop shadow. Buttons use Silkscreen and have five distinct states: default (raised, with a hard shadow), hover (electric blue), focus (a yellow 4 px frame), active (pressed down 4 px) and disabled (flat and dim). The pressed status button is pixel yellow. Fields are dark with a lavender-blue border and a yellow focus frame. The ink colours live in `:root`, so the form, the list and the details share one scheme.
- **Lawn**: lanes use a checkered lawn tile. The zombie is now a single element whose background is the zombie sprite (`buildZombie` no longer creates body-part spans). The sunflower is a sprite with no text. The college name is on a wooden sign (`lane-sign.svg`, a nine-slice board, and `lane-sign-post.svg`) at the bottom-left of the lane. The sign is 8.5rem wide, and the walking path starts 9.5rem from the left, so the zombie never covers it. `laneSignLayout(name)` in deadline-tracker.js picks the font size and line count from the length of the name: it tries one, two, then three balanced lines, takes the first that allows at least 0.75rem, and otherwise the largest size possible, never below 0.6rem and never above 1.1rem, rounded down to 0.05rem. The estimate uses 0.62em per character against 6rem of text width, a little generous, so the text never spills out. The sign shows at most four lines, with an ellipsis for anything longer, and its title holds the full name. The days label sits on a dark chip so it stays readable on the bright lawn.

**Motion**
- Every animation and transition uses `steps()` timing, and keyframe moves are multiples of 4 px, so motion reads as frames. The rumble holds each pose (`steps(1, end)`) and still tilts at most 1.5 degrees. The reveal rises in five steps. The zombie walks in four frames and moves along its rail in 16 steps. The card mist moves 4 px per step over 24 seconds, the background strip 4 px per step over 45 seconds.
- `parallax.js` rounds every layer offset to a whole art pixel (`PIXEL = 4`), so the scenery never shimmers.
- Everything stays in the reduced-motion block.

## 4. Backend Architecture

### 4.1 API Endpoints

All routes are under `/api`. Any unknown `/api` path returns the JSON 404 envelope, never an HTML page.

**Health**
- GET /api/health - Server status and environment. Not rate limited, so the hosting health check never fails on limits.

**Students**
- POST /api/students - Create an anonymous student. The browser stores the returned ID in localStorage. Has its own tight rate limit.

**College Management**
- GET /api/colleges?studentId=<id> - Retrieve the student's saved colleges
- POST /api/colleges - Add a new college. Returns 409 when the student already has that college.
- PATCH /api/colleges/:collegeId - Update college details
- DELETE /api/colleges/:collegeId - Remove a college and its application

**College Lookup (Scorecard Integration)**
- GET /api/lookup/college?name=<collegeName> - Search the U.S. College Scorecard API. Has its own rate limit.

**Applications and Status**
- POST /api/applications - Create the application for a college (deadline and status). Returns 409 for a second application on one college.
- GET /api/applications/:collegeId - Read the application
- PATCH /api/applications/:collegeId/status - Update application status (for example "submitted")

**Deadline Tracking**
- GET /api/deadlines/:collegeId - Get deadline info (remaining days, zombie position)
- PATCH /api/deadlines/:collegeId - Update the deadline date

### 4.2 Request/Response Format

All endpoints return JSON:

**Success Response**
```json
{
  "success": true,
  "data": { /* entity data */ },
  "message": "Operation completed"
}
```

**Error Response**
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### 4.3 External API Integration

**U.S. College Scorecard API**
- Endpoint: https://api.data.gov/ed/collegescorecard/v1/schools.json
- Query parameters: school name, API key
- Response fields used: name, state, school.main_campus, latest.admissions.admission_rate

### 4.4 Business Logic

**Deadline Calculation**
```
zombieProgress = (daysElapsed / totalDays) * 100
zombiePosition = (zombieProgress / 100) * trackWidth
```

**Completion Animation Trigger**
- When application status = "Submitted", remove zombie and show completion state

## 5. Database Schema

### 5.1 Tables

**students**
```
id (UUID, primary key, default gen_random_uuid())
email (varchar 255, unique, not null)   -- a unique placeholder, there is no sign-in yet
name (varchar 255, not null)
created_at (timestamp)
```

**colleges**
```
id (UUID, primary key)
student_id (varchar 255)                 -- holds students.id, no foreign key constraint
name (varchar 255, not null)
state (varchar 50)                       -- full name, such as "Massachusetts"
location (varchar 255)
acceptance_rate (decimal 5,2)            -- a percent, such as 3.45
scorecard_id (varchar 50, for API reference)
created_at (timestamp)
```

**applications**
```
id (UUID, primary key)
student_id (varchar 255)
college_id (UUID, not null, foreign key → colleges, ON DELETE CASCADE)
status (varchar 50: pending, submitted, accepted, rejected, waitlisted; default pending)
deadline_date (date)
days_remaining (int)
submitted_at (timestamp, nullable)
created_at (timestamp)
updated_at (timestamp)
```

### 5.2 Key Indexes

- colleges.student_id - For fast retrieval of a student's colleges
- applications.student_id - For fast retrieval of a student's applications
- applications.college_id - For deadline queries
- applications.college_id (unique) - One application per college
- applications.deadline_date - For deadline ordering

`backend/db/init.js` runs `schema.sql` and is safe to repeat. `migrate-full-state-names.js` and `migrate-unique-application.js` bring older databases up to date.

## 6. File Structure

```
spooky-college-planner/
├── frontend/
│   ├── index.html
│   ├── deadlines.html
│   ├── css/
│   │   ├── style.css (fonts, theme, layout, scenery, stones, dialogs)
│   │   └── animations.css (zombie, reveal, rumble, fog, reduced motion)
│   ├── fonts/ (self-hosted woff2: Fraunces, Plus Jakarta Sans)
│   ├── assets/ (SVG: clouds, hills, trees, gate divider)
│   └── js/
│       ├── app.js (main app controller)
│       ├── api/
│       │   ├── client.js (API communication)
│       │   └── student.js (anonymous student ID)
│       └── ui/
│           ├── graveyard.js (graveyard rendering, delete request)
│           ├── tombstone.js (tombstone card and fog)
│           ├── deadline-tracker.js (zombie lanes)
│           ├── modal.js (detail view, delete button)
│           ├── form.js (add-college form)
│           ├── missing-info.js (dialog for details the lookup could not find)
│           ├── states.js (state names)
│           ├── parallax.js (scenery layers)
│           └── wobble.js (tap rumble on touch screens)
├── backend/
│   ├── server.js (Express setup, routes, static frontend)
│   ├── routes/ (colleges, applications, deadlines, lookup, students)
│   ├── controllers/ (one per route file)
│   ├── middleware/
│   │   ├── errorHandler.js
│   │   ├── cors.js
│   │   └── security.js (helmet, rate limits)
│   ├── db/
│   │   ├── connection.js (PostgreSQL pool, DATABASE_SSL)
│   │   ├── init.js, schema.sql, migrate-*.js
│   │   └── testConnection.js
│   ├── utils/ (dates.js, states.js)
│   └── config/ (.env.example)
├── tests/ (node --test, jsdom, a live backend for the API tests)
├── render.yaml (Render blueprint)
├── DEPLOY.md (Render steps)
└── package.json
```

## 7. Development Workflow

### 7.1 Setup Steps

1. Install Node 24 and run `npm ci`. Dependencies: express, pg, cors, dotenv, axios, helmet, express-rate-limit, morgan. Dev: jsdom.
2. Configure PostgreSQL locally.
3. Copy `backend/config/.env.example` to `.env` in the project root and fill it in.
4. Create the tables with `npm run db:init`.
5. Start the server with `npm start` (port 3000, or `PORT`). Express also serves the frontend, so open http://localhost:3000/.
6. Run the tests with `npm test`.

### 7.2 Environment Variables

```
DATABASE_URL=postgresql://user:password@localhost:5432/spooky_planner
DATABASE_SSL=false                  # true for a hosted database's external URL
COLLEGE_SCORECARD_API_KEY=your_api_key_here
NODE_ENV=development                # production turns on trust proxy and exit-on-database-failure
PORT=3000                           # the host sets this in production
CORS_ORIGIN=                        # optional, extra allowed origins, comma separated
RATE_LIMIT_MAX / RATE_LIMIT_LOOKUP_MAX / RATE_LIMIT_WINDOW_MS
RATE_LIMIT_STUDENTS_MAX / RATE_LIMIT_STUDENTS_WINDOW_MS
```

### 7.3 Deployment (Render, single host)

One Render web service runs Express, which serves both the API and the frontend, with a Render PostgreSQL database. `render.yaml` describes both, with `DATABASE_URL` taken from the database and `COLLEGE_SCORECARD_API_KEY` entered in the dashboard. The API client uses relative URLs, so no CORS setup is needed. The health check is `/api/health`. In production the server exits if the database connection fails at startup. `DEPLOY.md` has the steps, including running `npm run db:init` once.

## 8. Error Handling & Validation

### 8.1 Frontend Validation

- College name must not be empty
- Deadline date must be today or later (a date in the past is rejected before any request)
- API calls include timeout handling (5s)

### 8.2 Backend Validation

- Duplicate college check per student
- Valid date formats
- API rate limiting consideration for Scorecard API

### 8.3 Error Recovery

- If Scorecard API fails, show user message and allow manual entry
- Network errors display retry button
- Database errors logged server-side

## 9. Performance Considerations

- **Database queries**: Use indexes on student_id and college_id
- **API caching**: Cache Scorecard API results to reduce external calls (not implemented yet. The lookup rate limit protects the external API for now.)
- **Frontend rendering**: Lazy load detail views to keep initial load light
- **Scrolling performance**: Use CSS transforms for smooth horizontal scrolling

## 10. Security Considerations

- **Input validation**: Sanitize user inputs (college names, dates, states). College names are written to the page with `textContent`, never `innerHTML`.
- **CORS**: The frontend is served by the same host, so same-origin requests work without configuration. `CORS_ORIGIN` lists any extra allowed origins.
- **Security headers**: helmet with a content security policy that allows only the app's own scripts, styles, fonts and images (`'self'`, plus `data:` images and inline styles set at runtime). `upgrade-insecure-requests` is on in production.
- **Rate limiting**: express-rate-limit, counted in memory per client IP. A general limit on `/api`, a tighter one on `/api/lookup`, and the tightest on `POST /api/students`. Over the limit returns 429 with the code `RATE_LIMITED`. `trust proxy` is set to one hop in production, so the limits see the real client IP.
- **Environment secrets**: Keep API keys and the database URL in `.env` or the host's settings, never in git. Logs show only the database host and name.
- **SQL injection prevention**: Use parameterized queries with the pg library.
- **Known limitation, no login**: anyone with a student UUID can read and change that student's data. The UUID is random and stays in the browser's localStorage, so it works like a secret link, but it is not access control. User authentication is listed under future enhancements.

## 11. Testing Strategy

### 11.1 Unit Tests
- API endpoint logic (request validation, response format)
- Database query functions
- Deadline calculation logic

### 11.2 Integration Tests
- Scorecard API integration
- Full workflow: college lookup → add → track deadline → submit

### 11.3 E2E Tests (Manual/Automation)
- Graveyard display renders correctly
- Zombie animation tracks deadline properly
- Detail view modal opens and closes
- Deleting a college from the detail view removes it, and it stays gone after a refresh
- Automated: `npm test` runs the whole suite (jsdom for the frontend, a live backend and database for the API)

## 12. Future Enhancements

- User authentication (login/signup)
- Multiple student profiles
- Notes per college
- Email deadline reminders
- Export application timeline
- Mobile app version
