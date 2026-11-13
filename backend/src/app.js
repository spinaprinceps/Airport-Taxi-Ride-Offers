import express from 'express';
import { ZodError } from 'zod';
import { AppError } from './errors.js';
import { catalogRouter } from './routes/catalog.js';
import { requestsRouter } from './routes/requests.js';
import { dashboardRouter } from './routes/dashboard.js';
import { offersRouter } from './routes/offers.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Feature routers are mounted here slice by slice.
  app.use('/api', catalogRouter);
  app.use('/api', requestsRouter);
  app.use('/api', dashboardRouter);
  app.use('/api', offersRouter);

  app.use('/api', (req, res) => {
    res.status(404).json({ code: 'NOT_FOUND', message: `No route ${req.method} ${req.originalUrl}`, violations: [] });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ code: err.code, message: err.message, violations: err.violations });
    }
    if (err instanceof ZodError) {
      const violations = err.issues.map((i) => ({ rule: null, field: i.path.join('.'), message: i.message }));
      return res.status(400).json({ code: 'VALIDATION', message: 'The request body has the wrong shape.', violations });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ code: 'VALIDATION', message: 'Body is not valid JSON.', violations: [] });
    }
    console.error(err);
    res.status(500).json({ code: 'INTERNAL', message: 'Something went wrong.', violations: [] });
  });

  return app;
}
