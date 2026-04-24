import express from 'express';
import { webhookRouter } from './routes/webhook.js';
import { oauthRouter } from './routes/oauth.js';
import dotenv from 'dotenv';

// Load .env for local dev; on Railway env vars are set via platform
dotenv.config({ path: '../.env' });
dotenv.config(); // also check cwd for .env

const app = express();

// Webhook route needs raw body for signature verification
app.use('/webhook', express.raw({ type: 'application/json' }));

// All other routes use JSON parsing
app.use(express.json());

app.use('/webhook', webhookRouter);
app.use('/auth', oauthRouter);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'sage' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Sage backend running on port ${PORT}`));
