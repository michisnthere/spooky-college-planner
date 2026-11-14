# Spooky College Planner - Implementation Tasks

## Task Dependency Graph

`
SETUP PHASE
├── Task 1: Project Setup & Dependencies
├── Task 2: Database Connection Setup
└── Task 3: Database Schema Creation
    
BACKEND API PHASE
├── Task 4: Express Server Initialization
├── Task 5: College Endpoints (GET, POST, DELETE, PATCH)
├── Task 6: Scorecard API Integration (Lookup)
├── Task 7: Application Status Endpoints
├── Task 8: Deadline Tracking Endpoints
└── Task 9: Error Handling & CORS Middleware

FRONTEND SETUP PHASE
├── Task 10: HTML Structure & Layout
├── Task 11: Base CSS & Spooky Theme Styling
└── Task 12: CSS Animations (Zombie, Cards, Transitions)

FRONTEND COMPONENTS PHASE
├── Task 13: Graveyard Container & Tombstone Cards
├── Task 14: Detail View Modal Component
├── Task 15: Deadline Tracker Component
└── Task 16: Auto-Fill College Form

FRONTEND API INTEGRATION PHASE
├── Task 17: API Client Setup (Fetch Wrapper)
├── Task 18: College Lookup & Form Auto-Fill Logic
├── Task 19: Add College to Graveyard Logic
├── Task 20: Update Deadline & Zombie Animation
└── Task 21: Mark Application as Submitted

TESTING & POLISH
├── Task 22: End-to-End Flow Testing
├── Task 23: Error Handling & Edge Cases
└── Task 24: Performance & Cleanup
`

---

## SETUP PHASE

### Task 1: Project Setup & Dependencies
**Description**: Initialize Node.js project and install required dependencies.

**Steps**:
1. Create root directory structure (frontend/, backend/, package.json)
2. Run 
pm init -y to create package.json
3. Install dependencies:
   
pm install express pg cors dotenv
4. Create backend/server.js starter file with basic Express setup
5. Create .gitignore with node_modules/, .env
6. Create backend/config/.env template file

**Verification**:
- [ ] 
ode backend/server.js runs without errors
- [ ] Console logs "Server running on port 3000"
- [ ] 
pm list shows express, pg, cors, dotenv installed

**Status**: Not Started

---

### Task 2: Database Connection Setup
**Description**: Configure PostgreSQL connection with pg-pool for connection pooling.

**Steps**:
1. Create backend/db/connection.js with pg.Pool initialization
2. Read DATABASE_URL from .env
3. Export connection pool for use across app
4. Create test query function to verify connectivity
5. Update backend/server.js to initialize db connection on startup

**Verification**:
- [ ] Create .env with valid DATABASE_URL
- [ ] Run test: 
ode -e "require('./backend/db/connection').query('SELECT 1')" | grep rows
- [ ] Console shows successful database connection

**Status**: Not Started

---

### Task 3: Database Schema Creation
**Description**: Create PostgreSQL tables for students, colleges, and applications.

**Steps**:
1. Create backend/db/schema.sql with table definitions:
   - students (id, email, name, created_at)
   - colleges (id, student_id, name, state, location, acceptance_rate, scorecard_id, created_at)
   - applications (id, student_id, college_id, status, deadline_date, days_remaining, submitted_at, created_at, updated_at)
2. Add indexes on student_id and college_id
3. Create backend/db/init.js script to run schema.sql
4. Run 
ode backend/db/init.js to initialize tables

**Verification**:
- [ ] Connect to PostgreSQL with psql
- [ ] Run \dt or SELECT table_name FROM information_schema.tables WHERE table_schema='public'
- [ ] Output shows students, colleges, applications tables
- [ ] Run \d colleges to verify columns and indexes

**Status**: Not Started

---

## BACKEND API PHASE

### Task 4: Express Server Initialization
**Description**: Set up Express server with CORS, middleware, and basic routing structure.

**Steps**:
1. Update backend/server.js with:
   - Load .env variables
   - Enable CORS
   - JSON body parser middleware
   - Error handling middleware
   - Initialize database connection
2. Create backend/routes/ directory
3. Create backend/controllers/ directory
4. Add basic route registration structure
5. Start server on configurable PORT from .env

**Verification**:
- [ ] Run 
ode backend/server.js
- [ ] Server starts on port 3000
- [ ] Test CORS: curl -H "Origin: http://localhost:5500" -H "Access-Control-Request-Method: GET" http://localhost:3000/api/colleges
- [ ] Response includes Access-Control-Allow-Origin header

**Status**: Not Started

---

### Task 5: College Endpoints (CRUD)
**Description**: Implement GET, POST, DELETE, and PATCH endpoints for college management.

**Steps**:
1. Create backend/controllers/collegeController.js with functions:
   - getAllColleges(student_id) - Query colleges for a student
   - addCollege(student_id, college_data) - Insert new college
   - deleteCollege(college_id) - Remove college
   - updateCollege(college_id, updates) - Modify college details
2. Create backend/routes/colleges.js with Express routes:
   - GET /api/colleges?studentId=X
   - POST /api/colleges
   - DELETE /api/colleges/:collegeId
   - PATCH /api/colleges/:collegeId
3. Add input validation (non-empty college name, valid state)
4. Return standardized JSON response format

**Verification**:
- [ ] Test GET: curl http://localhost:3000/api/colleges?studentId=test-user
- [ ] Test POST: curl -X POST -H "Content-Type: application/json" -d '{"studentId":"test","name":"MIT","state":"MA","acceptanceRate":3.2}' http://localhost:3000/api/colleges
- [ ] Verify college appears in database
- [ ] Test DELETE and PATCH operations

**Status**: Not Started

---

### Task 6: Scorecard API Integration (Lookup)
**Description**: Integrate U.S. College Scorecard API for college auto-lookup.

**Steps**:
1. Get free API key from https://api.data.gov
2. Add COLLEGE_SCORECARD_API_KEY to .env
3. Create backend/controllers/lookupController.js
4. Implement searchCollege(collegeName) function
5. Create backend/routes/lookup.js

**Verification**:
- [ ] Test: curl "http://localhost:3000/api/lookup/college?name=Harvard"
- [ ] Response includes name, state, acceptance_rate
- [ ] Test error handling for non-existent colleges

**Status**: Not Started

---

### Task 7: Application Status Endpoints
**Description**: Implement endpoints to track application status.

**Steps**:
1. Create backend/controllers/applicationController.js
2. Create backend/routes/applications.js
3. PATCH endpoint for status updates (pending, submitted, accepted, rejected, waitlisted)
4. Add validation for valid status values

**Verification**:
- [ ] Test: curl -X PATCH -H "Content-Type: application/json" -d '{"status":"submitted"}' http://localhost:3000/api/applications/<collegeId>/status
- [ ] Check database for status update
- [ ] Verify submitted_at timestamp is set

**Status**: Not Started

---

### Task 8: Deadline Tracking Endpoints
**Description**: Implement endpoints to manage deadlines and calculate days remaining.

**Steps**:
1. Create backend/controllers/deadlineController.js
2. Create backend/routes/deadlines.js
3. GET endpoint to fetch deadline info with days_remaining calculation
4. PATCH endpoint to update deadline date
5. Calculate zombieProgress percentage

**Verification**:
- [ ] Test: curl http://localhost:3000/api/deadlines/<collegeId>
- [ ] Response shows correct days_remaining
- [ ] Response includes zombie_progress (0-100)
- [ ] Verify calculations are accurate

**Status**: Not Started

---

### Task 9: Error Handling & CORS Middleware
**Description**: Add comprehensive error handling and CORS configuration.

**Steps**:
1. Create backend/middleware/errorHandler.js
2. Create backend/middleware/cors.js
3. Apply middleware globally in server.js
4. Standardized error responses
5. Add request logging

**Verification**:
- [ ] Intentionally cause an error
- [ ] Verify response includes error field (not 500)
- [ ] Test CORS headers are correct
- [ ] Check server logs for request details

**Status**: Not Started

---

## FRONTEND SETUP PHASE

### Task 10: HTML Structure & Layout
**Description**: Create base HTML file with layout sections.

**Steps**:
1. Create frontend/index.html
2. Add semantic HTML5 structure
3. Include: header, graveyard container, deadline tracker, form, modal
4. Add script and link tags for CSS and JS

**Verification**:
- [ ] Open frontend/index.html in browser
- [ ] All sections visible
- [ ] No console errors
- [ ] Title shows "Spooky College Planner" in tab

**Status**: Not Started

---

### Task 11: Base CSS & Spooky Theme Styling
**Description**: Create main CSS with spooky aesthetic.

**Steps**:
1. Create frontend/css/style.css
2. Define color variables (dark purple, orange, black, graveyard green)
3. Style: body, header, graveyard, form, modal
4. Use flexbox for layout
5. Add responsive breakpoints

**Verification**:
- [ ] Page has dark spooky theme
- [ ] Horizontal scroll works on graveyard
- [ ] Layout is responsive (test on mobile view)
- [ ] No layout shifts when resizing

**Status**: Not Started

---

### Task 12: CSS Animations (Zombie, Cards, Transitions)
**Description**: Create CSS keyframe animations.

**Steps**:
1. Create frontend/css/animations.css
2. Define: zombieWalk, cardReveal, zombieDefeat, modalFadeIn animations
3. Use CSS transforms for performance
4. Set appropriate durations (zombie: 0.5s, card: 0.3s)

**Verification**:
- [ ] Animations play smoothly
- [ ] Zombie animation uses GPU acceleration
- [ ] No janky/stuttering motion
- [ ] Chrome DevTools shows good performance

**Status**: Not Started

---

## FRONTEND COMPONENTS PHASE

### Task 13: Graveyard Container & Tombstone Cards
**Description**: Implement JavaScript to render tombstone cards.

**Steps**:
1. Create frontend/js/ui/tombstone.js
2. Implement createTombstoneCard(collegeData)
3. Create frontend/js/ui/graveyard.js
4. Implement: renderTombstones(), addTombstone(), removeTombstone()
5. Add event listeners for click and delete

**Verification**:
- [ ] Manually add test data
- [ ] Tombstone cards render correctly
- [ ] Cards are horizontally scrollable
- [ ] Click card opens detail modal
- [ ] Delete button removes tombstone

**Status**: Not Started

---

### Task 14: Detail View Modal Component
**Description**: Create modal popup for college details.

**Steps**:
1. Create frontend/js/ui/modal.js
2. Implement openDetailModal() and closeDetailModal()
3. Display: name, location, state, acceptance rate, deadline info
4. Add application status buttons
5. Handle close events (close button, backdrop, Escape key)

**Verification**:
- [ ] Modal opens when clicking tombstone
- [ ] All college details display correctly
- [ ] Modal closes on close button, backdrop click, Escape key
- [ ] Status buttons are visible and clickable

**Status**: Not Started

---

### Task 15: Deadline Tracker Component
**Description**: Create horizontal deadline tracker with zombie icon.

**Steps**:
1. Create frontend/js/ui/deadline-tracker.js
2. Implement initDeadlineTracker()
3. Implement updateZombiePosition() with calculation
4. Display: zombie icon, target line, days remaining
5. Add smooth transitions

**Verification**:
- [ ] Zombie icon moves smoothly
- [ ] Position matches days remaining
- [ ] Days remaining label updates
- [ ] Animation is smooth (no jumps)

**Status**: Not Started

---

### Task 16: Auto-Fill College Form
**Description**: Create form with college search and auto-fill.

**Steps**:
1. Create frontend/js/ui/form.js
2. Implement: initForm(), setupSearchInput(), handleSearch()
3. Implement: autoFillForm(), getFormData(), resetForm()
4. Add autocomplete with suggestions
5. Show loading spinner and error messages

**Verification**:
- [ ] Type college name → suggestions appear
- [ ] Click suggestion → form auto-fills
- [ ] Manual entry of fake college → error message
- [ ] Deadline date picker works
- [ ] Form resets after successful submit

**Status**: Not Started

---

## FRONTEND API INTEGRATION PHASE

### Task 17: API Client Setup (Fetch Wrapper)
**Description**: Create fetch wrapper for API communication.

**Steps**:
1. Create frontend/js/api/client.js
2. Implement: apiClient with GET, POST, PATCH, DELETE methods
3. Add timeout (5 seconds)
4. Export wrapper functions for all endpoints
5. Handle errors gracefully

**Verification**:
- [ ] Test: piClient.get('/api/colleges?studentId=test')
- [ ] Promise resolves with data
- [ ] Test error handling
- [ ] Network tab shows correct requests

**Status**: Not Started

---

### Task 18: College Lookup & Form Auto-Fill Logic
**Description**: Implement search-as-you-type college lookup.

**Steps**:
1. Add debounce to college name input (300ms)
2. Call apiClient.lookupCollege() on search
3. Display suggestions dropdown
4. Auto-fill form fields on suggestion click
5. Show loading and error states

**Verification**:
- [ ] Type "Harvard" → suggestions appear after 300ms
- [ ] Click suggestion → form auto-fills
- [ ] Type invalid name → "College not found" message
- [ ] Network requests show correct data

**Status**: Not Started

---

### Task 19: Add College to Graveyard Logic
**Description**: Connect form submission to graveyard.

**Steps**:
1. On form submit, collect data
2. Validate required fields
3. Call apiClient.addCollege()
4. On success: add tombstone, reset form, show success message
5. On error: show error, keep data for retry

**Verification**:
- [ ] Fill form and submit
- [ ] New tombstone appears
- [ ] Card reveal animation plays
- [ ] Form resets
- [ ] Refresh page → tombstone persists

**Status**: Not Started

---

### Task 20: Update Deadline & Zombie Animation
**Description**: Connect deadline updates to zombie animation.

**Steps**:
1. Create frontend/js/app.js (main controller)
2. Initialize all components on page load
3. Load all colleges and deadlines
4. On deadline change in modal, call updateDeadline()
5. Fetch fresh deadline info and animate zombie

**Verification**:
- [ ] Change deadline in modal
- [ ] Zombie animates to new position
- [ ] Position matches days remaining
- [ ] Refresh page → zombie stays at updated position

**Status**: Not Started

---

### Task 21: Mark Application as Submitted
**Description**: Implement submission with completion animation.

**Steps**:
1. Click "Submitted" button in modal
2. Call apiClient.updateApplicationStatus()
3. Play zombie defeat animation
4. Update tombstone with checkmark/styling
5. Update modal to show submitted status

**Verification**:
- [ ] Click "Submitted" button
- [ ] Zombie defeat animation plays
- [ ] Tombstone shows checkmark
- [ ] Database shows submitted status and timestamp
- [ ] Refresh page → submitted status persists

**Status**: Not Started

---

## TESTING & POLISH

### Task 22: End-to-End Flow Testing
**Description**: Test complete workflow from start to finish.

**Steps**:
1. Test full flow: add 3 colleges with different deadlines
2. View details, update deadlines, mark as submitted
3. Refresh page and verify persistence
4. Test edge cases: very soon deadline, far future deadline
5. Check browser DevTools: network requests, console, performance

**Verification**:
- [ ] All 3 colleges display correctly
- [ ] Zombie positions match deadline proximity
- [ ] Submitted college shows defeat animation
- [ ] Refresh page → all data persists
- [ ] No network errors or console errors
- [ ] All animations smooth (60fps)

**Status**: Not Started

---

### Task 23: Error Handling & Edge Cases
**Description**: Test error scenarios and recovery.

**Steps**:
1. Test: non-existent college, missing required fields
2. Test: deadline in past, duplicate college
3. Test: network errors, API timeout
4. Verify error messages are helpful
5. Verify form data preserved after validation error

**Verification**:
- [ ] Each error scenario shows appropriate message
- [ ] No unhandled exceptions
- [ ] Retry works after error
- [ ] Form data preserved
- [ ] Console shows error details for debugging

**Status**: Not Started

---

### Task 24: Performance & Cleanup
**Description**: Optimize performance and clean up code.

**Steps**:
1. Use CSS transforms for animations
2. Debounce search input
3. Lazy load modals
4. Remove console.log statements
5. Add JSDoc comments
6. Test on multiple browsers and mobile

**Verification**:
- [ ] Chrome DevTools Lighthouse score > 80
- [ ] No layout shifts or jank
- [ ] Works on slow 3G network (simulated)
- [ ] Responsive on mobile (375px width)
- [ ] Works on Chrome, Firefox, Safari

**Status**: Not Started

---

## Summary

**Total Tasks**: 24
**Estimated Timeline**: ~15-21 hours total development

Execute tasks sequentially to maintain working functionality at each step.
