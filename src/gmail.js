import { google } from 'googleapis';
import { getAuthenticatedClient } from './auth.js';

let gmailClient = null;
let userEmail = null;

/**
 * Initialize Gmail API client
 */
async function getGmail() {
  if (gmailClient) return gmailClient;
  const auth = await getAuthenticatedClient();
  gmailClient = google.gmail({ version: 'v1', auth });
  return gmailClient;
}

/**
 * Get the authenticated user's email address
 */
export async function getUserEmail() {
  if (userEmail) return userEmail;
  const gmail = await getGmail();
  const profile = await gmail.users.getProfile({ userId: 'me' });
  userEmail = profile.data.emailAddress.toLowerCase();
  return userEmail;
}

/**
 * Fetch threads from inbox within the lookback window
 * that are NOT in the skip labels
 */
export async function fetchInboxThreads(lookbackHours = 72, maxThreads = 50, skipLabels = []) {
  const gmail = await getGmail();
  const after = Math.floor((Date.now() - lookbackHours * 60 * 60 * 1000) / 1000);

  const query = `in:inbox after:${after}`;
  let allThreadIds = [];
  let pageToken = null;

  do {
    const res = await gmail.users.threads.list({
      userId: 'me',
      q: query,
      maxResults: Math.min(maxThreads - allThreadIds.length, 100),
      pageToken,
      labelIds: ['INBOX'],
    });

    if (res.data.threads) {
      allThreadIds.push(...res.data.threads.map((t) => t.id));
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken && allThreadIds.length < maxThreads);

  return allThreadIds.slice(0, maxThreads);
}

function extractTextBody(payload) {
  if (!payload) return '';
  let text = '';
  
  if (payload.body && payload.body.data) {
    // Gmail returns Base64url, Node's Buffer handles it mostly fine with 'base64'
    text = Buffer.from(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } else if (payload.parts) {
    // Try to find text/plain
    const plainPart = payload.parts.find(p => p.mimeType === 'text/plain');
    if (plainPart && plainPart.body && plainPart.body.data) {
      text = Buffer.from(plainPart.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    } else {
      // Fallback
      for (const part of payload.parts) {
        const extracted = extractTextBody(part);
        if (extracted) {
          text += ' ' + extracted;
        }
      }
    }
  }
  // Basic HTML cleanup in case we hit HTML content
  return text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
             .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
             .replace(/<[^>]+>/g, ' ')
             .replace(/\s+/g, ' ')
             .trim()
             .substring(0, 5000); // 5000 chars is plenty for AI to understand the email
}

/**
 * Get full thread details including all messages
 */
export async function getThreadDetails(threadId) {
  const gmail = await getGmail();
  const res = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  });

  const thread = res.data;
  const messages = thread.messages.map((msg) => {
    const headers = {};
    (msg.payload.headers || []).forEach((h) => {
      headers[h.name.toLowerCase()] = h.value;
    });
    
    // We override snippet with the actual full body text so the AI sees everything
    const fullBody = extractTextBody(msg.payload) || msg.snippet || '';

    return {
      id: msg.id,
      threadId: msg.threadId,
      labelIds: msg.labelIds || [],
      snippet: fullBody,
      headers,
      internalDate: parseInt(msg.internalDate),
    };
  });

  return {
    threadId: thread.id,
    historyId: thread.historyId,
    messages,
    subject: messages[0]?.headers['subject'] || '(no subject)',
    messageCount: messages.length,
  };
}

/**
 * Fetch full details for multiple threads with rate limiting
 */
export async function fetchThreadsWithDetails(threadIds) {
  const threads = [];
  for (const id of threadIds) {
    try {
      const details = await getThreadDetails(id);
      threads.push(details);
    } catch (err) {
      console.warn(`⚠️  Failed to fetch thread ${id}:`, err.message);
    }
    // Small delay to respect rate limits
    await new Promise((r) => setTimeout(r, 100));
  }
  return threads;
}

/**
 * Get the first snippet text from a thread for analysis
 */
export function getThreadSnippets(thread) {
  return thread.messages.map((m) => ({
    from: m.headers['from'] || 'unknown',
    date: new Date(m.internalDate).toISOString(),
    snippet: m.snippet,
  }));
}
