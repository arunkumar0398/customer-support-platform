import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { createAuthRouter } from './modules/auth/routes.js';
import type { AuthOptions } from './modules/auth/session.js';
import { createMembershipRouter } from './modules/memberships/routes.js';

export function createApp(options: AuthOptions = {}) {
  const application = express();
  application.disable('x-powered-by');
  application.use(requestIdMiddleware);
  application.use(express.json({ limit: '32kb', inflate: false }));
  application.get('/api/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });
  application.use('/api/auth', createAuthRouter(options));
  application.use('/api/memberships', createMembershipRouter(options));
  application.use(notFoundHandler);
  application.use(errorHandler);
  return application;
}

export const app = createApp();
export default app;
