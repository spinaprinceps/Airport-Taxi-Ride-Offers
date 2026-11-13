// HTTP only.
import { Router } from 'express';
import { asyncRoute } from '../errors.js';
import * as invites from '../services/invites.js';

export const invitesRouter = Router();

invitesRouter.get('/requests/:requestId/suppliers', asyncRoute(async (req, res) => {
  res.json(await invites.listRequestSuppliers(req.params.requestId));
}));

invitesRouter.post('/requests/:requestId/suppliers/:companyId/ask', asyncRoute(async (req, res) => {
  const { status, body } = await invites.askSupplier(req.params.requestId, req.params.companyId);
  res.status(status).json(body);
}));

invitesRouter.post('/suppliers/:companyId/requests/:requestId/decline', asyncRoute(async (req, res) => {
  res.json(await invites.declineRequest(req.params.companyId, req.params.requestId, req.body));
}));
