// HTTP only.
import { Router } from 'express';
import { asyncRoute } from '../errors.js';
import * as changes from '../services/changes.js';

export const changesRouter = Router();

changesRouter.post('/bookings/:bookingNumber/change-requests', asyncRoute(async (req, res) => {
  res.status(201).json(await changes.submitChange(req.params.bookingNumber, req.body));
}));

changesRouter.get('/suppliers/:companyId/change-requests', asyncRoute(async (req, res) => {
  res.json(await changes.listSupplierChanges(req.params.companyId));
}));

changesRouter.post('/suppliers/:companyId/change-requests/:changeId/accept', asyncRoute(async (req, res) => {
  res.json(await changes.acceptChange(req.params.companyId, req.params.changeId));
}));

changesRouter.post('/suppliers/:companyId/change-requests/:changeId/reject', asyncRoute(async (req, res) => {
  res.json(await changes.rejectChange(req.params.companyId, req.params.changeId, req.body));
}));
