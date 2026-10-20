import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isAppError } from '../lib/errors.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const correlationId = req.correlationId;

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        correlationId,
        details: err.flatten(),
      },
    });
    return;
  }

  if (isAppError(err)) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        correlationId,
        details: err.details,
      },
    });
    return;
  }

  console.error(JSON.stringify({ correlationId, err: String(err) }));
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      correlationId,
    },
  });
}
