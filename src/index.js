import dotenv from 'dotenv';
dotenv.config();

import cron from 'node-cron';
import config from './config.js';
import { fetchInboxThreads, fetchThreadsWithDetails } from './gmail.js';
import { filterThreads } from './filter.js';
import { analyzeThreads } from './analyzer.js';
import { deliverDigest } from './digest.js';
import { initDB, wasRecentlyDigested, markDigested, upsertThread, closeDB } from './db.js';

/**
 * Run the full pipeline: Fetch → Filter → Analyze → Deliver
 */
async function runPipeline() {
  const startTime = Date.now();
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`🚀 Gmail AI Assistant — Pipeline started`);
  console.log(`   ${new Date().toLocaleString('en-GB')}`);
  console.log(`${'═'.repeat(50)}\n`);

  try {
    // 1. Initialize database
    initDB();

    // 2. Fetch threads from Gmail
    const { lookbackHours, maxThreads, skipLabels } = config.gmail;
    console.log(`📥 Fetching threads (last ${lookbackHours}h, max ${maxThreads})...`);
    const threadIds = await fetchInboxThreads(lookbackHours, maxThreads, skipLabels);
    console.log(`   Found ${threadIds.length} thread(s) in inbox.`);

    if (threadIds.length === 0) {
      console.log('📭 No threads to process. Inbox is clean!');
      return;
    }

    // 3. Get thread details
    console.log('📖 Fetching thread details...');
    const threads = await fetchThreadsWithDetails(threadIds);
    console.log(`   Loaded ${threads.length} thread(s) with details.`);

    // 4. Filter out noise
    console.log('🔍 Filtering threads...');
    let filtered = await filterThreads(threads);
    console.log(`   ${filtered.length} thread(s) passed filters (removed ${threads.length - filtered.length} noise).`);

    // 5. Remove recently digested threads
    filtered = filtered.filter((t) => !wasRecentlyDigested(t.threadId));
    console.log(`   ${filtered.length} thread(s) after deduplication.`);

    if (filtered.length === 0) {
      console.log('📭 No new items to digest — all caught up!');
      return;
    }

    // 6. Analyze with Gemini
    console.log(`🧠 Analyzing ${filtered.length} thread(s) with Gemini...`);
    const analyzed = await analyzeThreads(filtered);

    // 7. Save to database
    for (const t of analyzed) {
      upsertThread(t);
    }

    // 8. Deliver digest
    await deliverDigest(analyzed);

    // 9. Mark as digested
    markDigested(analyzed.map((t) => t.threadId));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Pipeline complete in ${elapsed}s\n`);
  } catch (err) {
    console.error('❌ Pipeline error:', err);
  }
}

// ─── Entry point ─────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--now') || args.includes('-n')) {
  // Manual trigger
  console.log('⚡ Manual trigger mode');
  runPipeline()
    .then(() => {
      closeDB();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      closeDB();
      process.exit(1);
    });
} else {
  // Scheduled mode
  const schedules = config.digest.schedule || ['0 9 * * *', '0 17 * * *'];
  const tz = config.digest.timezone || 'Europe/London';

  console.log('📅 Gmail AI Assistant — Scheduler started');
  console.log(`   Schedules: ${schedules.join(', ')}`);
  console.log(`   Timezone: ${tz}`);
  console.log(`   Delivery: ${(config.digest.delivery || ['slack']).join(', ')}`);
  console.log('   Press Ctrl+C to stop.\n');

  for (const schedule of schedules) {
    cron.schedule(schedule, () => {
      console.log(`⏰ Scheduled run triggered (${schedule})`);
      runPipeline();
    }, { timezone: tz });
  }

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    closeDB();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    closeDB();
    process.exit(0);
  });
}
