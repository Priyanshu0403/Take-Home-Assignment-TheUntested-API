const { v4: uuidv4 } = require('uuid');

let tasks = [];

const getAll = () => [...tasks];

const findById = (id) => tasks.find((t) => t.id === id);

// FIX (BUG-2): previously `t.status.includes(status)`, which is a *substring*
// match - "do" matched both "todo" and "done". Statuses are a closed set of
// enum values, so an exact comparison is the correct semantics.
const getByStatus = (status) => tasks.filter((t) => t.status === status);

// `page` is 1-based (page 1 = the first `limit` tasks).
// FIX (BUG-1): the offset used to be `page * limit`, which treats `page` as
// 0-based. Page 1 therefore skipped the first `limit` tasks, and because the
// route coerces page=0 to 1, those first tasks could never be reached at all.
const getPaginated = (page, limit) => {
  const offset = (page - 1) * limit;
  return tasks.slice(offset, offset + limit);
};

const getStats = () => {
  const now = new Date();
  const counts = { todo: 0, in_progress: 0, done: 0 };
  let overdue = 0;

  tasks.forEach((t) => {
    if (counts[t.status] !== undefined) counts[t.status]++;
    if (t.dueDate && t.status !== 'done' && new Date(t.dueDate) < now) {
      overdue++;
    }
  });

  return { ...counts, overdue };
};

const create = ({ title, description = '', status = 'todo', priority = 'medium', dueDate = null }) => {
  const task = {
    id: uuidv4(),
    title,
    description,
    status,
    priority,
    dueDate,
    completedAt: null,
    assignee: null, // set via PATCH /tasks/:id/assign
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  return task;
};

const update = (id, fields) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const updated = { ...tasks[index], ...fields };
  tasks[index] = updated;
  return updated;
};

const remove = (id) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return false;

  tasks.splice(index, 1);
  return true;
};

const completeTask = (id) => {
  const task = findById(id);
  if (!task) return null;

  // FIX (BUG-3): this used to also set `priority: 'medium'`, silently
  // downgrading (or upgrading) the priority of every task that was completed.
  // Completing a task should only change its status and completedAt.
  const updated = {
    ...task,
    status: 'done',
    completedAt: new Date().toISOString(),
  };

  const index = tasks.findIndex((t) => t.id === id);
  tasks[index] = updated;
  return updated;
};

// Sets (or replaces) the assignee of a task. Returns the updated task, or null
// if the task does not exist. Input validation (non-empty string, max length)
// lives in validators.validateAssignTask - by the time we get here the value is
// already known to be a string; we only trim it so " Alice " and "Alice" are
// stored identically.
const assignTask = (id, assignee) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const updated = { ...tasks[index], assignee: assignee.trim() };
  tasks[index] = updated;
  return updated;
};

const _reset = () => {
  tasks = [];
};

module.exports = {
  getAll,
  findById,
  getByStatus,
  getPaginated,
  getStats,
  create,
  update,
  remove,
  completeTask,
  assignTask,
  _reset,
};
