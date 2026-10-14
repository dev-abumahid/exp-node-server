import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { configs } from './app/configs/index.js';
import globalErrorHandler from './app/middlewares/global_error_handler.js';
import notFound from './app/middlewares/not_found_api.js';
import { apiRateLimiter } from './app/middlewares/rate_limiter.js';
import { setupPassport } from './app/passport-js/index.js';
import manageResponse from './app/utils/manage_response.js';
import appRouter from './routes.js';
import { swaggerOptions } from './swaggerOptions.js';

// define app
const app = express();

// number of reverse proxies in front of the app (e.g. 1 behind Caddy/Nginx), so
// req.ip and rate limiting see the real client IP. Keep 0 when exposed directly.
app.set('trust proxy', configs.trust_proxy);
app.disable('x-powered-by');

// security headers
app.use(helmet());

// swagger docs (disabled in production unless ENABLE_SWAGGER=true)
if (configs.enable_swagger) {
  const swaggerSpec = swaggerJSDoc(swaggerOptions);
  app.use(
    '/docs',
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec),
  );
}

// cors middleware
app.use(
  cors({
    origin: configs.cors_origins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
    credentials: true,
  }),
);

// express middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// passport js (social login)
setupPassport(app);

// Main router (stricter per-route limits live on the auth routes)
app.use('/api', apiRateLimiter, appRouter);

// stating point
app.get('/', (_req: Request, res: Response) => {
  manageResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Server is running successful !!',
    data: null,
  });
});

// not found, then global error handler (must be last)
app.use(notFound);
app.use(globalErrorHandler);

// export app
export default app;
