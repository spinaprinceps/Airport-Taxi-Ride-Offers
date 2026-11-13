// HTTP only.
import { Router } from 'express';
import { asyncRoute } from '../errors.js';
import * as sharing from '../services/sharing.js';

export const sharingRouter = Router();

sharingRouter.get('/suppliers/:companyId/shareable-pairs', asyncRoute(async (req, res) => {
  res.json(await sharing.listShareablePairs(req.params.companyId));
}));

sharingRouter.post('/suppliers/:companyId/shared-offers', asyncRoute(async (req, res) => {
  res.status(201).json(await sharing.createSharedOffer(req.params.companyId, req.body));
}));
