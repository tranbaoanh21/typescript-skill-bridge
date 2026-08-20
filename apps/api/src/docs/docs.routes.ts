import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import { openApiDocument } from './openapi.js';

export const createDocsRouter = () => {
  const router = Router();

  router.get('/openapi.json', (_request, response) => {
    response.status(200).json(openApiDocument);
  });

  router.use((_request, response, next) => {
    response.removeHeader('content-security-policy');
    next();
  });
  router.use(
    '/',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'HCMUT SkillBridge API',
      swaggerOptions: { displayRequestDuration: true, persistAuthorization: true },
    }),
  );

  return router;
};
