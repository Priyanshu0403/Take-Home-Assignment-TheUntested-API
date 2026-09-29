const express = require('express');
const taskRoutes = require('./routes/tasks');

const app = express();

app.use(express.json());

// Landing + health endpoints. Not part of the original brief: they exist so a
// deployed instance has something friendly to show at its root URL (instead of
// "Cannot GET /") and so hosting platforms have a health-check path.
app.get('/', (req, res) => {
  res.json({
    name: 'Task API',
    status: 'ok',
    endpoints: [
      'GET    /tasks            (?status=todo|in_progress|done | ?page=1&limit=10)',
      'POST   /tasks',
      'PUT    /tasks/:id',
      'DELETE /tasks/:id',
      'PATCH  /tasks/:id/complete',
      'PATCH  /tasks/:id/assign',
      'GET    /tasks/stats',
      'GET    /health',
    ],
  });
});
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/tasks', taskRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Task API running on port ${PORT}`);
  });
}

module.exports = app;
