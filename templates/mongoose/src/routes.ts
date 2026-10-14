import { Router } from 'express';
import accountRouter from './app/modules/account/account.route.js';
import profileRoute from './app/modules/profile/profile.route.js';

const appRouter = Router();

const moduleRoutes = [
  { path: '/profile', route: profileRoute },
  { path: '/auth', route: accountRouter },
];

moduleRoutes.forEach((route) => appRouter.use(route.path, route.route));
export default appRouter;
