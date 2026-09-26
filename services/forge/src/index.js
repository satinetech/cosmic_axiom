import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import morgan from 'morgan';
import routes from './routes/index.js';
import { healthz, installGracefulShutdown } from './utils/lifecycle.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3002;

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Unauthenticated liveness probe, mounted ahead of the
// application routes so nothing can shadow it.
app.use('/healthz', healthz('forge'));

app.use('/', routes);

const server = app.listen(port, () => {
    console.log(`forge running on http://localhost:${port}`);
});

// Drain in-flight requests on SIGTERM/SIGINT rather than cutting them off.
installGracefulShutdown(server, 'forge');
