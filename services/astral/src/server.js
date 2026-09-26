import { loadAuthConfig } from './auth/config.js';
import { createHeaderAuthRouter } from './routes/headerAuth.js';
import cors from 'cors';
import dotenv from "dotenv";
import express from "express";
import morgan from 'morgan';
import healthRoutes from "./routes/health.js";
import tokenRoutes from "./routes/token.js";
import usersRoutes from "./routes/users.js";
import apiKeysRoutes from "./routes/apikeys.js";
import { healthz, installGracefulShutdown } from './utils/lifecycle.js';
dotenv.config();

// Throws on a misconfiguration, which stops the process. A service whose job is
// to decide who someone is should not start if it cannot state the rule.
const authConfig = loadAuthConfig();

const app = express();
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Unauthenticated liveness probe, mounted ahead of the
// application routes so nothing can shadow it.
app.use('/healthz', healthz('astral'));

app.use('/token', tokenRoutes);
app.use('/users', usersRoutes);
app.use('/health', healthRoutes);
app.use('/apikeys', apiKeysRoutes);

// Mounted only in trusted-header mode. In the default 'local' mode this route
// does not exist at all, which is a stronger guarantee than a route that exists
// and checks a flag -- there is no code path to reach, however misconfigured
// the rest of the deployment is.
if (authConfig.mode === 'trusted-header') {
    app.use('/auth', createHeaderAuthRouter(authConfig));
    console.log(
        `Astral AUTH_MODE=trusted-header; identity header '${authConfig.userHeader}' ` +
        `accepted from ${authConfig.trustedProxies.length} trusted peer rule(s); ` +
        `JIT provisioning ${authConfig.jitProvision ? `on (default role ${authConfig.defaultRole})` : 'off'}`,
    );
}

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, '0.0.0.0', () => console.log(`Astral service running on http://0.0.0.0:${PORT}`));

// Drain in-flight requests on SIGTERM/SIGINT rather than cutting them off.
installGracefulShutdown(server, 'astral');
