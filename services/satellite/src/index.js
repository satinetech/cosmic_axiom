import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import morgan from 'morgan';
import { aiChatRouter } from './routes/aiChat.js';
import routes from './routes/index.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3005;

app.use(cors());
// Before the JSON parser: it streams its body to nebula unparsed. See aiChat.js.
app.use('/ai/chat', aiChatRouter());
app.use(morgan('dev'));
app.use(express.json());

app.use('/', routes);

app.listen(port, '0.0.0.0', () => {
    console.log(`satellite BFF running on http://0.0.0.0:${port}`);
});
