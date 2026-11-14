# Task 7: Application Status Endpoints - Testing Guide

## What Was Implemented

### 1. Application Controller (backend/controllers/applicationController.js)
Functions:
- updateApplicationStatus(collegeId, status) - Update application status
- getApplication(collegeId) - Fetch application details
- createApplication(studentId, collegeId, deadlineDate) - Create new application

Valid statuses: pending, submitted, accepted, rejected, waitlisted

### 2. Application Routes (backend/routes/applications.js)
Endpoints:
- PATCH /api/applications/:collegeId/status - Update status
- GET /api/applications/:collegeId - Get application details
- POST /api/applications - Create new application

### 3. Server Integration (backend/server.js)
- Routes registered at /api/applications
- Integrated with existing college and lookup routes

---

## Testing Steps

### Step 1: Start the server
```powershell
node backend/server.js
```

Keep this terminal open!

---

### Step 2: Create a test college first
In a NEW terminal, add a college:

```powershell
$body = @{
  studentId = "student123"
  name = "MIT"
  state = "MA"
  location = "Cambridge, MA"
  acceptanceRate = 2.7
} | ConvertTo-Json

$collegeResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/colleges" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body

$collegeId = $collegeResponse.data.id
Write-Host "College ID: $collegeId"
```

**Save the college ID** - you''ll need it for the next steps.

---

### Step 3: Create an application for the college
```powershell
$body = @{
  studentId = "student123"
  collegeId = "$collegeId"
  deadlineDate = "2025-01-15"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/applications" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body
```

Expected response:
```json
{
  "success": true,
  "message": "Application created successfully",
  "data": {
    "id": "...",
    "student_id": "student123",
    "college_id": "...",
    "status": "pending",
    "deadline_date": "2025-01-15",
    "created_at": "..."
  }
}
```

---

### Step 4: Get application details
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/applications/$collegeId"
```

Expected response shows the application with `status: pending`.

---

### Step 5: Update status to "submitted"
```powershell
$body = @{
  status = "submitted"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/applications/$collegeId/status" `
  -Method PATCH `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body
```

Expected response:
```json
{
  "success": true,
  "message": "Application status updated to submitted",
  "data": {
    "status": "submitted",
    "submitted_at": "2024-11-11T...",
    "updated_at": "2024-11-11T..."
  }
}
```

---

### Step 6: Test status validation
Try an invalid status:
```powershell
$body = @{
  status = "invalid_status"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/applications/$collegeId/status" `
  -Method PATCH `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body
```

Expected error:
```json
{
  "success": false,
  "error": "Invalid status. Must be one of: pending, submitted, accepted, rejected, waitlisted",
  "code": "UPDATE_STATUS_ERROR"
}
```

---

### Step 7: Test other valid statuses
Try each valid status:
```powershell
# Test "accepted"
$body = @{ status = "accepted" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/applications/$collegeId/status" `
  -Method PATCH -Headers @{"Content-Type"="application/json"} -Body $body

# Test "rejected"
$body = @{ status = "rejected" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/applications/$collegeId/status" `
  -Method PATCH -Headers @{"Content-Type"="application/json"} -Body $body

# Test "waitlisted"
$body = @{ status = "waitlisted" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/applications/$collegeId/status" `
  -Method PATCH -Headers @{"Content-Type"="application/json"} -Body $body
```

---

## Summary

? Task 7 Complete! Application status endpoints are working:
- POST (create application)
- GET (fetch application)
- PATCH (update status with validation)

Status validation ensures only valid values (pending, submitted, accepted, rejected, waitlisted) are accepted.
Submitted timestamp is automatically set when status changes to "submitted".

Next: Task 8 - Deadline Tracking Endpoints
