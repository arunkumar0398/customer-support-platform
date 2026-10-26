import type { ErrorRequestHandler, RequestHandler } from 'express';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new ApiError(404, 'NOT_FOUND', 'Resource not found.'));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  // Express identifies error handlers by four declared parameters.
  void next;

  let apiError = new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    apiError = error;
  } else if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.parse.failed') {
      apiError = new ApiError(400, 'MALFORMED_JSON', 'Request body must be valid JSON.');
    } else if (error.type === 'entity.too.large') {
      apiError = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    } else if (error.type === 'charset.unsupported' || error.type === 'encoding.unsupported') {
      apiError = new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Request body encoding is unsupported.');
    }
  }

  if (apiError.status === 500) {
    // Error messages, stacks, URLs, headers and bodies can contain credentials.
    console.error({
      event: 'api_error',
      code: apiError.code,
      status: apiError.status,
      requestId: response.locals.requestId,
    });
  }

  if (response.headersSent) {
    // A new envelope is impossible; close without passing the raw error to a logger.
    response.destroy();
    return;
  }

  response.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      requestId: response.locals.requestId,
    },
  });
};
