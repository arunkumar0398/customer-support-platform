import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { requestIdMiddleware } from './middleware/request-id.js';

export const app = express();

app.disable('x-powered-by');
app.use(requestIdMiddleware);
app.use(express.json({ limit: '32kb', inflate: false }));
app.get('/api/health', (_request, response) => {
  response.status(200).json({ status: 'ok' });
});
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
