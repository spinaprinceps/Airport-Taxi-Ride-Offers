// HTTP only.
import { Router } from 'express';
import { asyncRoute } from '../errors.js';
import * as offers from '../services/offers.js';

export const offersRouter = Router();

offersRouter.post('/suppliers/:companyId/requests/:requestId/offers', asyncRoute(async (req, res) => {
  res.status(201).json(await offers.createOffer(req.params.companyId, req.params.requestId, req.body));
}));

offersRouter.get('/suppliers/:companyId/offers', asyncRoute(async (req, res) => {
  res.json(await offers.listSupplierOffers(req.params.companyId));
}));
