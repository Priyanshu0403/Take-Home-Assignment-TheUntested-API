/**
 * Unit tests for src/utils/validators.js
 *
 * Every validator returns `null` when the input is valid, or an error-message
 * string when it is not. Tests marked `test.failing` document known bugs that
 * are intentionally left unfixed (see BUG_REPORT.md).
 */
const {
  validateCreateTask,
  validateUpdateTask,
  validateAssignTask,
} = require('../src/utils/validators');

describe('validateCreateTask', () => {
  test('accepts a minimal valid body (title only)', () => {
    expect(validateCreateTask({ title: 'Do it' })).toBeNull();
  });

  test('accepts a fully populated valid body', () => {
    expect(
      validateCreateTask({
        title: 'Do it',
        description: 'now',
        status: 'in_progress',
        priority: 'high',
        dueDate: '2030-01-01T00:00:00.000Z',
      })
    ).toBeNull();
  });

  test.each([
    ['missing', {}],
    ['empty string', { title: '' }],
    ['whitespace only', { title: '   ' }],
    ['a number', { title: 123 }],
    ['an object', { title: {} }],
    ['null', { title: null }],
  ])('rejects a title that is %s', (_label, body) => {
    expect(validateCreateTask(body)).toMatch(/title/);
  });

  test('rejects an unknown status and lists the allowed values', () => {
    expect(validateCreateTask({ title: 't', status: 'pending' })).toMatch(/todo, in_progress, done/);
  });

  test('rejects an unknown priority and lists the allowed values', () => {
    expect(validateCreateTask({ title: 't', priority: 'urgent' })).toMatch(/low, medium, high/);
  });

  test('rejects an unparseable dueDate', () => {
    expect(validateCreateTask({ title: 't', dueDate: 'not-a-date' })).toMatch(/dueDate/);
  });

  test('accepts a null dueDate (means "no due date")', () => {
    expect(validateCreateTask({ title: 't', dueDate: null })).toBeNull();
  });

  // BUG-9 (documented, not fixed): the validators use truthiness checks
  // (`body.status && ...`), so falsy-but-invalid values slip through.
  test.failing('rejects an empty-string status instead of silently accepting it', () => {
    expect(validateCreateTask({ title: 't', status: '' })).not.toBeNull();
  });

  test.failing('rejects an empty-string priority instead of silently accepting it', () => {
    expect(validateCreateTask({ title: 't', priority: '' })).not.toBeNull();
  });

  test.failing('rejects a non-string description', () => {
    expect(validateCreateTask({ title: 't', description: 12345 })).not.toBeNull();
  });
});

describe('validateUpdateTask', () => {
  test('accepts an empty body (nothing to change)', () => {
    expect(validateUpdateTask({})).toBeNull();
  });

  test('accepts valid partial updates', () => {
    expect(validateUpdateTask({ title: 'new' })).toBeNull();
    expect(validateUpdateTask({ status: 'done' })).toBeNull();
    expect(validateUpdateTask({ priority: 'low' })).toBeNull();
    expect(validateUpdateTask({ dueDate: '2030-01-01' })).toBeNull();
  });

  test.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['a number', 5],
    ['null', null],
  ])('rejects a title that is %s', (_label, title) => {
    expect(validateUpdateTask({ title })).toMatch(/title/);
  });

  test('rejects an invalid status', () => {
    expect(validateUpdateTask({ status: 'finished' })).toMatch(/status/);
  });

  test('rejects an invalid priority', () => {
    expect(validateUpdateTask({ priority: 'critical' })).toMatch(/priority/);
  });

  test('rejects an invalid dueDate', () => {
    expect(validateUpdateTask({ dueDate: 'soon' })).toMatch(/dueDate/);
  });
});

describe('validateAssignTask', () => {
  test('accepts a normal name', () => {
    expect(validateAssignTask({ assignee: 'Alice' })).toBeNull();
  });

  test('accepts names with spaces and unicode', () => {
    expect(validateAssignTask({ assignee: 'Zoë van der Berg' })).toBeNull();
  });

  test.each([
    ['missing', {}],
    ['an empty string', { assignee: '' }],
    ['whitespace only', { assignee: '   ' }],
    ['a number', { assignee: 42 }],
    ['null', { assignee: null }],
    ['an array', { assignee: ['Alice'] }],
    ['an object', { assignee: { name: 'Alice' } }],
  ])('rejects an assignee that is %s', (_label, body) => {
    expect(validateAssignTask(body)).toMatch(/assignee/);
  });

  test('rejects an assignee longer than 100 characters', () => {
    expect(validateAssignTask({ assignee: 'a'.repeat(101) })).toMatch(/100/);
  });

  test('accepts an assignee of exactly 100 characters', () => {
    expect(validateAssignTask({ assignee: 'a'.repeat(100) })).toBeNull();
  });
});
