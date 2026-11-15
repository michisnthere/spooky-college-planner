# Defaults Review

Decisions made without asking the user, for review. Each entry lists the task, the question I would have asked, the default I used, and the reason.

## Task 12: CSS Animations (Zombie, Cards, Transitions)

### 1. How much should the zombie walk bob?
- **Default:** Keep the committed `zombieWalk` keyframes: about 3px vertical bob and 2px sway, one 0.5s loop, `linear infinite`.
- **Why:** The spec sets the zombie duration at 0.5s. Small movement avoids a jittery look and needs only transform.

### 2. What should the dirt burst look like?
- **Default:** Two clusters of three brown dots on `.dirt-burst::before` and `::after`. They launch left and right, rise about 18-22px, fade out over 0.6s, and start 0.05s apart.
- **Why:** Pseudo-elements add no markup. Only transform and opacity are animated, as the design requires.

### 3. Which way should the zombie fall?
- **Default:** Backward, which is to the left. The zombie rotates -90deg around its bottom center over 0.8s and ends at opacity 0.
- **Why:** The spec says the zombie "falls backward." Zombies walk rightward toward the sunflower, so backward means left.

### 4. How should the dialog fade in?
- **Default:** Opacity from 0 to 1 with a 12px upward slide over 0.25s.
- **Why:** The spec asks for a modal fade-in. A short slide helps the eye follow the dialog and stays inside transform and opacity.

### 5. Under reduced motion, should the defeated zombie appear already fallen?
- **Default:** No change in this task. `zombie--defeated` gets `animation: none`, so the zombie shows in its standing pose.
- **Why:** The end state of a defeat belongs to Task 15 (tombstone replacement) and Task 21 (submitted state). Changing it here would go beyond Task 12's steps. This is a known gap: a user with reduced motion sees a standing zombie after a submission until those tasks are done. Flagged for review.

### 6. Should `animations.css` be rewritten?
- **Default:** No. The file was already committed in `dfbd419` with all four keyframes, the 0.5s and 0.3s durations, and a final reduced-motion block. I checked it against the spec and kept it.
- **Why:** It meets every step. Rewriting it would make changes the user did not request.

## Task 13: Graveyard Container & Tombstone Cards

### 1. Should Delete call the server, or only remove the card?
- **Default:** Remove the card from the page only. The server call is not wired yet.
- **Why:** `apiClient` (task 17) does not exist yet, so there is nothing to call. A deleted college comes back after a page refresh until tasks 17 and 19 add the API delete. The `onDelete` callback in `graveyard.js` is ready for that wiring. It is not connected in `app.js`.

### 2. How should the delete confirmation look?
- **Default:** Use the browser's `window.confirm` with the message "Delete <name> from your graveyard? This cannot be undone."
- **Why:** The spec does not define a delete confirmation. A native prompt needs no extra markup, and it is the simplest option that stops accidental deletes.

### 3. Should the tombstone shape vary by college?
- **Default:** Every college card uses `.tombstone--rounded`. The ranking-based shapes stay out of scope.
- **Why:** The task and design.md section 3.3 say to keep the shape modifier system and skip ranking-based shapes. The ranking data source is undefined.

### 4. Should the graveyard show sample colleges until data loading exists?
- **Default:** No. `initApp()` renders only the colleges passed to it, which is an empty list today.
- **Why:** Sample data would look like real saved colleges. Task 19 supplies the real list from the API.

### 5. Should `index.html` load `app.js` as an ES module?
- **Default:** Yes. The script tag now has `type="module"`.
- **Why:** `tombstone.js`, `graveyard.js`, and `modal.js` use `import`/`export`, and a classic script cannot load them. Browsers block module loads from `file://`, so the page must be served over HTTP. The backend does not serve `frontend/` yet.

### 6. Where should the delete button sit relative to the stone?
- **Default:** A sibling button under the stone, inside a wrapper `.college-tombstone`.
- **Why:** A button nested inside another button is invalid HTML. The delete click does not bubble into the stone's select handler, and a test checks that.

## Task 14: Detail View Modal Component

### 1. How should the detail dialog look? (parchment surface, layout, spacing)
- **Default:** Use the existing `#college-detail-dialog` styles in `style.css`. The dialog is a parchment surface with a `dl` for the facts, a close button in the header, and a fieldset for status buttons. No new styling was added.
- **Why:** The user asked for no questions and pointed to the existing dialog in `index.html`. The styles already exist and match the theme in requirements 3.4.

### 2. Should status buttons save to the server now?
- **Default:** No. The highlight moves on click, with no network call. The optional `onStatusChange` callback stays in place for task 21 and task 17.
- **Why:** The user said the API comes in later tasks. A status click with no callback now updates the UI only. A callback that fails keeps the old highlight and shows the error, so the later wiring is safe.

### 3. What status button labels should appear?
- **Default:** Pending, Submitted, Accepted, Rejected, Waitlisted. The `data-status` values are the lowercase API values: pending, submitted, accepted, rejected, waitlisted.
- **Why:** The labels read naturally for users. The lowercase values match `applications.status` in design.md 5.1.

### 4. How should backdrop click work?
- **Default:** A click whose target is the dialog element and falls outside its bounding box closes the dialog. Clicks inside the box, including its padding, do not close it.
- **Why:** A native `<dialog>` has no built-in backdrop-click close. The bounding-box check is the simplest way to tell the backdrop from the content.

### 5. How should Escape work?
- **Default:** Rely on the browser's native `<dialog>` Escape behavior. The `close` event resets the current college and the message.
- **Why:** Native handling covers Escape, focus return, and screen reader roles with no extra code. jsdom does not send Escape, so the test dispatches `cancel` and then `close`. A real browser check is still needed.

### 6. What text should show for missing data?
- **Default:** "Not available" for location, state, and acceptance rate. "No deadline set" for a missing or invalid deadline, in both the deadline and days fields.
- **Why:** Blank fields look like a bug. The two phrases separate missing facts from missing dates.

### 7. How should days remaining read?
- **Default:** Whole calendar days from today. Today shows "0 days". One day shows "1 day". A past date shows "Deadline passed".
- **Why:** Calendar days match how students count deadlines. Local dates avoid time-zone shifts for DATE values.

### 8. Should the deadline field in the modal be editable now?
- **Default:** Show the current date in the `#detail-deadline-input` field, but keep it disabled. Editing is wired in task 20.
- **Why:** tasks.md assigns updateDeadline() to task 20. A working input without a save path would mislead the user.

### 9. How should the acceptance rate be shown?
- **Default:** Show the stored number with a percent sign, such as "3.59%", with no conversion. Zero shows "0%". Non-numeric values show "Not available".
- **Why:** The design stores the rate as a percent (design.md 5.1, lookup field). Converting it would risk a double-scaling error.

### 10. Should a missing name in the modal show a placeholder?
- **Default:** No placeholder in the modal. The name is shown as given. The tombstone already uses "Unnamed college" when the name is missing (task 13).
- **Why:** The tombstone fallback covers the common case. A modal-only placeholder would hide a data problem that should be fixed at entry.

### Fixes made during Task 14 (not questions, recorded for review)
- `handleStatusClick` returned early with no `onStatusChange`. `app.js` calls `initDetailModal()` with no callbacks, so the status buttons did nothing in the running app. Clicks now move the highlight with no callback.
- `parseDeadline` now accepts `Date` objects. The `pg` driver returns DATE columns as `Date` values. Without this, a real deadline would show as "No deadline set".

## Task 15: Deadline Tracker Component

### 1. apiClient does not exist yet (task 17). How should Mark as completed save the status?
- **Default:** `initDeadlineTracker()` takes an injectable `updateApplicationStatus(collegeId, status)` option. The default is a no-op, so nothing is sent to the server until task 17 supplies the real call.
- **Why:** The run rules say not to build the full API client here. The injected function keeps the call site in place for task 17, and the tests pass a spy to check the call.

### 2. Where do the colleges and deadlines on deadlines.html come from?
- **Default:** `deadlines.html` calls `initDeadlineTracker({ colleges: [] })`, so the page shows "No colleges to track yet." until the data loading in tasks 17 and 20 is wired in.
- **Why:** No API client or app-level loader exists yet. Sample colleges would look like real saved data.

### 3. Should the defeat animation play before or after the status is saved?
- **Default:** Save first, then play the defeat. The zombie stays until the save resolves. If the save fails, the zombie stays and an error appears under the lane, and the button can be retried.
- **Why:** The spec lists the animation, the tombstone, and the API call in one step without an order. Playing the defeat before the save could show a lane as completed when the server never recorded it.

### 4. How far does the zombie walk? What total number of days should the lane use?
- **Default:** 120 days, the same cycle `backend/controllers/deadlineController.js` uses for `zombieProgress`. Percent = (120 - daysRemaining) / 120 * 100, clamped to 0 to 100.
- **Why:** The lane then matches the backend's zombie progress. The design gives no lane length, and the backend already fixes 120 days. The value is an option (`totalDays`) if the team picks another window.

### 5. What does a lane with no deadline look like?
- **Default:** The zombie stays at the start of the lane. The days label reads "No deadline set". The sunflower still shows as the end marker. Mark as completed stays available.
- **Why:** The spec defines no position without a deadline. Starting at the left keeps the zombie visible, and the label explains why it has not moved.

### 6. What text should the lane show at 0 and negative days?
- **Default:** At 0 days the label reads "0 days remaining", and the sunflower is replaced by a tombstone with the exact text "deadline has passed" (lowercase, as the spec writes it). Negative days show the label "Deadline passed" and the same tombstone. The zombie sits at the lane end.
- **Why:** The spec quotes the tombstone text in lowercase, so I kept it. The label for negative days is my wording; the spec does not give one.

### 7. How should the college name appear on the sunflower?
- **Default:** The name sits in the sunflower's center disc, at 0.7rem with a white outline. It wraps and clips at 3.2rem tall for long names.
- **Why:** The spec says the name is written on the sunflower. The disc is the only part of the flower that can hold text. A longer name would not fit at a readable size, so the clip keeps the flower from growing.

### 8. Should the zombie's movement use `left` or `transform`?
- **Default:** `left` with a 0.8s ease-in-out transition on `.deadline-lane__path .lane-marker` and `.deadline-lane__days`. Both transitions are disabled under reduced motion in `animations.css`.
- **Why:** The lane width is not known to CSS alone, so a transform-only move would need a measured pixel width. `left` is simpler and smooth enough. Design 3.2 says animations use only transform and opacity, so this is a deviation to review. A transform-based move is an option if the team wants strict compliance.

### 9. What does a college already marked submitted show?
- **Default:** A completion tombstone dated with `submitted_at`, with no zombie. The Mark as completed button shows "Completed" and is disabled.
- **Why:** The spec defines the completed state but not how it loads. Showing the submitted state on reload matches the persistence goal in task 22.

### 10. What text does the completion tombstone show?
- **Default:** "Completed YYYY-MM-DD", using the local calendar date of the click, or `submitted_at` when loaded.
- **Why:** The spec says the tombstone shows the completion date. The label stays short so it fits the small tombstone.

### 11. Where should the days label sit?
- **Default:** Along the top of the lane, centered halfway between the walker and the lane end (`(percent + 100) / 2`).
- **Why:** The spec says the days remaining appear between the zombie and the sunflower. Halfway between the two keeps it in that gap as the zombie moves.

### 12. Reduced motion and the defeat animation
- **Default:** No change to the defeat animation. Under reduced motion, `.zombie--defeated` has no animation, so the zombie stands for the 800 ms fallback timer before it becomes the tombstone.
- **Why:** This is the same gap recorded for Task 12, item 5. The fallback timer still moves the lane to its completed state, so the flow does not stall.

### 13. Should days update at midnight without a reload?
- **Default:** No automatic timer. `initDeadlineTracker()` returns `refresh()`, which recalculates every lane from the current date. Task 20 can call it after a deadline edit.
- **Why:** Deadlines change in the modal (task 20), and the page can reload. A midnight timer would add behavior the spec does not ask for.

### 14. Should deadlines.html load app.js?
- **Default:** No. The page now loads `js/ui/deadline-tracker.js` through an inline module script. The old `<script src="js/app.js">` was removed.
- **Why:** `app.js` is a module that expects `#college-tombstones`, which this page does not have. Loading it here would throw, and the page would show nothing. Task 20 can change this when app.js handles both pages.

### 15. Should the Workflow Rule's UI questions be asked before building the lanes?
- **Default:** No questions were asked. I used the defaults above, recorded here, and built the lanes from the spec and the design.
- **Why:** The run rules say not to stop for questions, and this entry records the choices so you can review them.

### Files changed or created
- `frontend/js/ui/deadline-tracker.js` (new): `initDeadlineTracker`, `updateZombiePosition`, and helpers `calculateZombiePercent`, `computeDaysRemaining`, `formatLaneLabel`.
- `frontend/deadlines.html` (rewritten): links `style.css` and `animations.css` and runs the tracker module.
- `frontend/js/ui/modal.js`: `parseDeadline` and `formatIsoDate` are now exported so the tracker reuses them. No behavior change.
- `frontend/css/style.css`: `.deadline-track` changed to a column; lane, zombie, and sunflower styles appended as section 10.
- `frontend/css/animations.css`: lane transitions added to the reduced-motion block.
- `tests/deadline-tracker.test.js` (new): 12 tests.

## Task 16: Auto-Fill College Form

### 1. Where do college suggestions come from? (apiClient is task 17, lookup endpoint may not exist)
- **Default:** `initForm({ lookup })` takes an injectable async function that receives the query and returns an array of colleges. The default returns `[]`, so no network call is made and every search shows "No matching colleges found."
- **Why:** The run rules say not to build the API client here. The injectable keeps the search flow testable, and task 17 supplies the real `apiClient.lookupCollege()` call.

### 2. What lookup result shape does the form expect?
- **Default:** Each result has `name`, `city` (or `location`), `state`, `acceptanceRate` (or `acceptance_rate`), and `id` or `scorecardId`. The percent value is stored as given, with no conversion.
- **Why:** These match the fields in design.md 4.3 and the modal's acceptance rate handling (Task 14, item 9). Task 17 should return this shape, or the form adapts it in `autoFillForm`.

### 3. What happens on save before task 19 wires it?
- **Default:** `initForm({ onSubmit })` defaults to a function that rejects with "Saving is not connected yet." The form keeps the user's entries and does not report the college as added.
- **Why:** A form that resets and says "College added" without saving would mislead the user. The rejection path also tests the error message.

### 4. Should the search wait 300 ms before calling the lookup?
- **Default:** No debounce in this task. Every `input` event calls the lookup, and queries shorter than 2 characters are skipped.
- **Why:** The run rules say task 18 owns the 300 ms debounce. Adding it here would go beyond this task's steps. Stale responses are ignored, so out-of-order replies cannot overwrite newer results.

### 5. How many characters before the lookup runs?
- **Default:** 2 characters (`MIN_QUERY_LENGTH`). Whitespace is trimmed first.
- **Why:** One letter matches too many colleges to be useful, and the spec does not set a minimum. This avoids one API call per first keystroke.

### 6. Should a deadline of today be accepted?
- **Default:** Yes. The deadline must be today or later. A past date is rejected with "The deadline must be today or later."
- **Why:** design.md 8.1 says "Deadline date must be in the future." Read strictly, that rejects today. A deadline due today still needs action, so I allowed it. Change `validateFormData` in `form.js` if you want strictly future dates.

### 7. Is the deadline optional?
- **Default:** Yes. A blank deadline saves as `null`. The date picker is the native `input type="date"`.
- **Why:** The spec's Auto-Fill section lists the deadline picker but does not say it is required. Task 15 already shows "No deadline set" for a missing date, which supports allowing it.

### 8. Should the dialog close after a successful submit?
- **Default:** No. The form resets its fields and shows "College added to your graveyard." The dialog stays open.
- **Why:** The verification step says only "the form resets after a successful submit." Closing the dialog would be a separate behavior the spec does not ask for. Task 19 can close it once saving is wired. This is a likely point to change.

### 9. Should the lookup error show a Retry button?
- **Default:** No button. The message reads "Could not search colleges right now. You can enter the details by hand." Typing again runs the lookup again.
- **Why:** design.md 8.3 asks for a retry button on network errors. Typing again already retries, and the spec in 3.3 requires manual entry as the fallback. A real Retry button would add a control the task did not list. Flagged because it differs from 8.3.

### 10. Does Enter select a suggestion or submit the form?
- **Default:** When the suggestion list is open and has results, Enter selects the first suggestion. Otherwise Enter submits the form as usual.
- **Why:** Keyboard users can pick a match without a mouse, and the form still submits from the keyboard once the list is closed.

### 11. Does the acceptance rate field take a percent or a fraction?
- **Default:** A percent from 0 to 100. Values outside that range are rejected with "Acceptance rate must be a number from 0 to 100."
- **Why:** The database and the modal store percent values (Task 14, item 9). Using a fraction would require a conversion that nothing else does.

### Files changed or created for Task 16
- `frontend/js/ui/form.js`: Already present from the interrupted run. Reviewed and kept without changes. It has `initForm`, `setupSearchInput`, `handleSearch`, `autoFillForm`, `getFormData`, `resetForm`, `validateFormData`, and `formatSuggestionLabel`.
- `tests/form.test.js` (new): 13 tests using jsdom and the real `index.html`.
- `DEFAULTS-REVIEW.md`: this section added.
- `frontend/js/app.js` and `frontend/index.html`: Not changed. `app.js` already calls `initForm()`, and the dialog markup was already in place.

## Task 17: API Client Setup (Fetch Wrapper)

### 1. What URL should the backend base be?
- **Default:** `http://localhost:3000`. It can be overridden by setting `globalThis.SPOOKY_API_BASE_URL` before requests run. Trailing slashes are removed.
- **Why:** design.md 7.1 sets the server port to 3000. The browser has no build step to inject environment variables, so a global is the simplest override.

### 2. The status endpoint path differs between design and code. Which one should the client call?
- **Default:** `PATCH /api/applications/:collegeId/status`, the path the backend implements. design.md 4.1 lists `/api/colleges/:collegeId/status`.
- **Why:** The running backend (`backend/routes/applications.js`) is the source of truth. Changing the backend to match the design is outside this task. Flagged for review.

### 3. The deadline endpoint path differs between design and code. Which one should the client call?
- **Default:** `GET` and `PATCH /api/deadlines/:collegeId`, the backend's routes. design.md 4.1 lists `/api/colleges/:collegeId/deadline`.
- **Why:** Same as item 2. The backend routes already exist and match task 8.

### 4. How long should a request wait before it times out?
- **Default:** 5000 ms, covering the whole request including reading the body. It can be changed with `createApiClient({ timeoutMs })`.
- **Why:** design.md 8.1 and task 17 set 5 seconds.

### 5. What should a call resolve with?
- **Default:** The `data` field of a success envelope. The `message` field is dropped.
- **Why:** The verification step says `apiClient.get(...)` "resolves with data."

### 6. How should errors reach the caller?
- **Default:** Every failure throws `ApiError` with `code`, `message`, and `status`. Backend errors keep their own `code`. Client-side failures use `TIMEOUT`, `NETWORK_ERROR`, or `INVALID_RESPONSE`. A non-JSON error response uses `HTTP_<status>`. A 200 response with `success: false` is still an error.
- **Why:** The task says to map error responses to a thrown error with the code and message. Separate codes let each caller choose its own message, such as the retry text in design.md 8.3.

### 7. A relative path (no leading slash) is passed in. What happens?
- **Default:** A `TypeError` is thrown before any request is sent.
- **Why:** That is a programming error, not a server response, so it should not look like an `ApiError`. Without the check, the URL would be malformed.

### 8. Should `lookupCollege` wait for the injection in form.js, or be wired now?
- **Default:** Wired now, in `app.js`: `initForm({ lookup: lookupCollege })`. The form still calls it only on input. The 300 ms debounce stays in task 18.
- **Why:** `form.js` already expects this function, and the change is one line. Failures land in the existing `LOOKUP_FAILED` message, so the change is safe. Flagged because it moves part of task 18 forward.

### 9. Should the modal's status buttons save now?
- **Default:** Wired now, in `app.js`: `initDetailModal({ onStatusChange })` calls `updateApplicationStatus(college.id, status)`. The highlight moves only after the save resolves. The defeat animation and checkmark stay in task 21.
- **Why:** `modal.js` already has this callback, and it already waits for the save before it changes the highlight. A failed save keeps the old highlight. Flagged because it moves part of task 21 forward. No real college reaches the modal yet, so the call has no effect on screen today.

### 10. Should the deadlines page wire `updateApplicationStatus`?
- **Default:** Yes. `deadlines.html` now passes `updateApplicationStatus` to `initDeadlineTracker`.
- **Why:** The tracker already calls it with the same arguments. The page still passes `colleges: []`, so nothing calls it yet.

### 11. Which other injection points stay on their defaults?
- **Default:** Left unchanged: the form's `onSubmit` (task 19), the graveyard's `onDelete` (task 19), loading colleges with `getColleges` (task 20), and `updateDeadline` (task 20). The functions are exported, but they are not connected to the UI.
- **Why:** tasks.md assigns each of these to a later task. Connecting them now would go beyond task 17's note about "simple, safe" wiring.

### 12. Should the client tests call the live backend?
- **Default:** No. The tests start real local HTTP servers on 127.0.0.1 with set responses. They cover timeouts, refused connections, and malformed bodies. They do not run `fetch` against a mock.
- **Why:** The live backend needs PostgreSQL and a Scorecard API key. Local servers test the client's real HTTP behavior without them. A live check is still needed; see the Task 17 summary.

## Task 18: College Lookup & Form Auto-Fill Logic

### 1. Should the 300 ms debounce wrap the input handler or handleSearch()?
- **Default:** Wrap the `input` event in `setupSearchInput()`. `handleSearch()` stays immediate, so it can still be called directly.
- **Why:** Tests and other callers can run a lookup without a wait. Each keystroke cancels the pending timer and starts a new one, so only the final value triggers a request.

### 2. What happens when the field is cleared or holds fewer than 2 characters?
- **Default:** The pending timer is cancelled and the list clears at once. No request is sent.
- **Why:** A stale suggestion list should not stay visible after the user deletes the text. Waiting 300 ms for an empty query would add a delay with no benefit.

### 3. What wording should the not-found message use?
- **Default:** "College not found. You can enter the details by hand." The old text was "No matching colleges found. You can enter the details by hand."
- **Why:** The verification step requires the text "College not found." The second sentence keeps the manual-entry fallback from requirements 3.3.

### 4. Should the spinner show during the 300 ms wait?
- **Default:** No. The spinner shows once the lookup request starts.
- **Why:** Showing it during the wait would signal a request that has not been sent. The wait is short, and the spinner then reflects real network activity.

### 5. The API key is missing or invalid. What should the user see?
- **Default:** The same "Could not search colleges right now" message used for a network failure.
- **Why:** The backend returns a 400 `LOOKUP_ERROR` for a bad key. The user cannot fix the key, so a separate message would add little. The manual-entry path still works.

### 6. Did an existing test need to change?
- **Default:** One test in `tests/form.test.js` was updated. It now waits for the debounce (`SEARCH_DEBOUNCE_MS + 50` ms) before it checks that the lookup ran. Its name now says "after the debounce".
- **Why:** The old test assumed an immediate call, which the 300 ms debounce now prevents. No other existing test changed.

### 7. Should the minimum query length change?
- **Default:** No. It stays at 2 characters (`MIN_QUERY_LENGTH`).
- **Why:** The task did not ask for a change, and the 300 ms debounce already limits request volume.

### 8. The live backend returns `acceptanceRate: "NaN"` for Harvard. Should I fix it?
- **Default:** No. I left `backend/controllers/lookupController.js` unchanged and reported it.
- **Why:** The bug is in the backend, outside this task's frontend scope. The cause is that the code checks `admissionRate !== null`, which passes when the field is missing (`undefined`), so `undefined * 100` gives `NaN`. Proposed minimal fix: change the check to `admissionRate != null` (or `typeof admissionRate === 'number'`). Until then, the form's acceptance-rate field stays blank because the browser rejects "NaN" in a number input.

### Files changed or created for Task 18
- `frontend/js/ui/form.js`: added `SEARCH_DEBOUNCE_MS` (300) and `cancelPendingSearch()`. The `input` handler now debounces. `resetForm()` cancels any pending search. Not-found message wording changed.
- `tests/form.test.js`: one test updated to wait for the debounce.
- `tests/college-lookup.test.js` (new): 7 tests using the real `form.js`, `client.js`, and `index.html`.
- `DEFAULTS-REVIEW.md`: this section added.
- `frontend/js/app.js`: not changed. It already wires `lookupCollege`.
- `tasks.md`: not changed, as instructed.

## Task 19: Add College to Graveyard Logic

### 1. Which student identifier should the app send?
- **Default:** On first use, the browser calls the new `POST /api/students` route. The backend creates a student row and returns its UUID. The browser stores that ID in localStorage under `spooky-planner.studentId`.
- **Why:** The live database has a foreign key, `colleges.student_id -> students(id)`, and the `students` table is empty. No fixed student exists to reuse, and the app has no sign-in. Storing the ID in localStorage follows the option you allowed. The placeholder email is `anonymous-<uuid>@students.local`, because `students.email` is required and unique.

### 2. Where should the duplicate check live?
- **Default:** In the backend. `addCollege` rejects a name that matches an existing college for the same student, ignoring case and outer spaces. The route returns 409 with `code: "DUPLICATE_COLLEGE"`. The form shows the server message and keeps the entered data.
- **Why:** design.md 8.2 puts the duplicate check on the backend, per student. The check is a read followed by an insert, so two submits sent at the same moment can both pass. A unique index on `(student_id, lower(trim(name)))` would close that gap. I did not add it because it changes the schema, which is out of scope here.

### 3. What happens to the deadline when a college is saved?
- **Default:** The deadline is saved as an application through `POST /api/applications` after the college saves. If that second call fails, the college stays and its tombstone is added. The form shows "College added, but its deadline could not be saved." The form then resets, so the user cannot retry the deadline from this form.
- **Why:** Retrying the whole save would create a duplicate college. Keeping the college and reporting the deadline gap is the safer result. The modal's deadline input is still disabled until task 20.

### 4. Should the dialog close after a successful save?
- **Default:** No. The dialog stays open with the form cleared and the success message shown. This follows the Task 16 default.
- **Why:** The verification only asks for the reset. The new tombstone sits behind the open dialog until the user closes it. This is the likely point to change if you want the dialog to close on success.

### 5. Should saved colleges load when the page starts?
- **Default:** Yes. `app.js` calls `GET /api/colleges?studentId=...` on page start and renders the results without the reveal animation. The task 20 load step is pulled forward for this.
- **Why:** Without a load on start, the tombstone would not persist after a refresh, which the verification requires. A failed load is logged to the console and leaves the graveyard empty. No message is shown on the page yet.

### 6. How does the card reveal animation play?
- **Default:** `addTombstone()` adds the existing `tombstone--reveal` class (`cardReveal`, 0.3 s, animations.css) to the new stone only. Cards rendered on load do not get the class.
- **Why:** The spec says only a newly added college rises out of the grass. Replaying the animation on every page load would be noise.

### 7. Should the Harvard NaN acceptance-rate bug be fixed now?
- **Default:** No. `backend/controllers/lookupController.js` is unchanged.
- **Why:** It does not block this task's verification. A `"NaN"` value goes into the number input, the browser clears it, and the save still works with a null rate. Proposed fix, not applied: change `admissionRate !== null` to `admissionRate != null` on the line that builds `acceptanceRate`.

### 8. Does `backend/db/schema.sql` match the live database?
- **Default:** Not changed. The live database differs from the file. `colleges.student_id` and `applications.student_id` are UUID columns with a foreign key to `students(id)`. The file declares `VARCHAR(255)` with no foreign key. Anyone who rebuilds the database from the file will get a schema the app does not match.
- **Why:** Updating the schema file is outside this task. It needs a decision on whether the file or the database is the source of truth. Flagged for review.

### 9. Are there other data limits on manual entry?
- **Default:** No code change. Two issues stay as they are, both flagged for review:
  - `colleges.state` is `VARCHAR(2)`. Entering a full state name such as "Massachusetts" fails at the database. The server reports the error, and the form keeps the entered data.
  - The backend saves `acceptanceRate || null`, so a rate of 0 is stored as null.
- **Why:** Both are existing backend behavior and outside this task. Changing them would also change the data model.

### 10. Does deleting a tombstone persist?
- **Default:** No change. Delete still removes the card only, as set in Task 13. A deleted college comes back after a refresh.
- **Why:** Task 19 does not include delete, and the server call is not wired. Flagged so the gap is not missed in the persistence check.

### 11. How should the user be told about a new college with a duplicate name?
- **Default:** The server's text is shown: "This college is already in your graveyard." It is prefixed with "Could not add college:", as all save errors are.
- **Why:** One message path for every save error keeps the form simple, and the server text is clear enough for the user.

### 12. Were the workflow-rule UI questions asked before building?
- **Default:** No. The run rules said not to stop for questions, so I used these defaults and recorded them here.

### Files changed or created for Task 19
- `backend/controllers/collegeController.js`: duplicate check before insert (409 `DUPLICATE_COLLEGE`).
- `backend/routes/colleges.js`: returns 409 for duplicates, 400 for other add errors.
- `backend/controllers/studentController.js` (new): `createStudent()`.
- `backend/routes/students.js` (new): `POST /api/students`.
- `backend/server.js`: mounts `/api/students`.
- `frontend/js/api/client.js`: adds `createStudent()`.
- `frontend/js/api/student.js` (new): `getStudentId()` creates the student once, stores the ID, and shares one request across concurrent first calls.
- `frontend/js/ui/form.js`: `onSubmit` may resolve with a note string, which then replaces the success message.
- `frontend/js/app.js`: `saveNewCollege()` (validated data to `addCollege`, tombstone added, deadline saved as an application), `loadSavedColleges()`, and wiring of `onSubmit` plus the load on page start.
- `tests/add-college.test.js` (new): 12 frontend tests.
- `tests/college-duplicate-backend.test.js` (new): 5 backend tests against the real server and database.
- `DEFAULTS-REVIEW.md`: this section.
- `tasks.md`: not changed.

## Task 20: Update Deadline & Zombie Animation

### 1. Where should the zombie move when the deadline changes in the modal? The modal is on index.html, but the zombie lanes are on deadlines.html.
- **Default:** The deadline change is saved on index.html, and the modal shows the new date and days at once. The zombie moves live only on the deadlines page, and only when that page is open in the same session. Otherwise the zombie moves to the saved position on the next load of deadlines.html.
- **Why:** Adding a zombie lane to the graveyard page would be a new UI element, and the workflow rules say to ask before building UI. The run rules say not to ask. This default changes nothing visible on index.html. Flagged: if you want the zombie to move on index.html itself, that needs a UI decision.

### 2. What happens when the date is cleared?
- **Default:** The change is rejected in the browser with "Pick a date. A deadline cannot be cleared yet." No request is sent, and the input returns to the saved date.
- **Why:** `PATCH /api/deadlines/:collegeId` requires a date, and no endpoint clears one. Clearing would need a backend change, which is outside this task.

### 3. Can the deadline be set to a past date?
- **Default:** No. A date before today is rejected in the browser with "The deadline must be today or later." Today is allowed, which matches the add-college form (task 16, item 6). The backend also rejects past dates.
- **Why:** design.md 8.1 requires a date in the future, and the form already allows today. Using the same rule in both places keeps them consistent.

### 4. A college has no application row (it was saved without a deadline). What should a deadline change do?
- **Default:** It creates the application with `POST /api/applications` and the chosen date. It does not call `PATCH`, which returns "Application not found" in that case.
- **Why:** A college added without a deadline has no application row. Without this, the modal's date input would fail for those colleges.

### 5. Which days-remaining value should move the zombie: the server's `daysRemaining` or the browser's calculation?
- **Default:** The browser's calculation, `computeDaysRemaining` plus the existing `updateZombiePosition` formula, applied to the `deadlineDate` the server returns after a fresh read. The backend's `daysRemaining` and `zombieProgress` are not used for the position.
- **Why:** The run rules say to keep the existing formula in `deadline-tracker.js`. The backend uses `Math.ceil` on a millisecond difference, so it can report one day too many across a daylight-saving change. Flagged for review, not changed.

### 6. The save succeeds, but the fresh read fails. What should the user see?
- **Default:** The save is reported as successful. The zombie and the modal use the date the server accepted, and the failed read is logged to the console.
- **Why:** The change is already stored. Reporting a failure would invite a retry, and that retry would move the zombie to the same date. Flagged as a fallback path that skips the fresh read.

### 7. Should deadlines.html load app.js now?
- **Default:** Yes. The inline module script was replaced with `<script type="module" src="js/app.js">`. `app.js` starts the graveyard on index.html and the deadline lanes on deadlines.html, depending on which container the page has.
- **Why:** Task 15 (item 14) left this for task 20 to decide. The lanes need the saved colleges and their deadlines, and `app.js` is the place that loads them.

### 8. The existing modal test "the deadline input stays disabled until task 20" still passes. Should it change?
- **Default:** No change. The input is disabled only when no `onDeadlineChange` callback is wired. That test runs without one, so it still passes. The live app always wires the callback.
- **Why:** The test describes the no-callback state, which is still true. Renaming it would be a change the user did not request. Flagged so the name can be updated later.

### 9. What does the deadline fetch do with a 404 from the backend?
- **Default:** A 404 means "no application", so the college has no deadline. Any other error keeps the cache entry empty, and the next change reads the deadline again.
- **Why:** The backend's `GET /api/deadlines/:collegeId` returns 404 for every failure, including database errors. Flagged: a database outage during the read could look like "no application", and the next change would then try to create a second one. A dedicated "not found" status from the backend would fix this. Not changed here.

### 10. The date from the server is a timestamp (`2026-03-25T00:00:00.000Z`). Which part should the browser read?
- **Default:** The date part (`YYYY-MM-DD`), through the existing `parseDeadline` in `modal.js`.
- **Why:** `pg` returns DATE columns as midnight in the server's time zone. The JSON timestamp can fall on the previous day for a server east of UTC. Flagged: if the server runs east of UTC, the day shown can be off by one. The backend should send the date as a string.

### 11. Should "Mark as completed" on the deadlines page update the cache?
- **Default:** Yes. A successful status save also updates the cached status, so a reload-free refresh of the lanes keeps the same state.
- **Why:** Without this, a later deadline change could reopen a completed lane's data with a stale status.

### 12. Are the new tests run against the real PostgreSQL database?
- **Default:** No. `tests/deadline-update.test.js` uses an in-memory HTTP stand-in for the backend, with the same routes and error responses as the controllers. The reload check runs in a separate Node process.
- **Why:** Using the live database would write test rows into the user's data. Flagged: a manual check against the running server is still needed.

### Files changed or created for Task 20
- `frontend/js/app.js`: added `changeDeadline`, `validateDeadlineInput`, `loadDeadlines`, `fetchSavedColleges`, `startDeadlinePage`, and the deadline cache. `initApp` now wires `onDeadlineChange`, and page detection in `start()` is per page. Existing exports are unchanged.
- `frontend/js/ui/modal.js`: the deadline input is enabled when `onDeadlineChange` is set. A change saves through the callback and reverts on failure. Added `showDeadlineFields` and `handleDeadlineChange`.
- `frontend/js/ui/deadline-tracker.js`: added `setDeadline(collegeId, deadline)` on the returned object. It moves one lane's zombie with the existing formula. No formula change.
- `frontend/deadlines.html`: loads `js/app.js` instead of the inline module script.
- `tests/deadline-update.test.js` (new): 8 tests.
- `DEFAULTS-REVIEW.md`: this section.
- `tasks.md`: not changed, as instructed.

## Task 21: Mark Application as Submitted
### 1. The graveyard page has no zombie. Where should the defeat animation play when Submitted is clicked?
- **Default:** On the college's own tombstone card. A zombie is built with the same `buildZombie` and `playZombieDefeat` code that the deadlines page uses, placed above the stone, and removed when the defeat ends. Then the stone shows a checkmark.
- **Why:** Requirement 3.2 asks for the defeat, and the existing defeat flow lives in `deadline-tracker.js`. Adding a zombie to the deadlines page only would not show the defeat on the tombstone that the task names. This is a new visible element on index.html, so flagged for review.
### 2. The modal is a native dialog that sits above the graveyard. How does the user see the defeat?
- **Default:** After a successful save, the modal closes. The defeat plays on the tombstone, then the checkmark appears. Reopening the college shows "Submitted" highlighted, from the saved status.
- **Why:** An open modal covers the graveyard, so an animation there would not be seen. Keeping the modal open and playing the defeat inside it would be a larger UI change. Flagged for review.
### 3. What happens when Submitted is clicked on a college that is already submitted?
- **Default:** No request and no animation. The same rule covers clicking any status the college already has.
- **Why:** The backend sets `submitted_at` to `NOW()` on every submit, so a second request would overwrite the original submission time. Replaying the defeat on a finished college would also be misleading.
### 4. What does a status change away from Submitted do to the tombstone?
- **Default:** The checkmark is removed at once. No animation plays. Other statuses (pending, accepted, rejected, waitlisted) show no checkmark.
- **Why:** The checkmark should match the saved status. The task defines the defeat only for the move into submitted. Flagged: `submitted_at` is kept when the status changes away, because the backend does not clear it. That is the existing backend behavior, and it was not changed.
### 5. How should reduced motion behave?
- **Default:** With `prefers-reduced-motion: reduce`, the defeat is skipped. The checkmark, the saved status, and the modal state still update at once. The same rule applies to "Mark as completed" on the deadlines page, which previously waited for the animation fallback (800 ms) even though no animation ran.
- **Why:** Requirement 4 says all animations are disabled under reduced motion. The change to the deadlines page is a fix to existing behavior, and it reuses the same shared helper.
### 6. Which symbol and placement should the checkmark use?
- **Default:** A ✓ character in the top-right corner of the stone, with a green tint and the white outline. The stone gets a green border through the `tombstone--submitted` class.
- **Why:** The design says "checkmark or styling" and does not give a visual. This is the smallest visible mark. Flagged: the corner placement can be clipped on the cross and pointed shapes. Only the rounded shape is used in the current release, so this does not show yet.
### 7. Where does the status change get its status on page load?
- **Default:** The status is read from `GET /api/deadlines/:collegeId`, which the app already calls on load. That response includes `status`. The graveyard renders the checkmark from it, so no new endpoint was added.
- **Why:** The task requires the status to persist after a refresh, and this read path already exists. Flagged: a failed read leaves the checkmark off, and the modal shows the status as not highlighted.
### 8. Should a failed save close the modal or show the error?
- **Default:** The modal stays open with the message "Could not update status: ...". Nothing animates, and no checkmark appears.
- **Why:** The task requires that a failed update does not animate. Keeping the modal open lets the user retry without losing context.
### 9. Which tests were written, and how are they run?
- **Default:** `tests/submission.test.js` (8 tests) uses a local HTTP stand-in for the backend, the real `index.html`, `deadlines.html`, and the real frontend modules. The reload check runs in a separate process through `tests/support/graveyard-snapshot.js`, the same approach as `tests/deadline-update.test.js`.
- **Why:** The run rules asked for at least five tests, including edge cases. The live database was not used, to avoid writing test rows into the user's data. Flagged: a manual check against the running server is still needed.
### Files changed or created for Task 21
- `frontend/js/ui/deadline-tracker.js`: exported `buildZombie`, added `prefersReducedMotion` and `playZombieDefeat`. Mark as completed now calls `playZombieDefeat`. No behavior change except the reduced-motion skip.
- `frontend/js/ui/tombstone.js`: added `setTombstoneSubmitted` and the `tombstone--submitted` class. A card for a submitted college shows its checkmark when created.
- `frontend/js/ui/graveyard.js`: added `markTombstoneSubmitted` (defeat, then checkmark) and `clearTombstoneSubmitted`.
- `frontend/js/app.js`: added `changeApplicationStatus`, wired to the modal's `onStatusChange`. `loadSavedColleges` now passes each college's saved status to the render.
- `frontend/css/style.css`: `.college-tombstone` is now `position: relative`. Added section 11 for the checkmark, the submitted border, and the card zombie.
- `tests/submission.test.js` (new): 8 tests.
- `tests/support/graveyard-snapshot.js` (new): child-process helper for the reload test.
- `DEFAULTS-REVIEW.md`: this section.
- `tasks.md`: not changed, as instructed.

## Task 22: End-to-End Flow Testing

### 1. The database password in backend/config/.env is rejected (PostgreSQL error 28P01). Which config should the run use?
- **Default:** Use the `DATABASE_URL` in the root `.env`. `server.js` loads the root file first, and its credentials connect. No config file was changed.
- **Why:** The task says not to change the database config, and the root file already works. Flag: the two `.env` files hold different connection strings, and one of them is stale. Pick one and remove the other.

### 2. The backend started on port 3918 instead of 3000. Which port should the run use?
- **Default:** Restart with `PORT=3000` and `CORS_ORIGIN=http://localhost:5500` set in the launch command. No file was changed.
- **Why:** `frontend/js/api/client.js` hardcodes `http://localhost:3000`. The source of the 3918 value was not found, so the launch command sets the port explicitly.

### 3. No headless browser exists in the workspace. What should the run install?
- **Default:** Install `puppeteer-core` (no bundled browser) into `%TEMP%\spooky-e2e`, outside the repo. It is not in `package.json`. It drives the installed Google Chrome.
- **Why:** Google Chrome was already installed, so no browser download was needed. Keeping the driver out of the repo avoids a new committed dependency.

### 4. The frontend needs an HTTP server. What should serve it?
- **Default:** A 25-line Node static server, `%TEMP%\spooky-e2e\static-server.js`, on port 5500. It is not committed.
- **Why:** Port 5500 matches `CORS_ORIGIN` in `backend/config/.env`. ES modules need HTTP, not `file://`.

### 5. How should a lookup network error be produced in the browser?
- **Default:** Request interception aborts `/api/lookup/college` in step 1 of the browser run.
- **Why:** The result is repeatable and does not depend on whether the Scorecard API is reachable. Live Scorecard results were not checked in the browser.

### 6. The status update fails for every status (fix applied, blocking)
- **Problem:** `PATCH /api/applications/:collegeId/status` returns `inconsistent types deduced for parameter $1` for every status. Step 2 of the task (mark as submitted) cannot run.
- **Default applied:** In `backend/controllers/applicationController.js`, the new status is passed twice and the `CASE` compares `$2 = 'submitted'`. The old version compared `$1 = $2`.
- **Why:** The fix is the smallest change that works. Rolled-back probes confirmed the new SQL. The updated query now sets `submitted_at` only for `submitted`. The API test "submitted status persists" passes after the fix.

### 7. A college added in this session shows "No deadline set" in its detail view until a refresh (fix applied, blocking)
- **Problem:** `saveNewCollege` in `frontend/js/app.js` saved the application but did not fill the deadline cache that the detail modal reads. Step 2 (view details) showed the wrong deadline.
- **Default applied:** After `createApplication` succeeds, `saveNewCollege` writes `{hasApplication, deadlineDate, status: 'pending'}` to the cache.
- **Why:** Found by the browser run. The existing `npm test` suite still passes after the change.

### 8. A deadline of today is rejected by the backend (not fixed, test left failing)
- **Problem:** `PATCH /api/deadlines/:collegeId` with today's date returns `400 Deadline date must be in the future`. The frontend accepts today (Task 16 and Task 20 defaults), so a user who picks today in the modal gets an error.
- **Cause:** `updateDeadline` in `backend/controllers/deadlineController.js` uses `new Date('YYYY-MM-DD')`, which parses as UTC midnight. In Central time that is the evening of the previous day, so it counts as before today.
- **Default:** Not fixed. The failing test `a deadline of today gives 0 days and the zombie at the end of the lane` in `tests/e2e-flow.test.js` stays in place.
- **Proposed minimal fix:** In `updateDeadline`, replace `const deadline = new Date(newDeadlineDate);` with `const [y, m, d] = String(newDeadlineDate).split('-').map(Number); const deadline = new Date(y, m - 1, d);`. Keep the `isNaN` check, using `deadline.getTime()`.
- **Why not fixed:** The browser verification uses future dates only, so this bug does not block it. The fix changes date parsing on the backend, so it is left for review.

### 9. Where should the new tests live?
- **Default:** `tests/e2e-flow.test.js` (node:test, 8 cases) runs only when `E2E_LIVE=1` is set, so `npm test` stays offline. `tests/support/e2e-browser-flow.js` is a standalone script outside the `tests/*.test.js` glob.
- **Why:** The API tests need a live backend and database. The browser script needs `puppeteer-core` from outside the repo.

### 10. How should test rows be cleaned up?
- **Default:** Each run deletes the student it created. The foreign keys cascade (`ON DELETE CASCADE`) to colleges and applications. Each run checks the row counts afterward.
- **Why:** Deleting the student is the simplest complete cleanup. The check confirmed zero rows left after each run.

### 11. The startup log prints the full DATABASE_URL, including the password (not fixed)
- **Problem:** `backend/db/connection.js` `testConnection()` logs `Connected to: postgresql://...` with the password in plain text on every start.
- **Default:** Not changed. Logged for review.
- **Proposed minimal fix:** Log only the host, port, and database name, not the full URL.

### 12. Observations in the known-issues list (not fixed)
- **Harvard NaN:** The live lookup still returns `"acceptanceRate": "NaN"` for Harvard. The Task 18 fix is still needed.
- **Full state names:** Not exercised. The run used two-letter state codes.
- **404 for DB errors:** An unknown college ID returns 404. The database-error path was not tested, so the ambiguity is unchanged.
- **Cancel keeps the typed name:** After Cancel, the search box still holds the typed text when the dialog reopens. The spec does not require a reset here. Noted only.

### Test results (run on this machine, with the backend on :3000 and the frontend on :5500)
- API tests (`tests/e2e-flow.test.js`): 7 of 8 pass. The failing case is the deadline-today edge case in item 8.
- Browser run (`tests/support/e2e-browser-flow.js`): 20 of 20 checks pass after the fixes in items 6 and 7.
- Existing suite (`npm test`, which included the live API tests because `E2E_LIVE=1` was set in the shell): 132 of 133 pass. The one failure is item 8.
- `tasks.md` checkboxes were not changed.

## Task 23: Error Handling & Edge Cases

### 1. A save that times out may still have been stored on the server. A retry then returns "already in your graveyard", but no card is shown. Should the graveyard refresh when a duplicate comes back?
- **Default:** Yes. `saveNewCollege` in `frontend/js/app.js` reloads the saved colleges when the server answers `DUPLICATE_COLLEGE`, then rethrows so the form still shows the message and keeps the data.
- **Why:** Without this, the retry reports a duplicate for a college the user cannot see. The reload is one call and uses the existing render path.

### 2. What should the duplicate message say?
- **Default:** "Could not add college: This college is already in your graveyard. Change the name to add a different college." The earlier text ended with "try again", which does not help for a duplicate.
- **Why:** The user has to change the name or cancel. The message names that action. The fix is in `saveErrorMessage` in `frontend/js/ui/form.js`.

### 3. Some messages ended with two periods ("try again.."). Should the wrapper strip the period?
- **Default:** Yes. `saveErrorMessage` removes trailing periods from the reason before it adds its own sentence.
- **Why:** The server and client messages already end with a period. The fix is cosmetic but visible on every network and timeout error.

### 4. A non-string college name (for example the number 123) returned "name.trim is not a function". Should the backend check the type?
- **Default:** Yes. `addCollege` in `backend/controllers/collegeController.js` rejects a non-string name with "College name is required", the same message as a blank name.
- **Why:** The raw JavaScript error text does not tell the caller what is wrong. The frontend always sends a string, so this only affects direct API calls.

### 5. Should POST /api/applications reject a deadline in the past?
- **Default:** Not changed. A test marks this as a known gap (`todo`), so it does not fail `npm test`.
- **Why:** The live probe showed the API accepts a past date (201). A check would also reject today, because `updateDeadline` parses dates as UTC and fails for today in US time zones (the Task 22 known issue). Fix that first, then add the check.

### 6. Should a second application for the same college return 409, or replace the first one?
- **Default:** Not changed. A `todo` test records the gap. I propose 409 `DUPLICATE_APPLICATION`.
- **Why:** The live probe created two application rows for one college. The database has no unique rule on `applications.college_id`. Replacing rows would silently drop a deadline, so the choice needs your decision. Consequence to note: `fetchDeadlineInfo` in `app.js` treats a 404 as "no application". The deadline GET returns 404 for database errors too (Task 20 item 9), so a short database error during a deadline change could create a second row. A unique index plus 409 would stop that.

### 7. Raw database messages reach the user in some cases: a state longer than 2 letters, a non-UUID id, and a foreign-key error on a bad college ID. Should these be replaced with plain text?
- **Default:** Not changed. The backend tests check the envelope and status only.
- **Why:** The 2-letter state limit is a known issue (DEFAULTS-REVIEW, Task 22 item 12, and Task 19 item 9). A plain message here would hide the real cause without fixing it. Fixing the limit changes the data model, which is out of scope. The message text is clear enough for a user who typed a full state name.

### 8. Should the timeout tests wait for the real 5 second limit?
- **Default:** Yes. The jsdom test (`tests/error-recovery.test.js`) and the browser run both wait the full 5 seconds. The jsdom file takes about 12 seconds.
- **Why:** The 5 second limit is the spec value (design 8.1). An injected shorter limit would test a different path than the one users hit.

### 9. Lookup failures: should the form add a Retry button?
- **Default:** No. Typing again runs the lookup again, and the test checks that this works after a failed lookup.
- **Why:** Same as Task 16 item 9. design 8.3 asks for a retry button on network errors, but typing again already retries and the manual fields stay usable. Flagged because it differs from 8.3.

### 10. Known issue: the deadline-today test in `tests/e2e-flow.test.js` still fails. Should it be fixed here?
- **Default:** Not fixed. The failure message is the same as in Task 22 ("Deadline date must be in the future").
- **Why:** The user said to leave known issues unless they block this verification. Proposed fix, unchanged from Task 22 item 8: in `updateDeadline` (`backend/controllers/deadlineController.js`), parse `YYYY-MM-DD` into local midnight with `const [y, m, d] = String(newDeadlineDate).split('-').map(Number); const deadline = new Date(y, m - 1, d);`. The fix also unblocks the Item 5 check above.

### 11. Where should the live probes and browser run live?
- **Default:** In `%TEMP%\spooky-e2e` (`probe-errors.js`, `probe-apps.js`, `browser-errors.js`). Nothing new was added to the repo for them.
- **Why:** Task 22 kept its harness outside the repo. The repo tests that run against the database are `tests/error-handling-backend.test.js` (its own server on port 3916, deletes its rows) and the existing `tests/college-duplicate-backend.test.js`.

### Files changed or added for Task 23
- `backend/controllers/collegeController.js`: name type check (item 4).
- `frontend/js/ui/form.js`: `saveErrorMessage` with the duplicate wording and no double period (items 2 and 3).
- `frontend/js/app.js`: `saveNewCollege` reloads the graveyard on a duplicate (item 1).
- `tests/error-handling-backend.test.js` (new): 13 tests, 11 pass and 2 are `todo` (items 5 and 6). Uses the real server and database on port 3916.
- `tests/error-recovery.test.js` (new): 6 tests against a local stub server, covering validation, network error and retry, lookup failure and retry, timeout and retry, and timeout-then-duplicate. All pass.
- `DEFAULTS-REVIEW.md`: this section.
- `tasks.md`: not changed, as instructed.

## Task 24: Performance & Cleanup

### 1. Should the zombie move with `transform` instead of `left`?
- **Default:** No. The walker keeps `style.left` (the `.zombie` element in `buildZombie` / `updateZombiePosition`, `frontend/js/ui/deadline-tracker.js`).
- **Why:** Three test files assert `style.left` on the zombie: `tests/deadline-tracker.test.js`, `tests/deadline-update.test.js`, and `tests/support/e2e-browser-flow.js`. Moving to transform would also change the completion tombstone, which copies `left`. A transform needs a percent of the lane width, and `translateX(%)` uses the element's own width, so the change needs a wrapper "rail" element. That is not a contained change.
- **Measured:** The `left` transition causes no visible layout shift. CLS on the deadline page through the defeat was 0.0022 (see item 6).
- **Proposed follow-up (not done):** Put the zombie inside a full-width rail (`position: absolute; inset: 0`) and set `transform: translateX(P%)` on the rail. Then update the three test files to read the transform. The lane day label still uses `left`.

### 2. The search input is still debounced at 300 ms, so is anything needed?
- **Default:** No change. Task 18 already added `SEARCH_DEBOUNCE_MS = 300` in `frontend/js/ui/form.js`.
- **Why:** The Chrome probe confirmed it. No lookup request ran while typing, and one request ran about 270 to 285 ms after the pause.

### 3. Should the detail modal be lazy loaded?
- **Default:** No. The modal stays eager.
- **Why:** The dialog markup is about 40 lines of `index.html`, and `modal.js` is small. `deadline-tracker.js` also imports `parseDeadline` from it. Lazy loading would make the open and status paths async and touch code that many tests cover, for almost no gain. Design 9 says "lazy load detail views." This is a deliberate gap. The user can ask for it again.

### 4. Which `console.log` calls should be removed?
- **Default:** Removed the six per-request debug logs in `backend/controllers/lookupController.js`, including the one that printed the Scorecard API URL. `console.error` calls are unchanged. The frontend had no `console.log` calls.
- **Why:** These logs ran on every lookup and were debug output. Kept the others, for these reasons:
  - `backend/server.js` startup lines ("Server running on port", "Environment"). Task 1 verification says the server must log "Server running on port 3000". Removing them would break that check. The user can choose to remove them.
  - `backend/db/init.js` and `backend/db/testConnection.js`. These are command-line scripts, and their output is the result of the script. Removing it would make them silent.
  - `backend/db/connection.js` lines 24 to 26 and `backend/db/testConnection.js` lines 7 to 9. They print `DATABASE_URL`, which includes the database password. The run rules say not to change the password logging, so these lines are untouched. See item 9.

### 5. Which exports lacked JSDoc?
- **Default:** Added a brief JSDoc block to `parseDeadline` and `formatIsoDate` (`frontend/js/ui/modal.js`) and to `buildZombie` (`frontend/js/ui/deadline-tracker.js`). Every other export in `frontend/js` already had one.
- **Why:** These three had only `//` comments. The new test `every exported function in frontend/js has a JSDoc block directly above it` checks all exports and found no others.

### 6. How much of step 6 (browsers and mobile) could run here?
- **Default:** Chrome only, at a 375px mobile viewport (`isMobile`, `hasTouch`, 2x device scale) with puppeteer-core from `%TEMP%\spooky-e2e`. Firefox and Safari are NOT verified. Lighthouse is NOT run.
- **Why:** Firefox and Safari are not installed here, and the run rules say not to install browsers. Lighthouse is not installed either. The run rules say not to install large tools, so it was not installed.
- **Result in Chrome at 375px (15 of 15 checks passed):** no horizontal page overflow on either page. The add dialog fits in the viewport (left 15 px, right 360 px). The lane scrolls inside `#deadline-track` (480 px lane). The zombie is at 75% for 30 days. Reduced motion stops the zombie walk and the label transition. No uncaught page errors or console errors.

### 7. What is the layout-shift measurement?
- **Default:** A `PerformanceObserver` on `layout-shift` (entries without recent input), run in Chrome.
- **Result:** CLS was 0.0496 on the graveyard page. That includes adding a card, which shifts content below it. CLS was 0.0022 on the deadline page through the Mark as completed defeat. Both are under the 0.1 "good" threshold.

### 8. Which backend tests were run against the live server?
- **Default:** `npm test` was run with the backend started (`node backend/server.js`, port 3000). Without it, 8 `e2e-flow` tests fail with ECONNREFUSED. This is an environment setup detail, not a code problem.
- **Result:** Before: 152 tests, 149 pass, 1 fail, 2 todo. After: 159 tests, 156 pass, 1 fail, 2 todo. The one failure is `tests/e2e-flow.test.js:90`, "a deadline of today gives 0 days". It is the known UTC deadline-today issue from Task 22 item 10, not caused by this task.

### 9. Open item: the database password is still logged.
- **Status:** Still present, not changed, as instructed. `backend/db/connection.js` (line 25) and `backend/db/testConnection.js` (line 8) print `DATABASE_URL`, which includes the password. Proposed fix: log only the host and database name, for example by parsing the URL and dropping the password.

### Files changed or added for Task 24
- `backend/controllers/lookupController.js`: removed six debug `console.log` calls.
- `frontend/js/ui/modal.js`: added JSDoc to `parseDeadline` and `formatIsoDate`.
- `frontend/js/ui/deadline-tracker.js`: added JSDoc to `buildZombie`.
- `tests/task24-cleanup.test.js` (new): 7 tests. Keyframes animate only transform and opacity. No `console.log` in frontend JavaScript. No `console.log` in backend request code, and `console.error` is kept. JSDoc on every frontend export. Viewport meta tag on both pages. Only the 768px breakpoint in `style.css`. The search debounce is 300 ms, checked by importing the real `form.js`.
- `tasks.md`: not changed, as instructed.
- Chrome 375px probe: `%TEMP%\spooky-e2e\probe-375.js`, outside the repo, as with the earlier task harnesses.

## Follow-up fixes
Decisions made while doing the seven follow-up changes, without asking the user. Each entry lists the item, the question I would have asked, the default I used, and the reason.

### 1. Date parsing
- **Question:** Should the same local-date fix cover other date code?
- **Default:** Yes. A new helper `backend/utils/dates.js` reads `YYYY-MM-DD` as local midnight and rejects impossible dates such as 2026-02-31. `updateDeadline` and `calculateDaysRemaining` use it. `calculateDaysRemaining` also uses `Math.round` instead of `Math.ceil`, because a day that crosses a daylight-saving change is 23 or 25 hours long.
- **Why:** `applicationController` had no date parsing before this change. `deadlineController` was the only other place that parsed dates, and the frontend already parsed dates as local time.

### 2. Past dates
- **Question:** Does design.md 8.1 require a strictly future date, so that today is rejected?
- **Default:** No. design.md 8.1 says "Deadline date must be in the future" and does not say whether today counts. Today stays allowed, matching the existing "today or later" behaviour in the form, the modal, and the "deadline of today gives 0 days" test.
- **Why:** The task said to keep today allowed unless 8.1 clearly requires strictly future. It does not.
- **Also:** The backend message changed from "must be in the future" to "must be today or later", so it matches the rule it enforces. `POST /api/applications` now validates the date (format and past) before it touches the database. A missing deadline is still allowed. The add-college form and the modal already rejected past dates, so I only added tests there.

### 3. Env passwords
- **Question:** What should `.env.example` hold?
- **Default:** `backend/config/.env` has the root `.env` password. `.env.example` keeps the placeholder `your_password`. The rewrite touched only the password part of `DATABASE_URL`, and no env file has a separate password variable.
- **Why:** `.env.example` is a committed template. A connection test against it fails by design.
- **Also:** `connection.js` and `testConnection.js` now print only `host/database`. The old startup log printed the full URL, so the password appeared once in a log and tool output before this fix. Rotate it if that output is stored anywhere. `.env.example` also holds a real-looking `COLLEGE_SCORECARD_API_KEY`. I left it, because the task did not cover it. It should probably become a placeholder.

### 4. Missing lookup attributes
- **Question 1:** Which attributes count as missing, and when does the dialog open?
- **Default 1:** Location (city), state, and acceptance rate. The dialog opens when the user picks a suggestion that lacks any of them. Null, blank, NaN, and the strings "NaN", "null", and "undefined" count as missing. A rate of 0 is a real value. Manual entry never opens the dialog.
- **Question 2:** Can the user leave an input blank?
- **Default 2:** Yes. A blank input is skipped and the form field stays as it was. Only non-blank values are validated: rate 0-100, state a valid US state, territory, or code, location 255 characters or fewer.
- **Why:** All three fields are optional on the form, so forcing a value would block users who do not know it.
- **Question 3:** What kind of input should the rate use in the dialog?
- **Default 3:** A text input with a decimal keyboard hint. A number input reports "abc" as an empty value, so the text would be skipped silently instead of rejected.
- **Question 4:** What happens to values already in the form?
- **Default 4:** Values saved from the dialog replace what the form held, because the user typed them on purpose. Skip and Escape change nothing.

### 5. Full state names
- **Question 1:** Which codes map to names, and what about unknown codes?
- **Default 1:** 50 states, DC, PR, GU, VI ("U.S. Virgin Islands"), AS, MP, and also FM, MH, and PW, which the Scorecard can return. A code the table does not know is passed through unchanged by the lookup, and the backend rejects it on save.
- **Question 2:** Does the backend still accept codes?
- **Default 2:** Yes. `POST` and `PATCH /api/colleges` accept a code or a full name, in any case, and store the full name. A blank state is stored as null. Anything else returns 400 `ADD_ERROR` or `UPDATE_ERROR`.
- **Question 3:** How is the live database migrated?
- **Default 3:** `backend/db/migrate-full-state-names.js` runs in one transaction. It widens the column to VARCHAR(50), converts codes to names, and rolls back if the row count changes. It saved the old values to a JSON file in the temp folder. Row count before and after: 1 and 1. The row held a code and was converted. `schema.sql` now says VARCHAR(50). Re-running `init.js` does not alter an existing table, so the migration script is the way to update other databases.
- **Question 4:** Do tombstones show the state?
- **Default 4:** No. They show only the college name, so nothing changed there. The detail view shows the full name and converts an old two-letter value on display.

### 6. Zombie movement by transform
- **Question:** How should the zombie move, given that it already uses `transform` for its walking bob?
- **Default:** A `.deadline-lane__rail` wrapper, as wide as the path, holds the walker. The rail gets `transform: translateX(N%)` and `transition: transform 0.8s ease-in-out`. N is the same percentage as before, because the rail's width equals the path's width. The days label still uses `left`, since only the zombie was in scope. The completion tombstone takes the zombie's place on the same rail. Reduced motion turns the rail transition off, and the position still applies.
- **Why:** A transform on the zombie itself would clash with its `zombieWalk` animation.

### 7. Delete persistence
- **Question 1:** What if the server says the college is already gone (404)?
- **Default 1:** The card is removed, because the server no longer has the college. Any other failure keeps the card and shows "Could not delete the college. It is still in your graveyard."
- **Question 2:** What about the application row?
- **Default 2:** The live database already has `ON DELETE CASCADE`. The controller now deletes the application and the college in one transaction as well, so the result is the same without the cascade.
- **Question 3:** What else changed?
- **Default 3:** A second click on Delete while a request runs is ignored. A successful delete clears the deadline cache and the deadline tracker lane. The error message appears in a `role="alert"` paragraph that the script adds above the graveyard.

## Task 32: Prevent Duplicate Applications

Decisions made without asking the user. Each entry lists the task ID, the question, the default chosen, and why.

### 1. Task 32 step 1: What if duplicates exist in the live database?
- **Default:** Keep the newest row per college (by `created_at`, then `updated_at`, then `id`). Save the removed rows to a JSON file in the temp folder before deleting, and compare row counts before and after in one transaction.
- **Result:** The live database had 1 application row and no college with more than one. Nothing was removed, so no backup file was written. The script is `backend/db/migrate-unique-application.js` (`--report` lists duplicates and changes nothing). It is safe to run again.
- **Why:** Non-destructive by default, as the task asked.

### 2. Task 32 step 2: Replace the existing non-unique index or add a second one?
- **Default:** Add `uq_applications_college_id` (unique) and keep `idx_applications_college_id`.
- **Why:** Dropping an index was not asked for. The extra index is small. It can be removed later.

### 3. Task 32 step 3: Return the existing application, or an error, on a second POST?
- **Default:** 409 with code `DUPLICATE_APPLICATION` in the standard envelope. The insert uses `ON CONFLICT (college_id) DO NOTHING`, and a raw unique violation (23505) from a race maps to the same 409. The first application is not changed.
- **Why:** The task asked for 409. The frontend decides what to do with it.

### 4. Task 32 step 4: What does the frontend do on a 409?
- **Default:** `changeDeadline` and `saveNewCollege` catch `DUPLICATE_APPLICATION` and call `updateDeadline` on the existing application, then continue as if it had been created.
- **Why:** The application exists, so setting its deadline gives the result the user wanted.

### 5. Task 32 step 4: Should a database error on a deadline read still return 404?
- **Default:** No. `GET /api/deadlines/:collegeId` returns 404 only when no application exists or the id is not a UUID (pg code 22P02, kept because an existing test expects 404). Any other error returns 500 `INTERNAL_ERROR` with a generic message, and the detail is logged on the server only.
- **Why:** The frontend treats a 404 as "no application" and creates one. A 500 is rethrown, so no second row is created. The change is about 10 lines. `GET /api/applications/:collegeId` still returns 404 for every error. It is not used by the frontend, so it was left alone.

### 6. Task 32 step 5 and testing: How were the tests built?
- **Default:** The todo test in `tests/error-handling-backend.test.js` now asserts 409, the code, and that the first deadline is unchanged. New `tests/duplicate-application.test.js` covers the sequential 409, six concurrent POSTs (one 201, five 409), the raw 23505 from the index, a different college, an application without a deadline, a 500 from a server started with an unreachable database, and two frontend cases (409 then PATCH, and a 500 read sends no POST).
- **Why:** The database error case uses a real second server with a bad `DATABASE_URL` instead of a mock. The frontend cases use a local stand-in for `fetch`.

### Files changed or added for Task 32
- `backend/db/schema.sql`, `backend/db/migrate-unique-application.js` (new), `backend/controllers/applicationController.js`, `backend/routes/applications.js`, `backend/controllers/deadlineController.js`, `backend/routes/deadlines.js`, `frontend/js/app.js`, `tests/error-handling-backend.test.js`, `tests/duplicate-application.test.js` (new), `DEFAULTS-REVIEW.md`.
- `tasks.md` checkboxes were not changed.
