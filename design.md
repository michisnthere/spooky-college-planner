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
- Each lane: a detailed CSS zombie on the left, a sunflower with the college name at the right end, and a days-remaining label between them
- "Mark as completed" button per lane: plays a zombie death animation, replaces the zombie with a tombstone dated with the completion date, and sets the application status to submitted
- Days remaining at 0: the sunflower is replaced with a tombstone that reads "deadline has passed"

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
- **Animations**: CSS keyframes in animations.css: zombieWalk (looping walk), cardReveal (tombstone rises from the grass), zombieDefeat (zombie falls backward, with a dirt particle burst), and modalFadeIn. Animations use only transform and opacity. All animations are disabled under prefers-reduced-motion.

### 3.3 Tombstone Shape System

Each tombstone is a single element with a shape modifier class, for example `.tombstone--rounded`, `.tombstone--pointed`, `.tombstone--cross`, `.tombstone--slab`, and `.tombstone--arched`. Each shape is styled in CSS with layered gradients, borders, and shadows, plus carved-detail and weathering pseudo-elements.

**Future ranking categories (not implemented in the current release):**
- A `getTombstoneShape(college)` function returns the shape modifier for a college.
- Colleges in the top 10 category use one shape, colleges in the top 50 category use a different shape, and all other colleges use the default shape.
- The ranking source is not yet defined. The College Scorecard data does not provide a rank, so the source must be chosen before this feature is built.

### 3.4 Visual Polish Design

These additions implement requirements section 3.5. All of them are CSS and small vanilla JavaScript. No new runtime dependencies.

- **Fonts**: Fraunces (headers, large text) and Plus Jakarta Sans (body, small text). Defined as `--font-display` and `--font-body` in style.css. The fonts are self-hosted as woff2 files under `frontend/fonts/` and declared with `@font-face` and `font-display: swap`, so the existing content security policy (own scripts and styles only) needs no change. Fallbacks: `Georgia, serif` and `system-ui, sans-serif`.
- **Embossed text**: three shared variables built from layered `text-shadow`, with no white outline. `--text-emboss` (bright text on the dark sky) is a faint light edge above and a dark offset shadow below right. `--text-emboss-stone` (dark text on stone) is a light edge below and a dark edge above. `--text-emboss-parchment` (dialogs) presses the letters in. Applied to the page title, headings and tombstone names.
- **Parallax**: a fixed, full-viewport `.scenery` container behind the content with `pointer-events: none` and `aria-hidden="true"`. Layers, far to near: moon (existing moon element moved into the scenery), clouds, hills, trees and graveyard silhouette. Layers are inline or CSS-background SVG. A small module `frontend/js/ui/parallax.js` listens to scroll (passive listener, batched with `requestAnimationFrame`) and sets each layer's `translate3d` from its speed factor (for example 0.1, 0.2, 0.4, 0.6 of the scroll distance). The graveyard scrolls horizontally, so the module reads horizontal scroll of the graveyard container and vertical page scroll, whichever applies on the page. Under reduced motion the module does nothing.
- **Wobbly stones**: on `.tombstone:hover` and `:focus-visible`, a `stoneRumble` keyframe in animations.css rotates the card between about -1.5 and 1.5 degrees (never beyond 2) with a few small `translateY` jolts, 0.4s, played once per hover. On touch screens rontend/js/ui/wobble.js adds .tombstone--wobble on a tap (not a mouse click), which plays the same motion under the name stoneRumbleTap so it restarts on every tap. The rotation uses `transform-origin: bottom center` so the base stays on the ground. Transform only, so layout and neighbors do not move.
- **Gate dividers**: rontend/assets/gate-divider.svg is one repeating unit (thin vertical bars, spearhead tips, a scrollwork medallion) in #2E323E, with bars evenly spaced across the tile edge. A global hr rule in style.css uses it as a epeat-x background, so any <hr> added later is styled with no extra markup. The pages have no <hr> today, so none are placed.
- **Ground fog**: a `.fog` layer positioned at the bottom of each tombstone card, `pointer-events: none`, with a blurred radial or linear gradient (`filter: blur`, set once and not animated). A `fogDrift` keyframe moves it with `translateX` over 20 to 40 seconds, looping back and forth, with a low opacity so card text stays readable. A shared .scenery__fog strip also drifts behind the graveyard, in front of the hills and trees.
- **Constraints**: the existing rule that keyframes animate only transform and opacity still holds. The single 768px breakpoint still holds, and the scenery and fog scale by viewport units. All new animation is disabled in the `prefers-reduced-motion` block.

## 4. Backend Architecture

### 4.1 API Endpoints

**College Management**
- GET /api/colleges - Retrieve user's saved colleges
- POST /api/colleges - Add a new college
- DELETE /api/colleges/:collegeId - Remove a college
- PATCH /api/colleges/:collegeId - Update college details

**College Lookup (Scorecard Integration)**
- GET /api/lookup/college?name=<collegeName> - Search U.S. College Scorecard API

**Application Status**
- PATCH /api/colleges/:collegeId/status - Update application status (e.g., "Submitted")

**Deadline Tracking**
- GET /api/colleges/:collegeId/deadline - Get deadline info (remaining days, zombie position)
- PATCH /api/colleges/:collegeId/deadline - Update deadline date

### 4.2 Request/Response Format

All endpoints return JSON:

**Success Response**
`json
{
  "success": true,
  "data": { /* entity data */ },
  "message": "Operation completed"
}
`

**Error Response**
`json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
`

### 4.3 External API Integration

**U.S. College Scorecard API**
- Endpoint: https://api.data.gov/ed/collegescorecard/v1/schools.json
- Query parameters: school name, API key
- Response fields used: name, state, school.main_campus, latest.admissions.admission_rate

### 4.4 Business Logic

**Deadline Calculation**
`
zombieProgress = (daysElapsed / totalDays) * 100
zombiePosition = (zombieProgress / 100) * trackWidth
`

**Completion Animation Trigger**
- When application status = "Submitted", remove zombie and show completion state

## 5. Database Schema

### 5.1 Tables

**students**
`
id (UUID, primary key)
email (varchar, unique)
name (varchar)
created_at (timestamp)
`

**colleges**
`
id (UUID, primary key)
student_id (UUID, foreign key → students)
name (varchar)
state (varchar)
location (varchar)
acceptance_rate (float)
scorecard_id (varchar, for API reference)
created_at (timestamp)
`

**applications**
`
id (UUID, primary key)
student_id (UUID, foreign key → students)
college_id (UUID, foreign key → colleges)
status (enum: pending, submitted, accepted, rejected, waitlisted)
deadline_date (date)
days_remaining (int, calculated field)
submitted_at (timestamp, nullable)
created_at (timestamp)
updated_at (timestamp)
`

### 5.2 Key Indexes

- colleges.student_id - For fast retrieval of user's colleges
- pplications.student_id - For fast retrieval of user's applications
- pplications.college_id - For deadline queries

## 6. File Structure

`
spooky-college-planner/
├── frontend/
│   ├── index.html
│   ├── deadlines.html
│   ├── css/
│   │   ├── style.css (main styles)
│   │   └── animations.css (zombie, card animations)
│   └── js/
│       ├── app.js (main app controller)
│       ├── ui/
│       │   ├── graveyard.js (graveyard rendering)
│       │   ├── tombstone.js (tombstone card component)
│       │   ├── deadline-tracker.js (zombie tracker)
│       │   └── modal.js (detail view)
│       └── api/
│           └── client.js (API communication)
├── backend/
│   ├── server.js (Express setup, routes)
│   ├── routes/
│   │   ├── colleges.js
│   │   ├── applications.js
│   │   └── lookup.js (Scorecard API)
│   ├── controllers/
│   │   ├── collegeController.js
│   │   ├── applicationController.js
│   │   └── lookupController.js
│   ├── middleware/
│   │   ├── errorHandler.js
│   │   └── cors.js
│   ├── db/
│   │   ├── connection.js (PostgreSQL connection pool)
│   │   └── schema.sql (SQL migrations)
│   └── config/
│       └── .env (environment variables)
└── package.json
`

## 7. Development Workflow

### 7.1 Setup Steps

1. Initialize Node.js project with npm
2. Install dependencies: express, pg, cors, dotenv
3. Configure PostgreSQL database locally
4. Set up environment variables (.env)
5. Create database tables from schema.sql
6. Start Express server on port 3000 (or configurable)
7. Serve frontend from static files or dev server

### 7.2 Environment Variables

`
DATABASE_URL=postgresql://user:password@localhost:5432/spooky_planner
COLLEGE_SCORECARD_API_KEY=your_api_key_here
NODE_ENV=development
PORT=3000
`

## 8. Error Handling & Validation

### 8.1 Frontend Validation

- College name must not be empty
- Deadline date must be in the future
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
- **API caching**: Cache Scorecard API results to reduce external calls
- **Frontend rendering**: Lazy load detail views to keep initial load light
- **Scrolling performance**: Use CSS transforms for smooth horizontal scrolling

## 10. Security Considerations

- **Input validation**: Sanitize user inputs (college names, dates)
- **CORS**: Allow requests only from frontend origin
- **Environment secrets**: Keep API keys in .env, never commit
- **SQL injection prevention**: Use parameterized queries with pg library

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

## 12. Future Enhancements

- User authentication (login/signup)
- Multiple student profiles
- Notes per college
- Email deadline reminders
- Export application timeline
- Mobile app version
