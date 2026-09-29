/**
 * Integration tests for the HTTP layer (src/routes/tasks.js + src/app.js)
 *
 * Uses Supertest to drive the real Express app in-process (no port is opened).
 * The store is reset before every test so tests are independent and can run in
 * any order.
 *
 * Tests marked `test.failing` document known bugs that are intentionally left
 * unfixed (see BUG_REPORT.md). They pass today; when someone fixes the bug
 * they will start failing, which is the cue to change them to plain `test`.
 */
const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

// Small helper so tests read as "given a task ..." rather than HTTP plumbing.
const createTask = async (body = { title: 'A task' }) => {
  const res = await request(app).post('/tasks').send(body);
  expect(res.status).toBe(201);
  return res.body;
};

beforeEach(() => {
  taskService._reset();
});

// ---------------------------------------------------------------------------
describe('POST /tasks', () => {
  test('creates a task with defaults and returns 201', async () => {
    const res = await request(app).post('/tasks').send({ title: 'Write tests' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Write tests',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      completedAt: null,
      assignee: null,
    });
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.createdAt).toEqual(expect.any(String));
  });

  test('accepts all optional fields', async () => {
    const res = await request(app).post('/tasks').send({
      title: 'Full',
      description: 'everything',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-05-01T10:00:00.000Z',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      description: 'everything',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-05-01T10:00:00.000Z',
    });
  });

  test('the created task can be fetched from GET /tasks', async () => {
    const created = await createTask({ title: 'persisted' });
    const list = await request(app).get('/tasks');
    expect(list.body).toEqual([created]);
  });

  test.each([
    ['title is missing', {}],
    ['title is empty', { title: '' }],
    ['title is whitespace', { title: '   ' }],
    ['title is not a string', { title: 42 }],
    ['status is invalid', { title: 't', status: 'pending' }],
    ['priority is invalid', { title: 't', priority: 'urgent' }],
    ['dueDate is not a date', { title: 't', dueDate: 'garbage' }],
  ])('returns 400 when %s', async (_label, body) => {
    const res = await request(app).post('/tasks').send(body);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('does not store anything when validation fails', async () => {
    await request(app).post('/tasks').send({ title: '' });
    expect(taskService.getAll()).toEqual([]);
  });

  // BUG-6 (documented, not fixed): body-parser's JSON syntax error reaches the
  // catch-all error handler, which answers 500 instead of 400.
  test.failing('returns 400 (not 500) for malformed JSON', async () => {
    // The error handler logs every error with console.error; silence it so the
    // expected stack trace does not clutter the test output.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await request(app)
        .post('/tasks')
        .set('Content-Type', 'application/json')
        .send('{"title": "broken"');
      expect(res.status).toBe(400);
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
describe('GET /tasks', () => {
  test('returns an empty array when there are no tasks', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns all tasks', async () => {
    await createTask({ title: 'one' });
    await createTask({ title: 'two' });
    const res = await request(app).get('/tasks');
    expect(res.body.map((t) => t.title)).toEqual(['one', 'two']);
  });

  describe('?status= filter', () => {
    beforeEach(async () => {
      await createTask({ title: 'a', status: 'todo' });
      await createTask({ title: 'b', status: 'in_progress' });
      await createTask({ title: 'c', status: 'done' });
    });

    test('returns only tasks with that status', async () => {
      const res = await request(app).get('/tasks?status=in_progress');
      expect(res.status).toBe(200);
      expect(res.body.map((t) => t.title)).toEqual(['b']);
    });

    test('returns an empty array when nothing matches', async () => {
      const res = await request(app).get('/tasks?status=archived');
      expect(res.body).toEqual([]);
    });

    // BUG-2 (fixed)
    test('does not partially match: ?status=do returns nothing', async () => {
      const res = await request(app).get('/tasks?status=do');
      expect(res.body).toEqual([]);
    });

    // BUG-8 (documented, not fixed): `status` short-circuits pagination.
    test.failing('can be combined with pagination', async () => {
      await createTask({ title: 'd', status: 'todo' });
      await createTask({ title: 'e', status: 'todo' });
      const res = await request(app).get('/tasks?status=todo&page=1&limit=2');
      expect(res.body).toHaveLength(2);
    });
  });

  describe('pagination (?page=&limit=)', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 15; i++) await createTask({ title: `task-${i}` });
    });

    // BUG-1 (fixed)
    test('page=1 returns the first `limit` tasks', async () => {
      const res = await request(app).get('/tasks?page=1&limit=5');
      expect(res.status).toBe(200);
      expect(res.body.map((t) => t.title)).toEqual(['task-1', 'task-2', 'task-3', 'task-4', 'task-5']);
    });

    test('page=2 returns the next slice', async () => {
      const res = await request(app).get('/tasks?page=2&limit=5');
      expect(res.body.map((t) => t.title)).toEqual(['task-6', 'task-7', 'task-8', 'task-9', 'task-10']);
    });

    test('defaults to page 1 and limit 10 when only one is given', async () => {
      const onlyLimit = await request(app).get('/tasks?limit=3');
      expect(onlyLimit.body.map((t) => t.title)).toEqual(['task-1', 'task-2', 'task-3']);

      const onlyPage = await request(app).get('/tasks?page=1');
      expect(onlyPage.body).toHaveLength(10);
    });

    test('the last page can be partial', async () => {
      const res = await request(app).get('/tasks?page=2&limit=10');
      expect(res.body.map((t) => t.title)).toEqual([
        'task-11', 'task-12', 'task-13', 'task-14', 'task-15',
      ]);
    });

    test('a page past the end returns an empty array', async () => {
      const res = await request(app).get('/tasks?page=50&limit=10');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    test.each([
      ['page=0', '?page=0&limit=5'],
      ['page=-3', '?page=-3&limit=5'],
      ['page=abc', '?page=abc&limit=5'],
    ])('falls back to the first page for invalid input (%s)', async (_label, qs) => {
      const res = await request(app).get(`/tasks${qs}`);
      expect(res.status).toBe(200);
      expect(res.body.map((t) => t.title)).toEqual(['task-1', 'task-2', 'task-3', 'task-4', 'task-5']);
    });

    test.each([
      ['limit=0', '?page=1&limit=0'],
      ['limit=-5', '?page=1&limit=-5'],
      ['limit=xyz', '?page=1&limit=xyz'],
    ])('falls back to the default limit of 10 for invalid input (%s)', async (_label, qs) => {
      const res = await request(app).get(`/tasks${qs}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(10);
    });
  });
});

// ---------------------------------------------------------------------------
describe('PUT /tasks/:id', () => {
  test('updates the provided fields and returns the task', async () => {
    const task = await createTask({ title: 'old', priority: 'low' });
    const res = await request(app)
      .put(`/tasks/${task.id}`)
      .send({ title: 'new', priority: 'high', status: 'in_progress', description: 'updated' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: task.id,
      title: 'new',
      priority: 'high',
      status: 'in_progress',
      description: 'updated',
    });
  });

  test('the change is persisted', async () => {
    const task = await createTask({ title: 'old' });
    await request(app).put(`/tasks/${task.id}`).send({ title: 'new' });
    const list = await request(app).get('/tasks');
    expect(list.body[0].title).toBe('new');
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).put('/tasks/does-not-exist').send({ title: 'x' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Task not found' });
  });

  test.each([
    ['empty title', { title: '' }],
    ['invalid status', { status: 'nope' }],
    ['invalid priority', { priority: 'nope' }],
    ['invalid dueDate', { dueDate: 'nope' }],
  ])('returns 400 for %s and leaves the task unchanged', async (_label, body) => {
    const task = await createTask({ title: 'stable' });
    const res = await request(app).put(`/tasks/${task.id}`).send(body);
    expect(res.status).toBe(400);
    expect(taskService.findById(task.id)).toEqual(task);
  });

  // BUG-4 (documented, not fixed)
  test.failing('cannot overwrite id / createdAt through the request body', async () => {
    const task = await createTask({ title: 'protected' });
    const res = await request(app)
      .put(`/tasks/${task.id}`)
      .send({ id: 'hijacked', createdAt: '1999-01-01T00:00:00.000Z' });
    expect(res.body.id).toBe(task.id);
    expect(res.body.createdAt).toBe(task.createdAt);
  });

  // BUG-7 (documented, not fixed): completedAt is only maintained by
  // PATCH /:id/complete, not when status changes through PUT.
  test.failing('setting status to "done" via PUT also sets completedAt', async () => {
    const task = await createTask({ title: 'finish via put' });
    const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'done' });
    expect(res.body.completedAt).not.toBeNull();
  });

  test.failing('moving a task back out of "done" via PUT clears completedAt', async () => {
    const task = await createTask({ title: 'reopen' });
    await request(app).patch(`/tasks/${task.id}/complete`);
    const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'todo' });
    expect(res.body.completedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('DELETE /tasks/:id', () => {
  test('deletes the task and returns 204 with an empty body', async () => {
    const task = await createTask();
    const res = await request(app).delete(`/tasks/${task.id}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect((await request(app).get('/tasks')).body).toEqual([]);
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).delete('/tasks/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Task not found' });
  });

  test('deleting the same task twice returns 404 the second time', async () => {
    const task = await createTask();
    await request(app).delete(`/tasks/${task.id}`);
    const second = await request(app).delete(`/tasks/${task.id}`);
    expect(second.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe('PATCH /tasks/:id/complete', () => {
  test('marks the task done and sets completedAt', async () => {
    const task = await createTask({ title: 'finish' });
    const res = await request(app).patch(`/tasks/${task.id}/complete`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(new Date(res.body.completedAt).toString()).not.toBe('Invalid Date');
  });

  // BUG-3 (fixed)
  test.each(['low', 'medium', 'high'])('preserves the task priority (%s)', async (priority) => {
    const task = await createTask({ title: 'p', priority });
    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.body.priority).toBe(priority);
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).patch('/tasks/does-not-exist/complete');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Task not found' });
  });

  test('completed tasks show up under ?status=done', async () => {
    const task = await createTask({ title: 'finish' });
    await request(app).patch(`/tasks/${task.id}/complete`);
    const res = await request(app).get('/tasks?status=done');
    expect(res.body.map((t) => t.id)).toEqual([task.id]);
  });

  // BUG-5 (documented, not fixed)
  test.failing('completing twice keeps the first completedAt', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout'] });
    try {
      const task = await createTask({ title: 'twice' });
      jest.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
      const first = await request(app).patch(`/tasks/${task.id}/complete`);
      jest.setSystemTime(new Date('2030-06-01T00:00:00.000Z'));
      const second = await request(app).patch(`/tasks/${task.id}/complete`);
      expect(second.body.completedAt).toBe(first.body.completedAt);
    } finally {
      jest.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
describe('GET /tasks/stats', () => {
  const past = new Date(Date.now() - 86400000).toISOString();
  const future = new Date(Date.now() + 86400000).toISOString();

  test('returns zeros when empty', async () => {
    const res = await request(app).get('/tasks/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  test('counts tasks by status and reports overdue tasks', async () => {
    await createTask({ title: '1', status: 'todo', dueDate: past });
    await createTask({ title: '2', status: 'in_progress', dueDate: future });
    await createTask({ title: '3', status: 'done', dueDate: past }); // done => never overdue
    await createTask({ title: '4', status: 'todo' });

    const res = await request(app).get('/tasks/stats');
    expect(res.body).toEqual({ todo: 2, in_progress: 1, done: 1, overdue: 1 });
  });

  test('is routed to the stats handler, not treated as a task id', async () => {
    // Guards against a route-ordering regression (a future `/:id` route
    // registered above `/stats` would swallow this request).
    const res = await request(app).get('/tasks/stats');
    expect(res.body).toHaveProperty('overdue');
  });

  test('completing a task moves it from its old bucket to "done"', async () => {
    const task = await createTask({ title: 'x', status: 'todo' });
    await request(app).patch(`/tasks/${task.id}/complete`);
    const res = await request(app).get('/tasks/stats');
    expect(res.body).toMatchObject({ todo: 0, done: 1 });
  });
});

// ---------------------------------------------------------------------------
describe('misc', () => {
  test('GET /health reports ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('GET / returns a small API description', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Task API', status: 'ok' });
    expect(res.body.endpoints).toEqual(expect.arrayContaining([expect.stringContaining('/assign')]));
  });

  test('unknown routes return 404', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
  });
});
