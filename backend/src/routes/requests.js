// HTTP only.
import { Router } from 'express';
import { asyncRoute } from '../errors.js';
import * as requests from '../services/requests.js';

export const requestsRouter = Router();

requestsRouter.post('/requests', asyncRoute(async (req, res) => {
  const { status, body } = await requests.createRequest(req.body, req.get('Idempotency-Key'));
  res.status(status).json(body);
}));

requestsRouter.get('/requests', asyncRoute(async (req, res) => {
  const traveler = typeof req.query.traveler === 'string' ? req.query.traveler : undefined;
  res.json(await requests.listRequestViews({ traveler }));
}));

requestsRouter.get('/requests/:requestId', asyncRoute(async (req, res) => {
  res.json(await requests.getRequestView(req.params.requestId));
}));
