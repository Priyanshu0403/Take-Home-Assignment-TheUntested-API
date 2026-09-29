/**
 * Integration tests for the new endpoint: PATCH /tasks/:id/assign
 *
 * Contract (see the comment above the route in src/routes/tasks.js):
 *   200 + updated task -> assigned or re-assigned
 *   400                -> assignee missing / not a string / empty / whitespace / too long
 *   404                -> unknown task id
 *
 * Decisions these tests pin down:
 *   - empty or whitespace-only assignee is rejected (400), it does NOT unassign
 *   - re-assigning an already-assigned task is allowed (200) and replaces the assignee
 *   - the assignee is trimmed before it is stored
 *   - a validation error is reported before a missing task (same order as PUT /:id)
 */
const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

const createTask = async (body = { title: 'A task' }) => {
  const res = await request(app).post('/tasks').send(body);
  expect(res.status).toBe(201);
  return res.body;
};

const assign = (id, body) => request(app).patch(`/tasks/${id}/assign`).send(body);

beforeEach(() => {
  taskService._reset();
});

describe('PATCH /tasks/:id/assign - success', () => {
  test('assigns a task and returns 200 with the updated task', async () => {
    const task = await createTask({ title: 'Review PR' });
    const res = await assign(task.id, { assignee: 'Alice' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...task, assignee: 'Alice' });
  });

  test('new tasks start unassigned (assignee is null)', async () => {
    const task = await createTask();
    expect(task.assignee).toBeNull();
  });

  test('the assignment is persisted and visible in GET /tasks', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Alice' });

    const list = await request(app).get('/tasks');
    expect(list.body[0].assignee).toBe('Alice');
  });

  test('trims surrounding whitespace before storing', async () => {
    const task = await createTask();
    const res = await assign(task.id, { assignee: '  Alice  ' });
    expect(res.body.assignee).toBe('Alice');
  });

  test('supports names with spaces and non-ASCII characters', async () => {
    const task = await createTask();
    const res = await assign(task.id, { assignee: 'Zoë van der Berg' });
    expect(res.body.assignee).toBe('Zoë van der Berg');
  });

  test('accepts an assignee of exactly 100 characters', async () => {
    const task = await createTask();
    const res = await assign(task.id, { assignee: 'a'.repeat(100) });
    expect(res.status).toBe(200);
  });

  test('does not modify any other field of the task', async () => {
    const task = await createTask({
      title: 'Keep me',
      description: 'desc',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-01-01T00:00:00.000Z',
    });
    const res = await assign(task.id, { assignee: 'Alice' });

    const { assignee, ...rest } = res.body;
    const { assignee: _before, ...restBefore } = task;
    expect(rest).toEqual(restBefore);
    expect(assignee).toBe('Alice');
  });

  test('only affects the targeted task', async () => {
    const a = await createTask({ title: 'a' });
    const b = await createTask({ title: 'b' });
    await assign(a.id, { assignee: 'Alice' });

    const list = (await request(app).get('/tasks')).body;
    expect(list.find((t) => t.id === a.id).assignee).toBe('Alice');
    expect(list.find((t) => t.id === b.id).assignee).toBeNull();
  });

  test('works on a completed task too (assignment is independent of status)', async () => {
    const task = await createTask();
    await request(app).patch(`/tasks/${task.id}/complete`);
    const res = await assign(task.id, { assignee: 'Alice' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'done', assignee: 'Alice' });
  });
});

describe('PATCH /tasks/:id/assign - already assigned', () => {
  test('re-assigning replaces the previous assignee (200, not 409)', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Alice' });
    const res = await assign(task.id, { assignee: 'Bob' });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Bob');
    expect(taskService.findById(task.id).assignee).toBe('Bob');
  });

  test('assigning the same person again is idempotent', async () => {
    const task = await createTask();
    const first = await assign(task.id, { assignee: 'Alice' });
    const second = await assign(task.id, { assignee: 'Alice' });

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });
});

describe('PATCH /tasks/:id/assign - errors', () => {
  test('returns 404 for a task that does not exist', async () => {
    const res = await assign('does-not-exist', { assignee: 'Alice' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Task not found' });
  });

  test.each([
    ['is missing', {}],
    ['is an empty string', { assignee: '' }],
    ['is only whitespace', { assignee: '     ' }],
    ['is null', { assignee: null }],
    ['is a number', { assignee: 123 }],
    ['is a boolean', { assignee: true }],
    ['is an array', { assignee: ['Alice'] }],
    ['is an object', { assignee: { name: 'Alice' } }],
  ])('returns 400 when assignee %s', async (_label, body) => {
    const task = await createTask();
    const res = await assign(task.id, body);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/assignee/);
  });

  test('returns 400 when assignee is longer than 100 characters', async () => {
    const task = await createTask();
    const res = await assign(task.id, { assignee: 'a'.repeat(101) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/100/);
  });

  test('a rejected request leaves the existing assignee untouched', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Alice' });

    await assign(task.id, { assignee: '' });
    expect(taskService.findById(task.id).assignee).toBe('Alice');
  });

  test('validation runs before the lookup: bad body + unknown id gives 400', async () => {
    const res = await assign('does-not-exist', { assignee: '' });
    expect(res.status).toBe(400);
  });

  test('sending no body at all returns 400 rather than crashing', async () => {
    const task = await createTask();
    const res = await request(app).patch(`/tasks/${task.id}/assign`);
    expect(res.status).toBe(400);
  });
});
