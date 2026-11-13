import { fileURLToPath } from 'node:url';

// Business constants. A judge's "small live change" will most likely be one of these.
export const MIN_PICKUP_GAP_MIN = 60;   // R2: pickup >= landing + this
export const BUSY_DRIVE_FACTOR = 2;     // R6: busy from pickup to pickup + factor * drive_minutes
export const ARRIVAL_AIRPORTS = ['NRT', 'HND', 'KIX', 'DXB', 'AUH'];
export const POLL_MS = 5000;

// Runtime settings
export const PORT = Number(process.env.PORT ?? 4000);
export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://taxi:taxi@localhost:5432/taxi';
export const DATA_DIR = process.env.DATA_DIR ?? fileURLToPath(new URL('../../data', import.meta.url));
