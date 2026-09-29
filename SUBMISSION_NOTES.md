# Submission Notes

Companion to [BUG_REPORT.md](./BUG_REPORT.md).

## 1. What I completed

| Part | Details |
|---|---|
| Day 1 | Unit tests for `taskService` and validators |
| Day 1 | Integration tests for all API routes using Supertest |
| Day 2A | Bug report covering 9 bugs and 1 documentation issue |
| Day 2B | Fixed 3 bugs: pagination, status filtering, and priority reset |
| Day 2C | Added `PATCH /tasks/:id/assign` with tests |

**Result:** 152 tests passing.

Coverage:
- Statements: **98.8%**
- Branches: **98.8%**
- Functions: **97%**
- Routes, services, and validators: **100%**

The only uncovered code is the `app.listen()` call, which is only executed when the app is started directly. I also verified the server manually using `curl`.

## 2. Test Strategy

I wrote tests based on the expected API behavior rather than simply testing what the current code was doing. This helped me find bugs that would otherwise have been missed.

I used:
- Unit tests for services and validators
- Integration tests with Supertest
- Happy-path and edge-case tests
- `taskService._reset()` before each test to keep tests independent

I also tested cases such as invalid input, unknown IDs, pagination boundaries, empty values, wrong data types, and assignment limits.

For the bugs I did not fix, I kept `test.failing()` tests as documentation for the expected behavior.

## 3. Assign Endpoint

For `PATCH /tasks/:id/assign`:

- Missing or invalid `assignee` → `400`
- Empty or whitespace-only name → `400`
- More than 100 characters → `400`
- Unknown task → `404`
- Existing assignee can be replaced
- Whitespace around the name is trimmed
- Completed tasks can still be assigned
- New tasks use `assignee: null`

I chose these rules to keep the endpoint simple and consistent with the existing API.

## 4. Bugs I Fixed

I fixed:

1. **BUG-1:** Pagination skipped the first page.
2. **BUG-2:** Status filtering matched partial strings.
3. **BUG-3:** Completing a task changed its priority to `medium`.

I chose these because they could return incorrect data during normal use and had relatively small fixes.

The remaining bugs are documented in `BUG_REPORT.md`.

## 5. What I Would Test Next

If I had more time, I would add tests for:

- Concurrent updates
- More pagination combinations
- Consistent error responses
- Time and timezone edge cases
- Very large inputs
- The remaining documented bugs

## 6. What Surprised Me

A few things stood out while testing:

- The first page of pagination was completely unreachable because of the offset calculation and page validation.
- Some bugs only appeared with non-default values, such as high priority or partial status values.
- An empty status could create a task that was missing from filters and statistics.
- The README used different status values from the actual code.

## 7. Questions Before Production

Before shipping, I would clarify:

1. Which database should replace the in-memory store?
2. Who is allowed to create, edit, delete, and assign tasks?
3. Should `assignee` be a name or a real user ID?
4. Can tasks be reassigned, or should assignment return `409` when already assigned?
5. Should `PUT` be a full replacement or a partial update?
6. How should `completedAt` behave when a task is reopened?
7. What production requirements are needed for authentication, rate limiting, logging, monitoring, and error handling?
8. How many tasks/users should the API support?
