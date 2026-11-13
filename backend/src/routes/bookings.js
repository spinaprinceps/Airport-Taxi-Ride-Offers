// HTTP only.
import { Router } from 'express';
import { asyncRoute } from '../errors.js';
import * as bookings from '../services/bookings.js';

export const bookingsRouter = Router();

bookingsRouter.get('/bookings/:bookingNumber', asyncRoute(async (req, res) => {
  res.json(await bookings.getBookingSummary(req.params.bookingNumber));
}));

bookingsRouter.post('/offers/:offerId/book', asyncRoute(async (req, res) => {
  const { status, body } = await bookings.bookOffer(req.params.offerId);
  res.status(status).json(body);
}));
