import { z } from 'zod';
import { ApiError } from '../../middleware/errors.js';

const pageNumber = (maximum: number, fallback: number) => z.string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(maximum))
  .optional()
  .transform((value) => value ?? fallback);

const commentBodySchema = z.object({
  body: z.string().trim().min(1).max(10000),
}).strict();

const commentsQuerySchema = z.object({
  page: pageNumber(1000, 1),
  pageSize: pageNumber(100, 25),
}).strict();

export function parseCommentBody(input: unknown) {
  const result = commentBodySchema.safeParse(input);
  if (!result.success) throw new ApiError(422, 'VALIDATION_ERROR', 'Request body is invalid.');
  return result.data;
}

export function parseCommentsQuery(input: unknown) {
  const result = commentsQuerySchema.safeParse(input);
  if (!result.success) throw new ApiError(422, 'VALIDATION_ERROR', 'Request query is invalid.');
  return result.data;
}
