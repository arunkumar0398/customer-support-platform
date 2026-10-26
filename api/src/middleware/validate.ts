import type { RequestHandler } from 'express';
import type { ZodObject } from 'zod';
import { ApiError } from './errors.js';

export function validateBody(schema: ZodObject): RequestHandler {
  const strictSchema = schema.strict();
  return (request, _response, next) => {
    const result = strictSchema.safeParse(request.body);
    if (!result.success) {
      next(new ApiError(422, 'VALIDATION_ERROR', 'Request body is invalid.'));
      return;
    }

    request.body = result.data;
    next();
  };
}
