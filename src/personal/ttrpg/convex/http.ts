import { httpRouter } from 'convex/server';

import { auth } from './auth';

/** The address Discord sends people back to after signing in. */
const http = httpRouter();

auth.addHttpRoutes(http);

export default http;
