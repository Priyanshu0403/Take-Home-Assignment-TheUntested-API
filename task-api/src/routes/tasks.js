const express = require('express');
const router = express.Router();
const taskService = require('../services/taskService');
const {
  validateCreateTask,
  validateUpdateTask,
  validateAssignTask,
} = require('../utils/validators');

// Parses a query-string value as a positive integer, or returns `fallback`
// for anything else (missing, non-numeric, zero, negative).
// FIX (BUG-1, hardening): with the corrected 1-based offset, a negative page
// would make `slice()` count from the END of the array and return the wrong
// rows, so non-positive values must be normalised before reaching the service.
const toPositiveInt = (value, fallback) => {
  const n = parseInt(value, 10);
  return n > 0 ? n : fallback;
};

router.get('/stats', (req, res) => {
  const stats = taskService.getStats();
  res.json(stats);
});

router.get('/', (req, res) => {
  const { status, page, limit } = req.query;

  if (status) {
    const tasks = taskService.getByStatus(status);
    return res.json(tasks);
  }

  if (page !== undefined || limit !== undefined) {
    const pageNum = toPositiveInt(page, 1);
    const limitNum = toPositiveInt(limit, 10);
    const tasks = taskService.getPaginated(pageNum, limitNum);
    return res.json(tasks);
  }

  const tasks = taskService.getAll();
  res.json(tasks);
});

router.post('/', (req, res) => {
  const error = validateCreateTask(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const task = taskService.create(req.body);
  res.status(201).json(task);
});

router.put('/:id', (req, res) => {
  const error = validateUpdateTask(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const task = taskService.update(req.params.id, req.body);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json(task);
});

router.delete('/:id', (req, res) => {
  const deleted = taskService.remove(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.status(204).send();
});

router.patch('/:id/complete', (req, res) => {
  const task = taskService.completeTask(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json(task);
});

// PATCH /tasks/:id/assign   body: { "assignee": "Alice" }
//
// Behaviour:
//   200 + updated task  -> assigned (also when re-assigning; see below)
//   400                 -> assignee missing / not a string / empty / too long
//   404                 -> no task with that id
//
// Already-assigned tasks: re-assignment is ALLOWED and simply replaces the
// previous assignee (idempotent if the name is the same). Handing work over to
// someone else is a normal workflow, and PATCH is defined as "modify this
// field", so a 409 Conflict would only get in the way. If the product later
// needs "claim only if unassigned", that can be a separate rule (409).
//
// Order of checks matches PUT /:id in this file: validate the body first (400),
// then look the task up (404).
router.patch('/:id/assign', (req, res) => {
  const error = validateAssignTask(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const task = taskService.assignTask(req.params.id, req.body.assignee);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json(task);
});

module.exports = router;
