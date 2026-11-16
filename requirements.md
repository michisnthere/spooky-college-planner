requirements.md
# [name placeholder] - Requirements

## 1. Project Goal
[name placeholder] is a web application designed to help students organize college research into a visual format to simplify tracking and comparison. 

## 2. User Stories
As a high school student, I want to view my college research in a consolidated space so that I can clearly compare school stats and details.
As a student managing multiple applications, I want to see my schools represented visually as tombstones so that managing my list feels doable.

## 3. Functional Requirements

### 3.1 Graveyard Layout & Tombstones
The system shall render a horizontally scrollable graveyard interface displaying a tombstone card for each saved college. When a college is added, its tombstone shall rise up out of the grass with a reveal animation. The graveyard also shall display two special tombstones: an "Add College" tombstone, which opens a dialog containing the add-college form, and a "Deadline Tracker" tombstone, which opens the separate deadline page.
When a user clicks on a specific tombstone card, the system shall display a zoomed-in detail view showing relevant information such as location, state, and acceptance rate. Tombstone cards shall not carry a delete button. The detail view shall have a red Delete button below the application status box. After the user confirms, the system shall delete the college, close the detail view and remove the tombstone. If the delete fails, the detail view shall stay open and show the error.

### 3.2 Plants vs. Zombies Deadline Tracker
The system shall display, on the separate deadline page, a horizontal deadline track where a zombie icon advances progressively toward a target line as the application deadline draws closer. The deadline page shall be styled to resemble the lawn screen of the Plants vs. Zombies game, with horizontal lanes of grass and a zombie that walks along the lane toward the target. The deadline page shall show one lane per tracked college. Each lane has its own zombie, drawn in detail, that walks from the left toward a sunflower at the right end of the lane. The college name is written on the sunflower. The days remaining appear on the space between the zombie and the sunflower. When the user clicks "Mark as completed" on a lane, the system shall play a zombie death animation, replace the zombie's position with a tombstone showing the completion date, and record the application as submitted. When days remaining reaches 0, the system shall replace the sunflower with a tombstone that reads "deadline has passed."
When a user inputs or updates a college deadline, the system shall calculate the remaining days and automatically position the zombie icon along the timeline track.
When a user marks an application status as "Submitted", the system shall trigger a completion animation (e.g., removing or defeating the zombie icon). The defeat animation shall make the zombie fall backward and shed a short burst of dirt particles.

### 3.3 Feature Area: Auto-Fill College Lookup
When a user types and selects a college name in the input form, the system shall query the external U.S. College Scorecard API to fetch institutional data.
The system shall automatically populate form fields with the retrieved data, including school location, state, and acceptance rate, reducing manual data entry.
If a college name is not found in the database or the API request fails, the system shall notify the user and allow them to manually enter the college statistics.

### 3.4 Night Graveyard Theme & Tombstone Variety

The system shall render the graveyard ground as grass, with muted gray-green tombstones standing on it. The night sky shall appear above the graveyard. The system shall render the moon as a detailed element with surface craters and a glow.
The system shall render the header in dark purple with orange highlights. The system shall render dialogs in colors that contrast with the page background, so they remain visible against it.
The system shall keep all text legible without a white outline around the letters. Bright text on a dark background uses a soft dark shadow. Dark text on a stone uses a light letterpress edge instead of an outline.
The system shall render each tombstone with detailed styling, including stone edges, carved detail, weathering, and shadows.
The system shall render tombstones in a variety of shapes, including at least rounded-top, pointed-top, cross, slab, and arched shapes.
In a future release, the system shall assign each tombstone a shape based on the college's ranking category, so that colleges in the top 10 and colleges in the top 50 display different shapes. The ranking data source is not yet defined and is out of scope for the current release.

### 3.5 Visual Polish: Typography, Depth & Atmosphere

**Fonts.** The system shall set headers and larger text in Fraunces, and body and smaller paragraph text in Plus Jakarta Sans. Each font shall have a serif or sans-serif fallback stack so text stays readable while the font loads.

**Embossed typography.** The system shall render headers and other large display text with an embossed look, as if pressed or raised from the surface, using layered highlights and shadows. The embossing shall keep the text legible against its background and shall not use a white outline.

**Parallax scenery.** The system shall render the night scenery in several layers that move at different speeds as the user scrolls, so that distant layers move slower than near layers. From farthest to nearest the layers are: the glowing moon, faint clouds, hills, and twisted trees with graveyard silhouettes. The layers shall sit behind the tombstones and shall not block clicks or reduce text legibility. Both the page scroll and the graveyard's sideways scroll move the layers, on every page. Under reduced motion the layers shall stay fixed in place.

**Wobbly stones.** When the pointer hovers over a tombstone card, the system shall tilt that card by 1 to 2 degrees with a short, subtle "earth rumble" motion, as if something were knocking from underneath. The card shall settle back when the pointer leaves. On touch screens, tapping a card shall play the same motion once. The motion shall not change the card's click target or move neighboring cards.

**Victorian gate dividers.** The system shall style every horizontal rule (<hr>) as a custom SVG border in place of a plain line. The border shall be inspired by Victorian cemetery gates, with thin vertical bars, spearhead tips and delicate scrollwork, drawn in dark charcoal (#2E323E). The border shall scale to the width of its container and repeat sideways. The current pages contain no <hr>, so no dividers are added yet. The style applies to any <hr> added in the future.

**Drifting ground fog.** The system shall place a semi-transparent, blurred gradient layer over the bottom of the tombstone cards that drifts slowly and horizontally, so the stones look like they rise out of mist. Each tombstone card has its own fog layer, and one shared fog strip also drifts in the background behind the graveyard. The fog shall not intercept clicks and shall not hide the text on a card.

All new motion (parallax, wobble, fog) shall use only transform and opacity, and shall be disabled when the operating system requests reduced motion.

## 4. Non-Functional Requirements
The frontend shall be built using standard HTML, CSS, and vanilla JavaScript without heavy UI frameworks.
The frontend shall use a single responsive breakpoint at 768px. This value may be adjusted after testing. The frontend shall disable all animations when the operating system requests reduced motion.
The backend shall be built using Node.js with a PostgreSQL database.

