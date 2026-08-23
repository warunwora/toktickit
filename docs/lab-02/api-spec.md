# Lab 2 API Contract — TokTickIT Requester Ticketing MVP

Companion to [specification.md](specification.md). Every endpoint below is traceable to a functional
requirement (FR), a business rule (BR), and at least one planned test in [tests.md](tests.md).

**Base URL:** `http://localhost:3000`
**Content type:** `application/json` unless stated otherwise (uploads use `multipart/form-data`).

---

## 1. Identity and common conventions

### 1.1 Requester identity

Every ticket and attachment endpoint requires the header:

```
X-Requester-Id: <integer id of the selected Development Requester>
```

This is the Lab 2 testing mechanism, **not** authentication (BR-05). It is resolved by one backend
helper, `resolveRequester(req)`, so Lab 3 can replace it with a session or token lookup (BR-43).

| Condition | Status | Body |
|---|---|---|
| Header missing or not an integer | `400` | `{ "error": "A Development Requester must be selected", "field": "X-Requester-Id" }` |
| Header names a requester that does not exist or is inactive | `400` | `{ "error": "The selected Development Requester is no longer available" }` |

The client clears its stored selection and returns to the selector when it sees the second case
(BR-10).

### 1.2 Error shape

All errors use one of two shapes and never leak internals (BR-28):

```jsonc
// single error
{ "error": "Human readable, safe message" }

// field validation errors
{ "error": "Validation failed", "fields": [ { "field": "summary", "message": "Summary must be at least 10 characters" } ] }
```

### 1.3 Status codes in use

| Status | Used for |
|---|---|
| `200` | Successful retrieval, successful soft removal |
| `201` | Ticket created, attachment uploaded |
| `400` | Invalid input: validation failure, bad query parameter, missing/invalid requester header |
| `404` | Record not found **or** owned by another Requester (BR-13) |
| `409` | Duplicate submission, attachment limit reached, attachment already removed |
| `410` | Download of a soft-removed attachment (BR-39) |
| `413` | Uploaded file exceeds 5 MB (BR-32) |
| `415` | Unsupported attachment type (BR-31) |
| `500` | Unexpected server error, safe message only |

---

## 2. Reference data

### 2.1 `GET /api/health`

Unchanged from Lab 1. `200` → `{ "status": "ok", "service": "TokTickIT API" }`.

### 2.2 `GET /api/categories`

Active ticket categories in id order (FR-03, D-09 — the Lab 1 shape is preserved).

```json
200 OK
[ { "id": 1, "name": "Account and Access" }, { "id": 2, "name": "Hardware" } ]
```

No parameters. Inactive categories are never returned. `500` on unexpected failure.

### 2.3 `GET /api/related-systems`

Active related systems in id order (FR-03).

```json
200 OK
[ { "id": 1, "name": "Email" }, { "id": 2, "name": "Campus Wi-Fi" } ]
```

### 2.4 `GET /api/requesters`

Active Development Requesters for the selection screen (FR-01, BR-06). Does **not** require the
identity header — it is the endpoint that lets the tester choose one.

```json
200 OK
[ { "id": 1, "name": "Napat Srisai", "email": "napat.sri@kmutt.ac.th", "department": "Faculty of Engineering" } ]
```

Inactive requesters are never returned. An empty array is a valid response and drives the selector's
empty state (AC-06).

---

## 3. Tickets

### 3.1 `POST /api/tickets`

Create one validated ticket for the selected Requester (FR-04, FR-05).

**Headers:** `X-Requester-Id` required.

**Request body**

```json
{
  "categoryId": 2,
  "relatedSystemId": 7,
  "summary": "Laptop battery drains within an hour",
  "description": "Since the last update the corporate laptop discharges from 100% to 0% in under an hour, even on idle. Battery health reports 92%.",
  "requestedPriority": "MEDIUM"
}
```

| Field | Rules |
|---|---|
| `categoryId` | required, integer, must be an existing **active** category (BR-16) |
| `relatedSystemId` | required, integer, must be an existing **active** related system (BR-16) |
| `summary` | required, trimmed, 10–120 characters (BR-15) |
| `description` | required, trimmed, 20–4000 characters (BR-15) |
| `requestedPriority` | required, one of `LOW`, `MEDIUM`, `HIGH`, `URGENT` (BR-16) |

`ticketNumber`, `status`, `createdAt`, `updatedAt`, and `requesterId` are server-owned; if a client
sends them they are ignored (BR-01, BR-02, BR-04, BR-12).

**Success**

```json
201 Created
{
  "id": 42,
  "ticketNumber": "TKT-2026-000042",
  "status": "NEW",
  "requestedPriority": "MEDIUM",
  "summary": "Laptop battery drains within an hour",
  "description": "Since the last update ...",
  "requester": { "id": 1, "name": "Napat Srisai" },
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 7, "name": "Corporate Laptop" },
  "createdAt": "2026-08-12T04:11:20.310Z",
  "updatedAt": "2026-08-12T04:11:20.310Z",
  "attachments": []
}
```

**Failures**

| Case | Status | Body |
|---|---|---|
| Any field invalid | `400` | `{ "error": "Validation failed", "fields": [...] }` — one entry per offending field (BR-17) |
| Category or related system missing / inactive | `400` | field error on `categoryId` / `relatedSystemId` |
| Identical summary + description by the same requester within 60 s | `409` | `{ "error": "This ticket looks like a duplicate submission", "ticketNumber": "TKT-2026-000041" }` (BR-19) |
| Unexpected | `500` | `{ "error": "Unable to create the ticket" }` |

### 3.2 `GET /api/tickets`

The selected Requester's own tickets, searched, filtered, sorted, and paginated (FR-08…FR-12).
Ownership is applied server-side and cannot be widened by the client (BR-14).

**Query parameters**

| Parameter | Type | Default | Rules |
|---|---|---|---|
| `search` | string | — | case-insensitive substring of `ticketNumber` or `summary`; max 120 chars (BR-21) |
| `categoryId` | integer | — | must exist (BR-22) |
| `relatedSystemId` | integer | — | must exist (BR-22) |
| `requestedPriority` | enum | — | `LOW` \| `MEDIUM` \| `HIGH` \| `URGENT` |
| `status` | enum | — | `NEW` |
| `sort` | enum | `createdAt` | `createdAt` \| `updatedAt` \| `ticketNumber` \| `requestedPriority` (BR-23) |
| `order` | enum | `desc` | `asc` \| `desc` |
| `page` | integer | `1` | ≥ 1 (BR-24) |
| `pageSize` | integer | `10` | one of `5`, `10`, `20`, `50` (BR-24) |

Unknown parameter names, unparsable values, and out-of-range values are all `400` and name the
offending parameter (BR-25). Secondary sort is always `id desc` for determinism (BR-23).

**Success**

```json
200 OK
{
  "items": [
    {
      "id": 42,
      "ticketNumber": "TKT-2026-000042",
      "summary": "Laptop battery drains within an hour",
      "category": { "id": 2, "name": "Hardware" },
      "relatedSystem": { "id": 7, "name": "Corporate Laptop" },
      "requestedPriority": "MEDIUM",
      "status": "NEW",
      "attachmentCount": 2,
      "createdAt": "2026-08-12T04:11:20.310Z",
      "updatedAt": "2026-08-12T04:11:20.310Z"
    }
  ],
  "page": 1,
  "pageSize": 10,
  "totalItems": 23,
  "totalPages": 3
}
```

A page beyond the last one returns `200` with `items: []` and correct metadata (BR-27).
`attachmentCount` counts **active** attachments only.

### 3.3 `GET /api/tickets/:id`

One ticket, only if it belongs to the selected Requester (FR-13, FR-18, BR-13).

**Success** — the `POST` response shape, with `attachments` populated by the objects of §4.2.

| Case | Status | Body |
|---|---|---|
| Ticket does not exist **or** belongs to another Requester | `404` | `{ "error": "Ticket not found" }` |
| `:id` is not an integer | `400` | `{ "error": "Invalid ticket id" }` |

---

## 4. Attachments

### 4.1 `POST /api/tickets/:id/attachments`

Upload one permitted file to an owned ticket (FR-06, FR-15).

**Headers:** `X-Requester-Id` required. **Body:** `multipart/form-data`, field name `file`, exactly
one file per request.

| Rule | Enforcement |
|---|---|
| Allowed types | JPG/JPEG, PNG, WEBP, PDF — extension **and** MIME type must both match (BR-31) |
| Max size | 5 MB = 5 242 880 bytes (BR-32) |
| Max active attachments | 5 per ticket (BR-33) |
| Stored name | server-generated UUID + validated extension, written under `server/uploads/` (BR-35) |

**Success**

```json
201 Created
{
  "id": 9,
  "ticketId": 42,
  "originalFilename": "battery-report.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 184320,
  "uploadedAt": "2026-08-12T04:20:10.004Z",
  "uploadedBy": { "id": 1, "name": "Napat Srisai" },
  "state": "ACTIVE"
}
```

**Failures**

| Case | Status | Body |
|---|---|---|
| No file part | `400` | `{ "error": "A file is required" }` |
| Unsupported type | `415` | `{ "error": "Only JPG, PNG, WEBP and PDF files are allowed" }` |
| Larger than 5 MB | `413` | `{ "error": "Each file must be 5 MB or smaller" }` |
| Ticket already has 5 active attachments | `409` | `{ "error": "A ticket can have at most 5 active attachments" }` |
| Ticket missing or another Requester's | `404` | `{ "error": "Ticket not found" }` |
| Database write fails after the file was written | `500` | `{ "error": "Unable to store the attachment" }` — the orphaned file is deleted first (BR-42) |

### 4.2 `GET /api/tickets/:id/attachments`

Attachment metadata for one owned ticket (FR-14). Returns active **and** removed attachments, because
removed ones stay visible as metadata (BR-39).

```json
200 OK
[
  {
    "id": 9,
    "originalFilename": "battery-report.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 184320,
    "uploadedAt": "2026-08-12T04:20:10.004Z",
    "uploadedBy": { "id": 1, "name": "Napat Srisai" },
    "state": "ACTIVE"
  },
  {
    "id": 8,
    "originalFilename": "old-screenshot.png",
    "mimeType": "image/png",
    "sizeBytes": 220144,
    "uploadedAt": "2026-08-11T09:02:00.000Z",
    "uploadedBy": { "id": 1, "name": "Napat Srisai" },
    "state": "REMOVED",
    "removedAt": "2026-08-12T03:10:00.000Z",
    "removalReason": "Uploaded the wrong screenshot",
    "removedBy": { "id": 1, "name": "Napat Srisai" }
  }
]
```

### 4.3 `GET /api/attachments/:id/download`

Download an active attachment of an owned ticket (FR-16).

**Success** — `200` with `Content-Type` set to the stored MIME type and
`Content-Disposition: attachment; filename="<original filename>"`.

| Case | Status | Body |
|---|---|---|
| Attachment soft-removed | `410` | `{ "error": "This attachment has been removed" }` (BR-39) |
| Attachment missing or on another Requester's ticket | `404` | `{ "error": "Attachment not found" }` (BR-38) |
| Stored file missing on disk | `500` | `{ "error": "Unable to read the attachment" }` |

### 4.4 `PATCH /api/attachments/:id/remove`

Soft-remove an attachment (FR-17). The row is never deleted (BR-36).

**Request body**

```json
{ "reason": "Uploaded the wrong screenshot" }
```

`reason` is required, trimmed, 3–200 characters (BR-37).

**Success**

```json
200 OK
{
  "id": 8,
  "state": "REMOVED",
  "removedAt": "2026-08-12T03:10:00.000Z",
  "removalReason": "Uploaded the wrong screenshot",
  "removedBy": { "id": 1, "name": "Napat Srisai" }
}
```

| Case | Status | Body |
|---|---|---|
| Reason missing or out of range | `400` | `{ "error": "Validation failed", "fields": [ { "field": "reason", ... } ] }` |
| Already removed | `409` | `{ "error": "This attachment has already been removed" }` (BR-40) |
| Missing or another Requester's | `404` | `{ "error": "Attachment not found" }` |

---

## 5. Contract decisions

| # | Decision | Reason |
|---|---|---|
| A-01 | Ownership failures return `404`, never `403`. | A `403` would confirm that another Requester's ticket exists (D-02, BR-13). |
| A-02 | Validation errors return every offending field at once, not the first one. | The UI shows all field messages in one pass (AC-10, BR-17). |
| A-03 | `413` and `415` are used instead of a generic `400` for upload problems. | The client distinguishes "too big" from "wrong type" without string matching (AC-14). |
| A-04 | Removed attachments answer `410 Gone` on download rather than `404`. | The record legitimately exists and its metadata is visible; `410` states that the content is intentionally gone (BR-39). |
| A-05 | Unknown query parameters are rejected rather than ignored. | Silently ignoring a typo like `pagesize=50` would hide a real client bug (BR-25). |
| A-06 | One file per upload request. | Per-file success and failure reporting is exact, which BR-41 requires when a ticket is saved but one file fails. |
| A-07 | List responses are an envelope (`items` + metadata), while `GET /api/categories` stays a bare array. | Pagination needs metadata; the Lab 1 categories contract must not break (D-09). |
