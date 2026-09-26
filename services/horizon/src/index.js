import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import routes from './routes/index.js';
import { healthz, installGracefulShutdown } from './utils/lifecycle.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3006;

// __dirname shim for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Unauthenticated liveness probe, mounted ahead of the
// application routes so nothing can shadow it.
app.use('/healthz', healthz('horizon'));

// Routes
app.use('/', routes);

// Serve generated files
app.use("/generated", express.static(path.join(__dirname, "..", "generated")));

// Serve assets (favicon, etc.)
app.use("/assets", express.static(path.join(__dirname, "..", "assets")));

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`horizon running on http://0.0.0.0:${port}`);
});

// Drain in-flight requests on SIGTERM/SIGINT rather than cutting them off.
installGracefulShutdown(server, 'horizon');
