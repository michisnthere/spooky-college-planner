# Task 5: College Endpoints (CRUD) - Verification Guide

## What Was Implemented

### 1. College Controller (backend/controllers/collegeController.js)
Functions:
- getAllColleges(studentId) - Fetch all colleges for a student
- addCollege(studentId, collegeData) - Insert new college
- deleteCollege(collegeId) - Remove college by ID
- updateCollege(collegeId, updates) - Modify college details

### 2. College Routes (backend/routes/colleges.js)
Endpoints:
- GET /api/colleges?studentId=X - Get all colleges
- POST /api/colleges - Add new college
- DELETE /api/colleges/:collegeId - Delete college
- PATCH /api/colleges/:collegeId - Update college

### 3. Server Integration (backend/server.js)
- Routes registered at /api/colleges
- Error handling middleware added
- 404 handler for undefined routes

---

## Testing Steps

### Step 1: Start the server
```powershell
node backend/server.js
```

Expected output:
```
Server running on port 3000
Environment: development
? Database connection successful
  Connected to: postgresql://...
  Current time: ...
```

Keep this terminal open! Open a NEW terminal for testing.

---

### Step 2: Test Health Endpoint (verify server is running)
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/health
```

Expected response:
```
status                       timestamp                environment
------                       ---------                -----------
Server is running            2024-11-11T...          development
```

---

### Step 3: Test GET - Fetch colleges for a student
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/colleges?studentId=student123"
```

Expected response (empty list, since no colleges added yet):
```
success count data
------- ----- ----
   True     0 {}
```

---

### Step 4: Test POST - Add a college
```powershell
$body = @{
  studentId = "student123"
  name = "Harvard University"
  state = "MA"
  location = "Cambridge, MA"
  acceptanceRate = 3.2
  scorecardId = "166027"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/colleges" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body
```

Expected response:
```
success message data
------- ------- ----
   True College added successfully {id, student_id, name, state, location, acceptance_rate, scorecard_id, created_at}
```

**IMPORTANT**: Copy the `id` value from the response for testing DELETE/PATCH.

---

### Step 5: Test GET - Verify college was added
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/colleges?studentId=student123"
```

Expected response (list with 1 college):
```
success count data
------- ----- ----
   True     1 {@{id=..., student_id=student123, name=Harvard University, ...}}
```

---

### Step 6: Test PATCH - Update a college
Replace `<COLLEGE_ID>` with the ID from Step 4:

```powershell
$body = @{
  acceptanceRate = 2.9
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/colleges/<COLLEGE_ID>" `
  -Method PATCH `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body
```

Expected response:
```
success message data
------- ------- ----
   True College updated successfully {id, acceptance_rate=2.9, ...}
```

---

### Step 7: Test DELETE - Remove a college
Replace `<COLLEGE_ID>` with the same ID:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/colleges/<COLLEGE_ID>" `
  -Method DELETE
```

Expected response:
```
success message data
------- ------- ----
   True College deleted successfully {id=<COLLEGE_ID>, ...}
```

---

### Step 8: Verify deletion
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/colleges?studentId=student123"
```

Expected response (empty list):
```
success count data
------- ----- ----
   True     0 {}
```

---

## Summary

? Task 5 Complete! All CRUD endpoints for colleges are working:
- GET (list colleges)
- POST (add college)
- PATCH (update college)
- DELETE (delete college)

All responses follow the standardized JSON format with success, data, and error fields.

Next: Task 6 - Scorecard API Integration (Lookup)
