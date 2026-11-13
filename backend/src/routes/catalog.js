// HTTP only.
import { Router } from 'express';
import { asyncRoute } from '../errors.js';
import * as catalog from '../services/catalog.js';

export const catalogRouter = Router();

catalogRouter.get('/suppliers', asyncRoute(async (req, res) => {
  res.json(await catalog.listSuppliers());
}));

catalogRouter.get('/flights', asyncRoute(async (req, res) => {
  res.json(await catalog.listFlights());
}));

catalogRouter.get('/hotels', asyncRoute(async (req, res) => {
  res.json(await catalog.listHotels());
}));

catalogRouter.get('/price-range', asyncRoute(async (req, res) => {
  const { flightId, hotelId } = req.query;
  res.json(await catalog.priceRange(
    typeof flightId === 'string' ? flightId.trim() : '',
    typeof hotelId === 'string' ? hotelId.trim() : '',
  ));
}));
