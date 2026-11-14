# Implementation Plan: Spooky College Planner

## Overview

Tasks run in order. Each task depends on the one before it, so the tracker runs one task at a time. Tasks 1 through 8 are complete. Work resumes at Task 9.

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
    { "wave": 24, "tasks": ["24"] }
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

- [ ] 10. HTML Structure & Layout
  - Description: Create base HTML file with layout sections.
  - Steps:
    1. Create frontend/index.html.
    2. Add semantic HTML5 structure.
    3. Include header, graveyard container, deadline tracker, form, and modal.
    4. Add script and link tags for CSS and JS.
  - Verification:
    - frontend/index.html opens in a browser with all sections visible and no console errors.
    - The page title shows "Spooky College Planner."

- [ ] 11. Base CSS & Spooky Theme Styling
  - Description: Create main CSS with spooky aesthetic.
  - Steps:
    1. Create frontend/css/style.css.
    2. Define color variables (dark purple, orange, black, graveyard green).
    3. Style body, header, graveyard, form, and modal.
    4. Use flexbox for layout.
    5. Add responsive breakpoints.
  - Verification:
    - The page has a dark theme.
    - The graveyard scrolls horizontally.
    - The layout is responsive on a mobile view.

- [ ] 12. CSS Animations (Zombie, Cards, Transitions)
  - Description: Create CSS keyframe animations.
  - Steps:
    1. Create frontend/css/animations.css.
    2. Define zombieWalk, cardReveal, zombieDefeat, and modalFadeIn animations.
    3. Use CSS transforms for performance.
    4. Set durations (zombie 0.5s, card 0.3s).
  - Verification:
    - Animations play smoothly with no stutter.

### Frontend Components Phase

- [ ] 13. Graveyard Container & Tombstone Cards
  - Description: Implement JavaScript to render tombstone cards.
  - Steps:
    1. Create frontend/js/ui/tombstone.js with createTombstoneCard(collegeData).
    2. Create frontend/js/ui/graveyard.js with renderTombstones(), addTombstone(), and removeTombstone().
    3. Add event listeners for click and delete.
  - Verification:
    - Tombstone cards render, scroll horizontally, open the detail modal on click, and delete on the delete button.

- [ ] 14. Detail View Modal Component
  - Description: Create modal popup for college details.
  - Steps:
    1. Create frontend/js/ui/modal.js with openDetailModal() and closeDetailModal().
    2. Display name, location, state, acceptance rate, and deadline info.
    3. Add application status buttons.
    4. Handle close events from the close button, backdrop click, and Escape key.
  - Verification:
    - The modal opens on tombstone click, shows the correct details, and closes by all three methods.

- [ ] 15. Deadline Tracker Component
  - Description: Create horizontal deadline tracker with zombie icon.
  - Steps:
    1. Create frontend/js/ui/deadline-tracker.js.
    2. Implement initDeadlineTracker().
    3. Implement updateZombiePosition() with the position calculation.
    4. Display zombie icon, target line, and days remaining.
    5. Add smooth transitions.
  - Verification:
    - The zombie moves smoothly and its position matches days remaining.

- [ ] 16. Auto-Fill College Form
  - Description: Create form with college search and auto-fill.
  - Steps:
    1. Create frontend/js/ui/form.js.
    2. Implement initForm(), setupSearchInput(), and handleSearch().
    3. Implement autoFillForm(), getFormData(), and resetForm().
    4. Add autocomplete with suggestions.
    5. Show a loading spinner and error messages.
  - Verification:
    - Typing a college name shows suggestions. Selecting one fills the form. A fake college shows an error. The deadline date picker works. The form resets after a successful submit.

### Frontend API Integration Phase

- [ ] 17. API Client Setup (Fetch Wrapper)
  - Description: Create fetch wrapper for API communication.
  - Steps:
    1. Create frontend/js/api/client.js.
    2. Implement apiClient with GET, POST, PATCH, and DELETE methods.
    3. Add a 5-second timeout.
    4. Export wrapper functions for all endpoints.
    5. Handle errors gracefully.
  - Verification:
    - apiClient.get('/api/colleges?studentId=test') resolves with data. Errors are handled.

- [ ] 18. College Lookup & Form Auto-Fill Logic
  - Description: Implement search-as-you-type college lookup.
  - Steps:
    1. Add a 300ms debounce to the college name input.
    2. Call apiClient.lookupCollege() on search.
    3. Display a suggestions dropdown.
    4. Auto-fill form fields on suggestion click.
    5. Show loading and error states.
  - Verification:
    - "Harvard" shows suggestions after 300ms. An invalid name shows "College not found."

- [ ] 19. Add College to Graveyard Logic
  - Description: Connect form submission to graveyard.
  - Steps:
    1. On form submit, collect the data.
    2. Validate required fields.
    3. Call apiClient.addCollege().
    4. On success, add the tombstone, reset the form, and show a success message.
    5. On error, show the error and keep the data for retry.
  - Verification:
    - A submitted college appears as a tombstone with the card reveal animation, and the tombstone persists after page refresh.

- [ ] 20. Update Deadline & Zombie Animation
  - Description: Connect deadline updates to zombie animation.
  - Steps:
    1. Create frontend/js/app.js (main controller).
    2. Initialize all components on page load.
    3. Load all colleges and deadlines.
    4. On deadline change in the modal, call updateDeadline().
    5. Fetch fresh deadline info and animate the zombie.
  - Verification:
    - A deadline change moves the zombie to the new position, and the position persists after refresh.

- [ ] 21. Mark Application as Submitted
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

- [ ] 22. End-to-End Flow Testing
  - Description: Test complete workflow from start to finish.
  - Steps:
    1. Add 3 colleges with different deadlines.
    2. View details, update deadlines, and mark one as submitted.
    3. Refresh the page and verify persistence.
    4. Test a very soon deadline and a far future deadline.
    5. Check browser DevTools for network requests, console errors, and performance.
  - Verification:
    - All 3 colleges display correctly, zombie positions match deadlines, the submitted college shows the defeat animation, and no network or console errors appear.

- [ ] 23. Error Handling & Edge Cases
  - Description: Test error scenarios and recovery.
  - Steps:
    1. Test a non-existent college and missing required fields.
    2. Test a deadline in the past and a duplicate college.
    3. Test network errors and API timeouts.
    4. Verify error messages are helpful.
    5. Verify form data is kept after a validation error.
  - Verification:
    - Each error shows an appropriate message, no unhandled exceptions occur, retry works, and form data is preserved.

- [ ] 24. Performance & Cleanup
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

## Notes

- Estimated timeline: 15 to 21 hours of development.
- Execute tasks in order to keep the app working at each step.
