/**
 * Unit tests for src/services/taskService.js
 *
 * These call the service functions directly (no HTTP). The service keeps an
 * in-memory array, so every test starts from a clean slate via _reset().
 *
 * Testing philosophy: each test asserts the behaviour a caller would EXPECT,
 * not whatever the code currently happens to do. Where the current code
 * disagrees, the test is either:
 *   - a normal test (the bug has been fixed - see BUG_REPORT.md), or
 *   - marked `test.failing` (the bug is documented but intentionally left
 *     unfixed). `test.failing` passes while the bug exists and will start
 *     FAILING the moment someone fixes it, which is the signal to flip it to
 *     a normal `test`.
 */
const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

describe('create', () => {
  test('creates a task with defaults for optional fields', () => {
    const task = taskService.create({ title: 'Write tests' });

    expect(task).toMatchObject({
      title: 'Write tests',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      completedAt: null,
      assignee: null,
    });
    expect(task.id).toEqual(expect.any(String));
    expect(new Date(task.createdAt).toString()).not.toBe('Invalid Date');
  });

  test('respects explicitly provided fields', () => {
    const due = '2030-01-01T00:00:00.000Z';
    const task = taskService.create({
      title: 'Ship',
      description: 'to prod',
      status: 'in_progress',
      priority: 'high',
      dueDate: due,
    });

    expect(task).toMatchObject({
      description: 'to prod',
      status: 'in_progress',
      priority: 'high',
      dueDate: due,
    });
  });

  test('generates a unique id for each task', () => {
    const a = taskService.create({ title: 'a' });
    const b = taskService.create({ title: 'b' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('getAll / findById', () => {
  test('getAll returns an empty array when there are no tasks', () => {
    expect(taskService.getAll()).toEqual([]);
  });

  test('getAll returns every task in insertion order', () => {
    taskService.create({ title: 'first' });
    taskService.create({ title: 'second' });
    expect(taskService.getAll().map((t) => t.title)).toEqual(['first', 'second']);
  });

  test('getAll returns a copy - mutating the array does not affect the store', () => {
    taskService.create({ title: 'only' });
    const list = taskService.getAll();
    list.pop();
    expect(taskService.getAll()).toHaveLength(1);
  });

  test('findById returns the task, or undefined when missing', () => {
    const t = taskService.create({ title: 'find me' });
    expect(taskService.findById(t.id)).toEqual(t);
    expect(taskService.findById('nope')).toBeUndefined();
  });
});

describe('getByStatus', () => {
  beforeEach(() => {
    taskService.create({ title: 'a', status: 'todo' });
    taskService.create({ title: 'b', status: 'in_progress' });
    taskService.create({ title: 'c', status: 'done' });
    taskService.create({ title: 'd', status: 'todo' });
  });

  test('returns only tasks with the exact status', () => {
    expect(taskService.getByStatus('todo').map((t) => t.title)).toEqual(['a', 'd']);
    expect(taskService.getByStatus('in_progress').map((t) => t.title)).toEqual(['b']);
    expect(taskService.getByStatus('done').map((t) => t.title)).toEqual(['c']);
  });

  test('returns an empty array for an unknown status', () => {
    expect(taskService.getByStatus('archived')).toEqual([]);
  });

  // BUG-2 (fixed): getByStatus used String.includes(), i.e. substring matching.
  test('does NOT do partial matching ("do" must not match "todo" or "done")', () => {
    expect(taskService.getByStatus('do')).toEqual([]);
    expect(taskService.getByStatus('progress')).toEqual([]);
    expect(taskService.getByStatus('d')).toEqual([]);
  });
});

describe('getPaginated', () => {
  beforeEach(() => {
    for (let i = 1; i <= 25; i++) taskService.create({ title: `task-${i}` });
  });

  // BUG-1 (fixed): offset was `page * limit`, so page 1 skipped the first page.
  test('page 1 returns the FIRST `limit` tasks', () => {
    const result = taskService.getPaginated(1, 10);
    expect(result).toHaveLength(10);
    expect(result[0].title).toBe('task-1');
    expect(result[9].title).toBe('task-10');
  });

  test('page 2 returns the next slice', () => {
    const result = taskService.getPaginated(2, 10);
    expect(result.map((t) => t.title)).toEqual(
      Array.from({ length: 10 }, (_, i) => `task-${11 + i}`)
    );
  });

  test('the last page may be partially filled', () => {
    const result = taskService.getPaginated(3, 10);
    expect(result.map((t) => t.title)).toEqual([
      'task-21', 'task-22', 'task-23', 'task-24', 'task-25',
    ]);
  });

  test('a page beyond the data returns an empty array', () => {
    expect(taskService.getPaginated(99, 10)).toEqual([]);
  });

  test('walking every page returns each task exactly once', () => {
    const seen = [];
    for (let page = 1; page <= 3; page++) {
      seen.push(...taskService.getPaginated(page, 10).map((t) => t.title));
    }
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
  });
});

describe('getStats', () => {
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  test('returns all zeros when there are no tasks', () => {
    expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  test('counts tasks per status', () => {
    taskService.create({ title: '1', status: 'todo' });
    taskService.create({ title: '2', status: 'todo' });
    taskService.create({ title: '3', status: 'in_progress' });
    taskService.create({ title: '4', status: 'done' });

    expect(taskService.getStats()).toEqual({ todo: 2, in_progress: 1, done: 1, overdue: 0 });
  });

  test('ignores tasks whose status is not a known bucket instead of crashing', () => {
    // Can only happen through the BUG-9 loophole (empty-string status), but
    // getStats must stay robust regardless of how the bad data got in.
    taskService.create({ title: 'odd', status: '' });
    taskService.create({ title: 'normal', status: 'todo' });
    expect(taskService.getStats()).toEqual({ todo: 1, in_progress: 0, done: 0, overdue: 0 });
  });

  test('counts a task as overdue only if it is past due AND not done', () => {
    taskService.create({ title: 'late todo', status: 'todo', dueDate: past });
    taskService.create({ title: 'late in progress', status: 'in_progress', dueDate: past });
    taskService.create({ title: 'late but done', status: 'done', dueDate: past });
    taskService.create({ title: 'future', status: 'todo', dueDate: future });
    taskService.create({ title: 'no due date', status: 'todo' });

    expect(taskService.getStats().overdue).toBe(2);
  });
});

describe('update', () => {
  test('merges the given fields into the task and returns it', () => {
    const t = taskService.create({ title: 'old', priority: 'low' });
    const updated = taskService.update(t.id, { title: 'new', priority: 'high' });

    expect(updated).toMatchObject({ id: t.id, title: 'new', priority: 'high' });
    expect(taskService.findById(t.id)).toMatchObject({ title: 'new', priority: 'high' });
  });

  test('leaves fields that were not provided untouched', () => {
    const t = taskService.create({ title: 'keep', description: 'desc' });
    const updated = taskService.update(t.id, { priority: 'low' });
    expect(updated.title).toBe('keep');
    expect(updated.description).toBe('desc');
  });

  test('returns null for an unknown id', () => {
    expect(taskService.update('missing', { title: 'x' })).toBeNull();
  });

  // BUG-4 (documented, not fixed): the service spreads `fields` blindly, so a
  // caller can overwrite server-controlled fields.
  test.failing('does not let callers overwrite server-controlled fields (id, createdAt)', () => {
    const t = taskService.create({ title: 'protected' });
    const updated = taskService.update(t.id, { id: 'hijacked', createdAt: '1999-01-01T00:00:00.000Z' });
    expect(updated.id).toBe(t.id);
    expect(updated.createdAt).toBe(t.createdAt);
  });
});

describe('remove', () => {
  test('removes an existing task and returns true', () => {
    const t = taskService.create({ title: 'bye' });
    expect(taskService.remove(t.id)).toBe(true);
    expect(taskService.getAll()).toEqual([]);
  });

  test('returns false for an unknown id and removes nothing', () => {
    taskService.create({ title: 'stay' });
    expect(taskService.remove('missing')).toBe(false);
    expect(taskService.getAll()).toHaveLength(1);
  });

  test('only removes the targeted task', () => {
    const a = taskService.create({ title: 'a' });
    const b = taskService.create({ title: 'b' });
    taskService.remove(a.id);
    expect(taskService.getAll().map((t) => t.id)).toEqual([b.id]);
  });
});

describe('completeTask', () => {
  test('marks the task done and sets completedAt', () => {
    const t = taskService.create({ title: 'finish me' });
    const done = taskService.completeTask(t.id);

    expect(done.status).toBe('done');
    expect(new Date(done.completedAt).toString()).not.toBe('Invalid Date');
    expect(taskService.findById(t.id).status).toBe('done');
  });

  test('returns null for an unknown id', () => {
    expect(taskService.completeTask('missing')).toBeNull();
  });

  // BUG-3 (fixed): completeTask hard-coded `priority: 'medium'`.
  test.each(['low', 'medium', 'high'])('does not change the priority (%s)', (priority) => {
    const t = taskService.create({ title: 'p', priority });
    expect(taskService.completeTask(t.id).priority).toBe(priority);
  });

  test('does not modify any other field', () => {
    const t = taskService.create({
      title: 'keep', description: 'd', dueDate: '2030-01-01T00:00:00.000Z', priority: 'high',
    });
    const done = taskService.completeTask(t.id);
    expect(done).toMatchObject({
      id: t.id, title: 'keep', description: 'd', dueDate: t.dueDate, createdAt: t.createdAt,
    });
  });

  // BUG-5 (documented, not fixed): re-completing overwrites the original completedAt.
  test.failing('completing an already-completed task keeps the original completedAt', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
      const t = taskService.create({ title: 'twice' });
      const first = taskService.completeTask(t.id);

      jest.setSystemTime(new Date('2030-06-01T00:00:00.000Z'));
      const second = taskService.completeTask(t.id);

      expect(second.completedAt).toBe(first.completedAt);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('assignTask', () => {
  test('stores the assignee on the task and returns the updated task', () => {
    const t = taskService.create({ title: 'assign me' });
    const assigned = taskService.assignTask(t.id, 'Alice');

    expect(assigned.assignee).toBe('Alice');
    expect(taskService.findById(t.id).assignee).toBe('Alice');
  });

  test('returns null for an unknown id', () => {
    expect(taskService.assignTask('missing', 'Alice')).toBeNull();
  });

  test('re-assigning replaces the previous assignee', () => {
    const t = taskService.create({ title: 'x' });
    taskService.assignTask(t.id, 'Alice');
    expect(taskService.assignTask(t.id, 'Bob').assignee).toBe('Bob');
  });

  test('does not touch any other field', () => {
    const t = taskService.create({ title: 'x', priority: 'high', status: 'in_progress' });
    const assigned = taskService.assignTask(t.id, 'Alice');
    expect(assigned).toEqual({ ...t, assignee: 'Alice' });
  });
});
