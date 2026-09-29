# Bug Report — Task API

## Approach

I started by going through the source files to understand how the Task API works. After that, I wrote tests based on the behavior I expected from the API and ran them against the original code without making changes first.

When a test failed, I used that result to identify the bug. For the issues that were not caught directly by the tests, I reproduced them manually using small scripts against the actual application. I have included the results below.

> Line numbers mentioned in this report are from the original code, before my changes.

**Status:**
- ✅ **Fixed** — fixed as part of this submission
- 📝 **Documented** — reproduced and documented, but not fixed in this submission

---

## Summary

| ID | Severity | Bug | Where | Status |
|---|---|---|---|---|
| BUG-1 | **High** | Pagination skips the first page; page 1 returns items 6–10 | `taskService.js:12` | ✅ Fixed |
| BUG-2 | **High** | `?status=` does substring matching (`do` matches `todo` and `done`) | `taskService.js:9` | ✅ Fixed |
| BUG-3 | **High** | Completing a task resets its priority to `medium` | `taskService.js:69` | ✅ Fixed |
| BUG-4 | **High** | `PUT` can overwrite `id`, `createdAt`, `completedAt` and add extra fields | `taskService.js:50` | 📝 |
| BUG-5 | Medium | Completing an already-completed task changes `completedAt` | `taskService.js:63-77` | 📝 |
| BUG-6 | Medium | Invalid JSON returns `500` instead of `400` | `app.js:9-12` | 📝 |
| BUG-7 | Medium | Changing status through `PUT` does not update `completedAt` correctly | `taskService.js:46-53` | 📝 |
| BUG-8 | Low | `status` and pagination cannot be used together | `routes/tasks.js:14-24` | 📝 |
| BUG-9 | Medium | Validators use truthy checks, allowing some invalid values | `validators.js:8,11,14,24,27,30` | 📝 |
| OBS-1 | Docs | README uses different status values from the actual code | `README.md` | ✅ Fixed |

---

## BUG-1 — Pagination skips the first page ✅

**Where:** `src/services/taskService.js`, `getPaginated`, line 12

The problem is with this calculation:

```js
const offset = page * limit;
```

### Expected behavior

For:

```text
GET /tasks?page=1&limit=5
```

I expected the API to return the first five tasks.

### Actual behavior

It returns tasks 6–10 instead.

I tested it with 15 tasks (`t1` to `t15`) and got:

```text
GET /tasks?page=1&limit=5  ->  ["t6","t7","t8","t9","t10"]
```

The expected result was:

```text
["t1","t2","t3","t4","t5"]
```

I also checked page 0:

```text
GET /tasks?page=0&limit=5  ->  ["t6","t7","t8","t9","t10"]
```

Page 0 is changed to page 1 by the route, so there was no way to access the first five tasks through the API.

### Why it happens

The API treats page numbers as **1-based**. In other words, page 1 is the first page.

But the service calculates the offset as if page numbers started from 0:

```js
page * limit
```

So when `page = 1` and `limit = 5`, the offset becomes `5`, which skips the first five records.

### Fix

I changed it to:

```js
const offset = (page - 1) * limit;
```

I also updated `routes/tasks.js` to parse page and limit using a `toPositiveInt` helper. This prevents invalid values such as negative numbers from creating unexpected array indexes.

For example, a negative page could otherwise result in a negative offset, and JavaScript's `Array.slice()` treats negative indexes differently.

Non-numeric, zero, and negative values now fall back to the default values.

### Tests

I tested this in:

- `taskService.test.js` → `getPaginated` — 5 tests
- `tasks.api.test.js` → pagination — 11 tests

One of the tests also checks that going through all pages returns every task exactly once.

---

## BUG-2 — Status filter matches partial strings ✅

**Where:** `taskService.js:9`

The original code was:

```js
tasks.filter((t) => t.status.includes(status))
```

### Expected behavior

The API has fixed status values:

```text
todo
in_progress
done
```

So:

```text
?status=done
```

should return only tasks whose status is `done`.

If someone sends:

```text
?status=do
```

I would expect no results because `do` is not a valid status.

### Actual behavior

With these tasks:

```text
todo
done
```

the request:

```text
GET /tasks?status=do
```

returned:

```text
["todo","done"]
```

This happened because `includes()` checks whether one string exists inside another string.

### Why it happens

`includes()` is useful when partial matching is wanted, but that is not what we need here. Status is a fixed set of values, so the API should compare the complete value.

### Fix

I changed the condition to:

```js
t.status === status
```

Now the status has to match exactly.

### Tests

I added unit tests for `getByStatus` and an integration test for:

```text
?status=do
```

---

## BUG-3 — Completing a task changes its priority ✅

**Where:** `taskService.js:69`, inside `completeTask`

The original code was setting:

```js
priority: 'medium'
```

when a task was completed.

### Expected behavior

When I call:

```text
PATCH /tasks/:id/complete
```

I expect the task's:

- status to change to `done`
- `completedAt` to be set

The priority should stay the same.

### Actual behavior

A task with high priority became medium priority after completing it.

For example:

```text
priority before -> after complete: ["high","medium"]
```

### Why it happens

There was a hard-coded:

```js
priority: 'medium'
```

in the object used to create the updated task.

This is easy to miss because tasks that already have medium priority do not show the problem. The issue only becomes visible for low- and high-priority tasks.

### Fix

I removed the hard-coded priority assignment.

### Tests

I tested all three possible priorities:

```text
low
medium
high
```

in both the unit and integration tests.

---

## BUG-4 — PUT can overwrite server-controlled fields 📝

**Where:** `taskService.js:50`

The update code uses:

```js
const updated = { ...tasks[index], ...fields };
```

The `PUT /:id` route passes `req.body` without filtering the fields first.

### Expected behavior

The client should only be able to update fields that are meant to be edited:

```text
title
description
status
priority
dueDate
```

Fields such as `id`, `createdAt`, and `completedAt` should be controlled by the application.

### Actual behavior

For example, a request like:

```text
PUT /tasks/:id
{
  "id": "hijacked",
  "createdAt": "1999-01-01T00:00:00.000Z",
  "foo": "bar"
}
```

resulted in:

```text
id = "hijacked"
createdAt = "1999-01-01..."
foo = "bar"
```

The original task could no longer be found using its original ID.

### Why it happens

The request body is spread directly into the stored task. This means fields that should not be changed can also be overwritten.

### Why I did not fix it

I kept the fixes in this submission limited to the three highest-impact bugs.

The fix itself would be fairly small. The update method should first pick only the allowed fields from the request body:

```text
title
description
status
priority
dueDate
```

and then merge those fields into the existing task.

I also added a test that can be used once the fix is implemented.

---

## BUG-5 — Completing a completed task changes `completedAt` 📝

**Where:** `taskService.js:63-77`

`completeTask` always creates a new timestamp:

```js
completedAt: new Date().toISOString()
```

### Expected behavior

If a task is already completed, calling the complete endpoint again should not change its original completion time.

### Actual behavior

I completed the same task twice and got:

```text
first completedAt:  2026-09-28T17:32:06.495Z
second completedAt: 2026-09-28T17:32:06.527Z
```

The timestamps are different even though the task was already completed.

### Why it happens

There is no check for:

```js
task.status === 'done'
```

before creating a new completion timestamp.

This can be a problem when a client retries a request because the original completion time gets replaced.

### Suggested fix

One possible fix is:

```js
if (task.status === 'done') {
    return task;
}
```

Another option is to keep the existing `completedAt` value when the task is already complete.

---

## BUG-6 — Invalid JSON returns 500 instead of 400 📝

**Where:** `src/app.js:9-12`

### Expected behavior

If a client sends invalid JSON, the request is invalid and should return:

```text
400 Bad Request
```

### Actual behavior

For example, this request:

```text
POST /tasks

{"title": "broken"
```

returned:

```text
500 {"error":"Internal server error"}
```

There was also a stack trace in the server log.

### Why it happens

`express.json()` throws a parsing error when the request body is not valid JSON.

The error contains information such as:

```text
err.status = 400
err.type = 'entity.parse.failed'
```

but the application's error handler ignores that information and always returns status `500`.

This makes a client-side request error look like a server problem.

### Suggested fix

The error handler should use the status provided by the error when available:

```js
res.status(err.status || 500)
```

A generic `500` response should only be used for actual server-side errors.

---

## BUG-7 — PUT does not keep `completedAt` in sync with status 📝

**Where:** `taskService.update`, lines 46-53

The `completeTask` method updates `completedAt`, but the normal `PUT` update does not.

Since `PUT` also allows the status to be changed, this can create inconsistent task data.

### Expected behavior

When a task becomes `done`, `completedAt` should be set.

When a task changes from `done` to another status, `completedAt` should be cleared.

### Actual behavior

I found these cases:

```text
PUT {status:"done"}
-> status "done", completedAt null
```

And:

```text
PATCH /complete
then
PUT {status:"todo"}

-> status "todo", completedAt still contains a timestamp
```

So it is possible to have:

```text
status = done
completedAt = null
```

or:

```text
status = todo
completedAt = timestamp
```

### Why it happens

The relationship between `status` and `completedAt` is handled in `completeTask`, but not in the general update method.

The rule should be kept in one place so that all ways of changing a task behave consistently.

### Suggested fix

When `status` changes inside `update`, `completedAt` should also be updated based on the new status.

---

## BUG-8 — Status filter disables pagination 📝

**Where:** `routes/tasks.js:14-17`

### Expected behavior

The API should allow filters and pagination to work together.

For example:

```text
GET /tasks?status=todo&page=1&limit=2
```

should return the first two `todo` tasks.

### Actual behavior

The request returns all `todo` tasks.

The `page` and `limit` values are ignored.

### Why it happens

The route has separate branches for status filtering and pagination. When a status is provided, the status branch returns the response immediately, so the pagination code is never reached.

In other words, the two features are currently treated as separate alternatives instead of being combined.

### Suggested fix

The data should first be filtered by status and then paginated.

For example:

```text
1. Get tasks
2. Apply status filter
3. Apply page/limit
4. Return result
```

---

## BUG-9 — Validators use truthy checks 📝

**Where:** `validators.js`

The validation code uses checks such as:

```js
if (body.status && !VALID_STATUSES.includes(...))
```

The same pattern is used for `priority` and `dueDate`.

### Expected behavior

If a value is provided but invalid, validation should reject it.

### Actual behavior

Falsy values can skip the validation.

I tested:

```text
POST /tasks
{
  "title": "x",
  "status": "",
  "priority": "",
  "description": 12345
}
```

The API returned:

```text
201
```

and stored:

```text
status = ""
priority = ""
description = 12345
```

The invalid status also caused the task to be missing from the normal status groups.

For example:

```text
GET /tasks/stats
-> {"todo":0,"in_progress":0,"done":0,"overdue":0}
```

### Why it happens

This:

```js
body.status && ...
```

basically means "only validate this when it has a truthy value."

That is different from checking whether the property was actually provided.

An empty string is still a value provided by the client, so it should not simply skip validation.

### Suggested fix

Check whether the value is actually present:

```js
body.status !== undefined
```

and then validate it.

The same approach should be used for `priority` and `dueDate`.

The `description` field should also be validated as a string.

---

## OBS-1 — README and code use different status values ✅

The README describes these status values:

```text
pending
in-progress
completed
```

However, the actual code and `ASSIGNMENT.md` use:

```text
todo
in_progress
done
```

For example, the README used:

```text
?status=pending
```

but the API returns an empty result for that value.

I treated the code as the source of truth and updated the README so that the documentation matches the actual API behavior.

---

## Smaller Observations

These were not included as separate bugs because they have a smaller impact, but I noticed them while testing the application.

### 1. `dueDate` validation is fairly loose

The validation message says the value should be a valid ISO date string, but `Date.parse()` accepts values such as:

```text
March 5, 2030
```

A number such as:

```text
12345
```

can also pass.

It would be better to validate that the value actually follows the expected ISO-8601 format.

### 2. Task titles are not trimmed

A title such as:

```text
"  padded  "
```

is stored with the extra spaces.

Whitespace-only titles are rejected, so trimming the title before storing it would make the behavior more consistent.

### 3. Stored task objects can be changed by internal callers

`create()` and `findById()` return the actual stored object.

That means an internal caller could accidentally modify the task directly.

This is not currently reachable through HTTP because responses are serialized, so I consider it a lower-risk issue.

`getAll()` returns a copy of the array, but the task objects inside it are still the original objects.

### 4. `limit` has no maximum value

There is no upper limit for the pagination `limit`.

For example:

```text
?limit=1000000
```

is accepted.

A reasonable maximum could be added to prevent unnecessarily large requests.

### 5. PUT behaves like a partial update

The current `PUT` implementation merges the supplied fields instead of requiring the complete task object.

The README previously described it as a full update.

I changed the README wording instead of changing the API behavior because existing clients may already depend on the current behavior.

### 6. Invalid status values return 200 with an empty list

For example, an invalid value in:

```text
?status=invalid
```

currently results in:

```text
200 []
```

instead of:

```text
400 Bad Request
```

I did not count this as a definite bug because returning an empty list for an unknown filter can also be considered a valid API design choice. This is something that could be confirmed with the product owner.

---

## Final Notes

The main issues I fixed were related to pagination, status filtering, and preserving task priority when completing a task.

The other issues are documented with their reproduction steps and suggested fixes. I left them unfixed intentionally so that the report clearly separates the bugs I addressed from the additional issues I found during testing.
