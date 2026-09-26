import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import morgan from 'morgan';
import routes from './routes/index.js';
import { healthz, installGracefulShutdown } from './utils/lifecycle.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3005;

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Unauthenticated liveness probe, mounted ahead of the
// application routes so nothing can shadow it.
app.use('/healthz', healthz('satellite'));

app.use('/', routes);

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`satellite BFF running on http://0.0.0.0:${port}`);
});

// Drain in-flight requests on SIGTERM/SIGINT rather than cutting them off.
installGracefulShutdown(server, 'satellite');
