// Every non-2xx response has the shape { code, message, violations }.
export class AppError extends Error {
  constructor(status, code, message, violations = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.violations = violations;
  }
}

export const validation = (message, violations = []) =>
  new AppError(400, 'VALIDATION', message, violations);
export const forbidden = (message, violations = []) =>
  new AppError(403, 'FORBIDDEN', message, violations);
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message, violations = []) =>
  new AppError(409, 'CONFLICT', message, violations);

export function ruleViolation(violations) {
  const n = violations.length;
  const message = n === 1 ? violations[0].message : `The request breaks ${n} rules.`;
  return new AppError(422, 'RULE_VIOLATION', message, violations);
}

// Express 4 does not catch rejected promises; wrap every async handler.
export const asyncRoute = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// A violation: { rule: 'R3', field: 'priceInr', message: '...' }
export const v = (rule, field, message) => ({ rule, field, message });
