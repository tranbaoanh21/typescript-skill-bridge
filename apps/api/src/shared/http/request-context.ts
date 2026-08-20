import { randomUUID } from 'node:crypto';

import type { IncomingMessage, ServerResponse } from 'node:http';

const acceptedRequestId = /^[a-zA-Z0-9._:-]{1,100}$/;

export const createRequestId = (request: IncomingMessage, response: ServerResponse) => {
  const providedRequestId = request.headers['x-request-id'];
  const requestId =
    typeof providedRequestId === 'string' && acceptedRequestId.test(providedRequestId)
      ? providedRequestId
      : randomUUID();

  response.setHeader('x-request-id', requestId);
  return requestId;
};
