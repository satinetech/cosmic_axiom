import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import morgan from 'morgan';
import { aiChatRouter } from './routes/aiChat.js';
import routes from './routes/index.js';
import { healthz, installGracefulShutdown } from './utils/lifecycle.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3005;

app.use(cors());
// Before the JSON parser: it streams its body to nebula unparsed. See aiChat.js.
app.use('/ai/chat', aiChatRouter());
app.use(morgan('dev'));
// Images arrive as base64 inside JSON, so /images needs a far larger body than
// Express's 100 KB default, which rejects any real screenshot with a 413. Every
// other route keeps the default.
app.use('/images', express.json({ limit: process.env.IMAGE_BODY_LIMIT || '10mb' }));
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
