import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import morgan from 'morgan';
import routes from './routes/index.js';
import { healthz, installGracefulShutdown } from './utils/lifecycle.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3004;

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Unauthenticated liveness probe, mounted ahead of the
// application routes so nothing can shadow it.
app.use('/healthz', healthz('singularity'));

app.use('/', routes);

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`singularity running on http://0.0.0.0:${port}`);
});

// Drain in-flight requests on SIGTERM/SIGINT rather than cutting them off.
installGracefulShutdown(server, 'singularity');
