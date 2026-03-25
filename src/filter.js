import { getUserEmail, getThreadSnippets } from './gmail.js';
import config from './config.js';

/**
 * Extract email address from a "Name <email>" string
 */
function extractEmail(fromHeader) {
  const match = fromHeader.match(/<([^>]+)>/);
  return (match ? match[1] : fromHeader).toLowerCase().trim();
}

/**
 * Extract domain from email address
 */
function extractDomain(email) {
  const parts = email.split('@');
  return parts.length > 1 ? parts[1].toLowerCase() : '';
}

/**
 * Check if a sender matches ignored patterns
 */
function isIgnoredSender(email) {
  const { ignoredSenderPatterns, ignoredDomains } = config.filter;
  const domain = extractDomain(email);

  if (ignoredDomains.includes(domain)) return true;
  return ignoredSenderPatterns.some((pattern) => email.includes(pattern));
}

/**
 * Check if a thread has a List-Unsubscribe header (newsletter indicator)
 */
function isNewsletter(thread) {
  return thread.messages.some((m) => m.headers['list-unsubscribe']);
}

/**
 * Check if the authenticated user has replied to this thread
 */
function hasUserReplied(thread, myEmail) {
  // Check messages after the first one (first could be the user's own email)
  const lastMsg = thread.messages[thread.messages.length - 1];
  const lastFrom = extractEmail(lastMsg.headers['from'] || '');
  return lastFrom === myEmail;
}

/**
 * Filter threads — returns only the ones that matter
 */
export async function filterThreads(threads) {
  const myEmail = await getUserEmail();
  const filtered = [];

  for (const thread of threads) {
    const firstMsg = thread.messages[0];
    const lastMsg = thread.messages[thread.messages.length - 1];
    const lastSender = extractEmail(lastMsg.headers['from'] || '');
    const lastSenderDomain = extractDomain(lastSender);

    // Disabling SOME filters per user request:
    // if (hasUserReplied(thread, myEmail)) continue;
    // if (isIgnoredSender(lastSender)) continue;

    // Optional: Filter out mass-marketing emails using List-Unsubscribe headers
    if (config.filter.ignoreNewsletters && isNewsletter(thread)) {
      continue;
    }

    // Compute metadata
    const hoursSinceLastMessage = (Date.now() - lastMsg.internalDate) / (1000 * 60 * 60);

    // Give Gemini everything that survived the noise filters!
    filtered.push({
      threadId: thread.threadId,
      subject: thread.subject,
      messageCount: thread.messageCount,
      lastSender,
      lastSenderDomain,
      hoursSinceLastMessage: Math.round(hoursSinceLastMessage),
      snippets: getThreadSnippets(thread),
    });
  }

  return filtered;
}
