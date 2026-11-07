# Risk management API

All endpoints are under `/api`. Protected requests use
`Authorization: Bearer <accessToken>`.

## Counsellor sign-in

`POST /auth/counsellor/login`

Request:

```json
{ "email": "counsellor@example.com", "password": "..." }
```

Success (`200`):

```json
{
  "message": "Login successful",
  "accessToken": "<JWT>",
  "user": {
    "id": "<userId>",
    "name": "Counsellor Name",
    "email": "counsellor@example.com",
    "role": "COUNSELLOR",
    "centres": ["<centreId>"]
  }
}
```

Missing/invalid input returns `400`; invalid credentials, inactive users, and
users with another role return the same `401 Invalid email or password`.

## Accounts risk flags

Requires an active `ACCOUNTS` user.

`GET /risk/flags`

Optional query parameters:

| Parameter | Values |
|---|---|
| `centreId` | MongoDB centre ID; must belong to the authenticated user |
| `riskLevel` | `LOW`, `MEDIUM`, `HIGH` |
| `status` | `OPEN`, `REVIEWED`, `FALSE_POSITIVE`, `RESOLVED` |
| `page` | Positive integer; default `1`, maximum `1000000` |
| `limit` | Positive integer; default `20`, maximum `100` |

Success (`200`):

```json
{
  "success": true,
  "data": {
    "flags": [{
      "id": "<riskFlagId>",
      "riskLevel": "HIGH",
      "followUpRequired": true,
      "confidence": null,
      "reasons": ["Low attendance"],
      "signals": {
        "attendancePercentage": 60,
        "missedInstalments": 1,
        "testScoreTrend": "STABLE"
      },
      "status": "OPEN",
      "assignedTo": { "id": "<userId>", "name": "Counsellor Name" },
      "reviewedBy": null,
      "reviewedAt": null,
      "reviewNotes": "",
      "analysisSource": "RULES_FALLBACK",
      "student": {
        "id": "<studentRecordId>",
        "studentId": "STU-001",
        "name": "Student Name",
        "centre": { "id": "<centreId>", "name": "Centre", "code": "C1" },
        "batch": {
          "id": "<batchId>",
          "name": "Batch",
          "course": "JEE",
          "academicYear": "2026-27"
        }
      },
      "createdAt": "<ISO date>",
      "updatedAt": "<ISO date>"
    }],
    "pagination": {
      "currentPage": 1,
      "pageSize": 20,
      "totalRecords": 1,
      "totalPages": 1
    }
  }
}
```

Risk flag search is centre-scoped in the database aggregation. The response
includes the signals stored with the flag and limited student/counsellor
identity fields; it does not return parent contact information.

`GET /risk/counsellors`

Requires Accounts role. Optional `centreId` must be within the authenticated
user's centre assignments. Only active counsellors assigned to an accessible
centre are returned:

```json
{
  "success": true,
  "data": {
    "counsellors": [{
      "id": "<userId>",
      "name": "Counsellor Name",
      "centreIds": ["<accessibleCentreId>"]
    }]
  }
}
```

`POST /risk/flags/:riskFlagId/assignment`

Request:

```json
{ "counsellorId": "<activeCounsellorUserId>" }
```

The flag must be `OPEN` and require follow-up. The Accounts user must have
access to the student's centre, and the active counsellor must be assigned to
that centre. Success (`200`) returns:

```json
{
  "success": true,
  "data": {
    "id": "<riskFlagId>",
    "status": "OPEN",
    "assignedTo": "<counsellorUserId>"
  }
}
```

## Counsellor tasks

Requires an active `COUNSELLOR` user.

`GET /risk/tasks`

Optional `page` and `limit` parameters have the same limits as the Accounts
list. Only the authenticated counsellor's assigned, follow-up-required
`OPEN`/`REVIEWED` flags are returned. The response is
`{ "success": true, "data": { "tasks": [...], "pagination": {...} } }`.
Each task includes its risk level, reasons, stored attendance/payment/test
signals, status, review details, and limited student, centre, and batch
details.

`PATCH /risk/tasks/:riskFlagId/review`

Request:

```json
{ "outcome": "REVIEWED", "reviewNotes": "Optional note, up to 1000 characters" }
```

Allowed transitions:

- `OPEN` → `REVIEWED`
- `OPEN` or `REVIEWED` → `FALSE_POSITIVE` (non-empty `reviewNotes` required)
- `REVIEWED` → `RESOLVED`

Only the currently assigned counsellor may make these transitions. Success
(`200`) returns `id`, `status`, `followUpRequired`, `reviewedBy`, `reviewedAt`,
and `reviewNotes` under `data`. Each assignment and review outcome creates an
audit log entry. Invalid transitions return `404`; invalid request values
return `400`.

Risk flags only create and track counsellor follow-up work. These endpoints
do not change fee/payment data and do not send parent messages.
