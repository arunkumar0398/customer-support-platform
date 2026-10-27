import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { createAuthRouter } from './modules/auth/routes.js';
import type { AuthOptions } from './modules/auth/session.js';
import { createMembershipRouter } from './modules/memberships/routes.js';
import { createTicketRouter } from './modules/tickets/routes.js';
import { createDashboardRouter } from './modules/dashboard/routes.js';
import { createHealthRouter } from './modules/health.js';

export function createApp(options: AuthOptions = {}) {
  const application = express();
  application.disable('x-powered-by');
  application.use(requestIdMiddleware);
  application.use(express.json({ limit: '32kb', inflate: false }));
  application.use('/api/health', createHealthRouter(options));
  application.use('/api/auth', createAuthRouter(options));
  application.use('/api/memberships', createMembershipRouter(options));
  application.use('/api/tickets', createTicketRouter(options));
  application.use('/api/dashboard', createDashboardRouter(options));
  application.use(notFoundHandler);
  application.use(errorHandler);
  return application;
}

export const app = createApp();
export default app;
