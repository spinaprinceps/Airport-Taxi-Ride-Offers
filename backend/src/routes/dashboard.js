// HTTP only.
import { Router } from 'express';
import { asyncRoute } from '../errors.js';
import * as dashboard from '../services/dashboard.js';

export const dashboardRouter = Router();

dashboardRouter.get('/suppliers/:companyId/requests', asyncRoute(async (req, res) => {
  res.json(await dashboard.listForSupplier(req.params.companyId));
}));

dashboardRouter.get('/suppliers/:companyId/requests/:requestId', asyncRoute(async (req, res) => {
  res.json(await dashboard.detailForSupplier(req.params.companyId, req.params.requestId));
}));
