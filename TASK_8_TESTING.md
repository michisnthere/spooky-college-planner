# Task 8: Deadline Tracking Endpoints - Testing Guide

## What Was Implemented

### 1. Deadline Controller (backend/controllers/deadlineController.js)
Functions:
- getDeadlineInfo(collegeId) - Fetch deadline with days remaining & zombie progress
- updateDeadline(collegeId, newDeadlineDate) - Update deadline date
- calculateDaysRemaining(deadlineDate) - Calculate days from today to deadline
- calculateZombieProgress(deadlineDate) - Calculate zombie position (0-100%)

**Zombie Progress Calculation:**
- Based on a 120-day application cycle
- Progress = (days passed / 120) * 100
- If deadline passed: 100% (zombie reaches target)
- Returns rounded percentage

### 2. Deadline Routes (backend/routes/deadlines.js)
Endpoints:
- GET /api/deadlines/:collegeId - Get deadline info with calculations
- PATCH /api/deadlines/:collegeId - Update deadline date

### 3. Server Integration (backend/server.js)
- Routes registered at /api/deadlines
- Integrated with existing routes

---

## Testing Steps

### Step 1: Start the server
```powershell
node backend/server.js
```

Keep this terminal open!

---

### Step 2: Create test data
In a NEW terminal, create a college and application with a deadline:

```powershell
# Create college
$collegeBody = @{
  studentId = "student123"
  name = "Stanford University"
  state = "CA"
  location = "Stanford, CA"
  acceptanceRate = 3.9
} | ConvertTo-Json

$collegeResp = Invoke-RestMethod -Uri "http://localhost:3000/api/colleges" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body $collegeBody

$collegeId = $collegeResp.data.id
Write-Host "College ID: $collegeId"

# Create application with deadline
$appBody = @{
  studentId = "student123"
  collegeId = $collegeId
  deadlineDate = "2025-03-15"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/applications" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body $appBody
```

**Save the college ID** - you''ll need it for testing.

---

### Step 3: Get deadline info (TEST GET)
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/deadlines/$collegeId"
```

Expected response:
```json
{
  "success": true,
  "data": {
    "applicationId": "...",
    "collegeId": "...",
    "deadlineDate": "2025-03-15",
    "daysRemaining": 124,
    "zombieProgress": 0,
    "status": "pending"
  }
}
```

**Note**: 
- `daysRemaining` shows days until deadline (should be ~124 days from now to March 15)
- `zombieProgress` ranges from 0-100% (0% = far left, 100% = far right)

---

### Step 4: Update deadline (TEST PATCH)
```powershell
$body = @{
  deadlineDate = "2025-01-15"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/deadlines/$collegeId" `
  -Method PATCH `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body
```

Expected response:
```json
{
  "success": true,
  "message": "Deadline updated successfully",
  "data": {
    "deadlineDate": "2025-01-15",
    "daysRemaining": 34,
    "zombieProgress": 72
  }
}
```

**Notice**: 
- Days remaining decreased from 124 to ~34
- Zombie progress increased from 0% to ~72% (more time has passed in the cycle)

---

### Step 5: Verify calculation accuracy
Get the deadline info again to confirm:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/deadlines/$collegeId"
```

Should show the updated deadline with recalculated progress.

---

### Step 6: Test validation - deadline in the past
```powershell
$body = @{
  deadlineDate = "2024-01-01"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/deadlines/$collegeId" `
  -Method PATCH `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body
```

Expected error:
```json
{
  "success": false,
  "error": "Deadline date must be in the future",
  "code": "UPDATE_ERROR"
}
```

---

### Step 7: Test validation - invalid date format
```powershell
$body = @{
  deadlineDate = "not-a-date"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/deadlines/$collegeId" `
  -Method PATCH `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body
```

Expected error:
```json
{
  "success": false,
  "error": "Invalid date format. Use YYYY-MM-DD",
  "code": "UPDATE_ERROR"
}
```

---

## Deadline Tracking Math

The zombie progress is calculated as:
- **Total cycle**: 120 days (standard application season)
- **Days passed**: 120 - daysRemaining
- **Progress**: (daysPassed / 120) * 100

Examples:
- Deadline 120 days away ? 0% progress (zombie at left)
- Deadline 60 days away ? 50% progress (zombie at middle)
- Deadline 1 day away ? 99% progress (zombie almost at target)
- Deadline passed ? 100% progress (zombie defeated!)

---

## Summary

? Task 8 Complete! Deadline tracking endpoints are working:
- GET (fetch deadline with calculations)
- PATCH (update deadline with validation)
- Accurate day calculations
- Zombie progress percentage (0-100)

Next: Task 9 - Error Handling & CORS Middleware
