requirements.md
# [name placeholder] - Requirements

## 1. Project Goal
[name placeholder] is a web application designed to help students organize college research into a visual format to simplify tracking and comparison. 

## 2. User Stories
As a high school student, I want to view my college research in a consolidated space so that I can clearly compare school stats and details.
As a student managing multiple applications, I want to see my schools represented visually as tombstones so that managing my list feels doable.

## 3. Functional Requirements

### 3.1 Graveyard Layout & Tombstones
The system shall render a horizontally scrollable graveyard interface displaying a tombstone card for each saved college.
When a user clicks on a specific tombstone card, the system shall display a zoomed-in detail view showing relevant information such as location, state, and acceptance rate.

### 3.2 Plants vs. Zombies Deadline Tracker
The system shall display a horizontal deadline track where a zombie icon advances progressively toward a target line as the application deadline draws closer.
When a user inputs or updates a college deadline, the system shall calculate the remaining days and automatically position the zombie icon along the timeline track.
When a user marks an application status as "Submitted", the system shall trigger a completion animation (e.g., removing or defeating the zombie icon).

### 3.3 Feature Area: Auto-Fill College Lookup
When a user types and selects a college name in the input form, the system shall query the external U.S. College Scorecard API to fetch institutional data.
The system shall automatically populate form fields with the retrieved data, including school location, state, and acceptance rate, reducing manual data entry.
If a college name is not found in the database or the API request fails, the system shall notify the user and allow them to manually enter the college statistics.

## 4. Non-Functional Requirements
The frontend shall be built using standard HTML, CSS, and vanilla JavaScript without heavy UI frameworks.
The backend shall be built using Node.js with a PostgreSQL database.

