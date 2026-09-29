# Submission Notes

Companion to [BUG_REPORT.md](./BUG_REPORT.md). Covers what I built, why, and what I'd do next.

## 1. What's in this submission

| Part | Where |
|------|-------|
| Day 1 — unit tests for `taskService` and validators | `task-api/tests/taskService.test.js`, `validators.test.js` |
| Day 1 — integration tests for every route | `task-api/tests/tasks.api.test.js` |
| Day 2A — bug report (9 bugs + 1 docs issue) | `BUG_REPORT.md` |
| Day 2B — bug fixes (3, incl. the pagination bug in detail) | `src/services/taskService.js`, `src/routes/tasks.js` |
| Day 2C — `PATCH /tasks/:id/assign` | `src/routes/tasks.js`, `taskService.js`, `validators.js`, tests in `tests/assign.api.test.js` |

**Result:** 152 tests, all green. Coverage: **98.8% statements / 98.8% branches / 97% functions**; routes, services and validators are at 100%. The only uncovered lines are the `app.listen()` call, which only runs when the file is launched directly (`node src/app.js`), so an in-process test cannot reach it. I verified it manually by starting the real server and hitting it with `curl`.

## 2. Test strategy

- **Assert the *expected* behaviour, not the current behaviour.** Writing tests from the contract (README, ASSIGNMENT.md, and common sense for an HTTP API) and *then* running them is what exposed the bugs. Tests written by reading the code and asserting what it returns would have enshrined the bugs.
- **Two layers.** Unit tests call the service and validators directly (fast, precise failures). Integration tests use Supertest to go through routing, JSON parsing, validation and the error handler, which is where bugs like BUG-6 (malformed JSON → 500) and BUG-8 (filter vs. pagination) live.
- **Independence.** `taskService._reset()` runs before every test, so tests can run in any order.
- **Boundaries and negatives, not just happy paths.** Page past the end, page 0 / negative / non-numeric, empty and whitespace strings, wrong types, unknown IDs, deleting twice, exactly-100-vs-101-character assignee, and so on.
- **Unfixed bugs are kept as executable documentation.** Instead of leaving the suite red or deleting the tests, the six bugs I did not fix are written as `test.failing(...)`. They pass while the bug exists and will **fail the moment someone fixes it**, which is the cue to change them to plain `test`. I confirmed each one fails for the *right* reason by temporarily switching them to normal tests and reading the assertion output (e.g. `Expected: 400, Received: 500`).

## 3. `PATCH /tasks/:id/assign` — design decisions

| Question | Decision | Why |
|----------|----------|-----|
| Task doesn't exist | `404 { error: "Task not found" }` | Same shape as every other route. |
| `assignee` missing / not a string / `null` / number / array / object | `400` | Explicit `typeof` check, not truthiness (that pattern is exactly what BUG-9 is). |
| `assignee` is `""` or whitespace | `400` | The endpoint's job is to *assign*. An empty name quietly meaning "unassign" would be an ambiguous, surprising side effect; if unassigning is needed it deserves its own explicit operation. |
| Very long name | `400` above 100 characters | Prevents storing an arbitrarily large blob through this field. 100 is a judgement call; easy to change (`MAX_ASSIGNEE_LENGTH`). |
| **Task is already assigned** | **Allowed — replaces the assignee, `200`** (not `409`) | Handing work to someone else is a normal workflow, `PATCH` means "modify this field", and re-sending the same name is idempotent. A `409` would be right for a "claim if free" rule — that's a product decision (see questions below). |
| Whitespace around the name | Trimmed before storing | `" Alice "` and `"Alice"` shouldn't become two different people. |
| Order of checks | Validate body (400) → look up task (404) | Same order the existing `PUT /:id` uses; consistent behaviour is easier to reason about. |
| Completed tasks | Can still be assigned | Assignment is independent of status; nothing in the brief says otherwise. |
| Task shape | Added `assignee: null` to new tasks | Every task now has the same fields, so clients don't have to distinguish "field missing" from "unassigned". |

## 4. What I fixed and why *these* three

I fixed **BUG-1 (pagination)**, **BUG-2 (substring status filter)** and **BUG-3 (priority reset)** because they silently return wrong data on ordinary requests, and each has a small, low-risk fix. I documented the rest with ready-to-flip tests rather than fixing everything: the brief asks for one fix, and a few of the others (BUG-4, BUG-7) are really design changes to how `update` works and deserve a conversation first.

## 5. What I'd test next

- **Concurrency-ish behaviour.** The store is a module-level array; if this ever gets a real database, add tests for simultaneous updates (two clients completing/assigning the same task).
- **Property-based tests for pagination**, e.g. "for any list and any limit, concatenating all pages reproduces the list exactly once".
- **Contract tests** for the exact error-response shape on every route, so a client can rely on `{ error: string }`.
- **Time-dependent logic** (`overdue`) around boundaries: due *exactly* now, timezones and DST, dates far in the past/future.
- **Larger inputs** (very large `limit`, very long titles/descriptions, big request bodies) and `express.json()`'s default 100 kB body limit.
- **The remaining six bugs**: flip their `test.failing` to `test` as each is fixed.

## 6. What surprised me

- **The first page of results was not just shifted, it was unreachable.** The off-by-one *and* the route's `page=0 → 1` coercion together meant no request could return the first `limit` tasks.
- **A test can pass and still be misleading.** BUG-3 doesn't show up for tasks with the default priority (`medium`), and BUG-2 doesn't show up for the three real status values, since none is a substring of another. Only tests with *non-default* data catch them, which is a good argument for `test.each` over a single happy-path case.
- **BUG-9's side effect.** A task created with `status: ""` is stored fine but appears in no status filter and no `/stats` bucket, so it effectively disappears.
- **The README contradicted the code** on the status values, so a developer following the README would get empty results and could reasonably conclude the API was broken.
- Fixing the pagination offset made a *latent* problem worse (negative pages would start reading from the end of the array), so the fix needed a small input guard as well.

## 7. What I'd ask before shipping to production

1. **Persistence.** The in-memory store loses everything on restart and can't run on more than one instance. What database, and what are the durability requirements?
2. **Auth and ownership.** Who may create, edit, delete and assign tasks? Should `assignee` be a free-text name, or a reference to a real user ID (with a check that the user exists)?
3. **Assignment rules.** Can a task be re-assigned by anyone, or only claimed when unassigned (→ `409`)? Should there be a way to unassign? Should assigning notify the assignee?
4. **Contract decisions I had to guess:** is `PUT` meant to be a full replace or a merge? Should an invalid `?status=` be `400` or `[]`? Is there a maximum page size?
5. **`completedAt` semantics.** Should reopening a task clear it (BUG-7)? Is `completedAt` ever user-editable?
6. **Operational readiness:** rate limiting, request logging with request IDs, structured errors, CORS policy, a proper health/readiness check, and monitoring that separates 4xx from 5xx (BUG-6 currently turns client errors into apparent server faults).
7. **Volume.** How many tasks per user? `getAll` and `getByStatus` are O(n) over an in-memory array, and pagination slices *after* loading everything.
