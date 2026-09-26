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

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, '0.0.0.0', () => console.log(`Astral service running on http://0.0.0.0:${PORT}`));

// Drain in-flight requests on SIGTERM/SIGINT rather than cutting them off.
installGracefulShutdown(server, 'astral');
