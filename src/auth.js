import { google } from 'googleapis';
import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, '..', 'token.json');

/**
 * Get OAuth2 client configured with credentials from .env
 */
export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
  );
}

/**
 * Load saved tokens and return an authenticated client
 */
export async function getAuthenticatedClient() {
  const oauth2Client = getOAuth2Client();

  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      'No token.json found. Run `npm run setup` first to authenticate with Gmail.'
    );
  }

  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
  oauth2Client.setCredentials(tokens);

  // Auto-refresh if expired
  oauth2Client.on('tokens', (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    console.log('🔄 Token refreshed and saved.');
  });

  return oauth2Client;
}

/**
 * Interactive OAuth2 setup — run once with `npm run setup`
 */
export async function setupAuth() {
  const oauth2Client = getOAuth2Client();

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
  });

  console.log('\n📧 Gmail AI Assistant — OAuth Setup\n');
  console.log('1. Open this URL in your browser:\n');
  console.log(`   ${authUrl}\n`);
  console.log('2. Authorize the app, then wait for the redirect.\n');

  // Start a temporary local server to catch the callback
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost:3000');
        if (url.pathname !== '/oauth2callback') return;

        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400);
          res.end('No code received.');
          return;
        }

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>✅ Gmail authenticated! You can close this tab.</h2>');

        console.log('✅ Token saved to token.json');
        server.close();
        resolve(oauth2Client);
      } catch (err) {
        res.writeHead(500);
        res.end('Authentication failed.');
        reject(err);
      }
    });

    server.listen(3000, () => {
      console.log('⏳ Waiting for OAuth callback on http://localhost:3000 ...\n');
    });
  });
}

// If this file is run directly, start the setup flow
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  (await import('dotenv')).config();
  setupAuth()
    .then(() => {
      console.log('\n🎉 Setup complete! You can now run: npm start');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Setup failed:', err.message);
      process.exit(1);
    });
}
