import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'threads.db');

let db = null;

/**
 * Initialize the database with schema
 */
export function initDB() {
  if (db) return db;

  // Ensure data directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      thread_id TEXT PRIMARY KEY,
      subject TEXT,
      last_sender TEXT,
      priority TEXT,
      first_seen_at TEXT DEFAULT (datetime('now')),
      last_seen_at TEXT DEFAULT (datetime('now')),
      last_digest_at TEXT,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS digest_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sent_at TEXT DEFAULT (datetime('now')),
      thread_count INTEGER,
      delivery_method TEXT,
      success INTEGER DEFAULT 1
    );
  `);

  return db;
}

/**
 * Check if a thread was already included in a recent digest
 */
export function wasRecentlyDigested(threadId, hoursThreshold = 12) {
  const d = initDB();
  const row = d.prepare(`
    SELECT last_digest_at FROM threads 
    WHERE thread_id = ? 
      AND last_digest_at IS NOT NULL
      AND datetime(last_digest_at) > datetime('now', ?)
  `).get(threadId, `-${hoursThreshold} hours`);
  return !!row;
}

/**
 * Mark threads as included in a digest
 */
export function markDigested(threadIds) {
  const d = initDB();
  const stmt = d.prepare(`
    INSERT INTO threads (thread_id, last_digest_at, last_seen_at)
    VALUES (?, datetime('now'), datetime('now'))
    ON CONFLICT(thread_id) DO UPDATE SET
      last_digest_at = datetime('now'),
      last_seen_at = datetime('now')
  `);

  const tx = d.transaction((ids) => {
    for (const id of ids) {
      stmt.run(id);
    }
  });
  tx(threadIds);
}

/**
 * Update thread info in database
 */
export function upsertThread(thread) {
  const d = initDB();
  d.prepare(`
    INSERT INTO threads (thread_id, subject, last_sender, priority, last_seen_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(thread_id) DO UPDATE SET
      subject = excluded.subject,
      last_sender = excluded.last_sender,
      priority = excluded.priority,
      last_seen_at = datetime('now')
  `).run(thread.threadId, thread.subject, thread.lastSender, thread.priority);
}

/**
 * Log a digest delivery
 */
export function logDigest(threadCount, method, success = true) {
  const d = initDB();
  d.prepare(`
    INSERT INTO digest_log (thread_count, delivery_method, success)
    VALUES (?, ?, ?)
  `).run(threadCount, method, success ? 1 : 0);
}

/**
 * Close database connection
 */
export function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}
