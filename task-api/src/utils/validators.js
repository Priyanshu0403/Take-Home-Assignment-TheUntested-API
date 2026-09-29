const VALID_STATUSES = ['todo', 'in_progress', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];

const validateCreateTask = (body) => {
  if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
    return 'title is required and must be a non-empty string';
  }
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  }
  if (body.priority && !VALID_PRIORITIES.includes(body.priority)) {
    return `priority must be one of: ${VALID_PRIORITIES.join(', ')}`;
  }
  if (body.dueDate && isNaN(Date.parse(body.dueDate))) {
    return 'dueDate must be a valid ISO date string';
  }
  return null;
};

const validateUpdateTask = (body) => {
  if (body.title !== undefined && (typeof body.title !== 'string' || body.title.trim() === '')) {
    return 'title must be a non-empty string';
  }
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  }
  if (body.priority && !VALID_PRIORITIES.includes(body.priority)) {
    return `priority must be one of: ${VALID_PRIORITIES.join(', ')}`;
  }
  if (body.dueDate && isNaN(Date.parse(body.dueDate))) {
    return 'dueDate must be a valid ISO date string';
  }
  return null;
};

const MAX_ASSIGNEE_LENGTH = 100;

// Validates the body of PATCH /tasks/:id/assign  ->  { "assignee": "<name>" }
//
// Design decisions:
//  - assignee must be a string. `null`, numbers, arrays and objects are rejected.
//  - An empty / whitespace-only string is rejected (400). The endpoint's job is
//    to ASSIGN; an empty name would silently mean "unassign", which is a
//    different operation that should not hide behind an ambiguous input.
//  - Max 100 chars so a client cannot store an arbitrarily large blob in
//    memory through this field.
// Note: this uses explicit type checks rather than truthiness (`!body.assignee`)
// on purpose - see BUG-9 in BUG_REPORT.md for what truthiness checks let through.
const validateAssignTask = (body) => {
  if (typeof body.assignee !== 'string' || body.assignee.trim() === '') {
    return 'assignee is required and must be a non-empty string';
  }
  if (body.assignee.trim().length > MAX_ASSIGNEE_LENGTH) {
    return `assignee must be at most ${MAX_ASSIGNEE_LENGTH} characters`;
  }
  return null;
};

module.exports = { validateCreateTask, validateUpdateTask, validateAssignTask };
