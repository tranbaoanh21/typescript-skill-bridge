import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

import { ApiError } from './api-error.js';

const validationDetails = (error: ZodError) =>
  error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.join('.'),
  }));

export const handleError: ErrorRequestHandler = (error, request, response, _next) => {
  const requestId = String(request.id);

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        details: validationDetails(error),
        message: 'The request payload is invalid.',
        requestId,
      },
    });
    return;
  }

  if (
    error &&
    typeof error === 'object' &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  ) {
    response.status(400).json({
      error: {
        code: 'MALFORMED_JSON',
        message: 'The request body is not valid JSON.',
        requestId,
      },
    });
    return;
  }

  if (error instanceof ApiError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        ...(error.details === undefined ? {} : { details: error.details }),
        message: error.message,
        requestId,
      },
    });
    return;
  }

  request.log.error({ error }, 'Unhandled request error');
  response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
      requestId,
    },
  });
};
