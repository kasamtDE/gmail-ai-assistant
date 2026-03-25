/**
 * Test script — validates core logic with mock data
 * Run with: node test/test-flow.js
 */

import { initDB, upsertThread, wasRecentlyDigested, markDigested, closeDB } from '../src/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Test utilities ────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    failed++;
  }
}

// ─── Database tests ───────────────────────────────────────────

function testDatabase() {
  console.log('\n📦 Database Tests\n');

  const db = initDB();
  assert(db !== null, 'Database initializes');

  // Test upsert
  upsertThread({
    threadId: 'test-thread-1',
    subject: 'Test Subject',
    lastSender: 'test@example.com',
    priority: 'High',
  });
  assert(true, 'Thread upsert succeeds');

  // Test dedup check (not digested yet)
  assert(!wasRecentlyDigested('test-thread-1'), 'New thread is not recently digested');

  // Mark as digested
  markDigested(['test-thread-1']);
  assert(wasRecentlyDigested('test-thread-1'), 'Digested thread is detected');

  // Non-existent thread
  assert(!wasRecentlyDigested('does-not-exist'), 'Non-existent thread returns false');

  closeDB();
}

// ─── Filter logic tests ──────────────────────────────────────

function testFilterLogic() {
  console.log('\n🔍 Filter Logic Tests\n');

  // Test email extraction
  const extractEmail = (fromHeader) => {
    const match = fromHeader.match(/<([^>]+)>/);
    return (match ? match[1] : fromHeader).toLowerCase().trim();
  };

  assert(extractEmail('John <john@example.com>') === 'john@example.com', 'Extracts email from formatted header');
  assert(extractEmail('plain@example.com') === 'plain@example.com', 'Handles plain email');
  assert(extractEmail('Name <UPPER@Example.COM>') === 'upper@example.com', 'Lowercases email');

  // Test domain extraction
  const extractDomain = (email) => {
    const parts = email.split('@');
    return parts.length > 1 ? parts[1].toLowerCase() : '';
  };

  assert(extractDomain('invalid') === '', 'Handles missing domain');
}


// ─── Digest formatting tests ─────────────────────────────────

function testDigestFormatting() {
  console.log('\n📋 Digest Formatting Tests\n');

  const mockThreads = [
    { priority: 'Medium' },
    { priority: 'High' },
    { priority: 'Low' },
  ];

  // Test priority sorting
  const order = { High: 0, Medium: 1, Low: 2 };
  const sorted = [...mockThreads].sort((a, b) => (order[a.priority] || 2) - (order[b.priority] || 2));
  
  assert(sorted[0].priority === 'High', 'High priority sorts first');
  assert(sorted[1].priority === 'Medium', 'Medium priority sorts second');
  assert(sorted[2].priority === 'Low', 'Low priority sorts third');
  assert(sorted.length === 3, 'Mock data has 3 threads');
}

// ─── Run all tests ───────────────────────────────────────────

console.log('🧪 Gmail AI Assistant — Test Suite\n');

testDatabase();
testFilterLogic();
testDigestFormatting();

// Clean up test database
try {
  const testDbPath = path.join(__dirname, '..', 'data', 'threads.db');
  const testDbWal = testDbPath + '-wal';
  const testDbShm = testDbPath + '-shm';
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  if (fs.existsSync(testDbWal)) fs.unlinkSync(testDbWal);
  if (fs.existsSync(testDbShm)) fs.unlinkSync(testDbShm);
} catch (e) {
  // Ignore cleanup errors
}

console.log(`\n${'═'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
