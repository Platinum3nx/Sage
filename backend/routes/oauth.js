/**
 * OAuth Router — handles GitHub OAuth flow for the dashboard.
 */

import { Router } from 'express';

export const oauthRouter = Router();

oauthRouter.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Missing code parameter' });

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return res.status(400).json({ error: tokenData.error_description });
    }

    // Redirect back to dashboard with the token
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    res.redirect(`${appUrl}/dashboard?token=${tokenData.access_token}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).json({ error: 'OAuth failed' });
  }
});
