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
// Images arrive as base64 inside JSON, so /images needs a far larger body than
// Express's 100 KB default, which rejects any real screenshot with a 413. Every
// other route keeps the default. (satellite forwards uploads with axios, whose
// default request cap is 10 MB, so raising this past 10mb needs that too.)
app.use('/images', express.json({ limit: process.env.IMAGE_BODY_LIMIT || '10mb' }));
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
