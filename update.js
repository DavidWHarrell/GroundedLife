#!/usr/bin/env node
// update.js - ES Module with detailed debug instrumentation and incremental API usage tracking
import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// -- Configuration & Logging Setup --
const LOG_FILE = 'api-usage.log';
function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed to write log file: ${err.message}`);
  }
}

// Startup logs
log('=== UPDATE START ===');
log(`ENV SUPABASE_URL set: ${!!process.env.SUPABASE_URL}`);
log(`ENV SUPABASE_SERVICE_KEY set: ${!!process.env.SUPABASE_SERVICE_KEY}`);
const keys = process.env.YT_API_KEYS ? process.env.YT_API_KEYS.split(',') : [];
log(`ENV YT_API_KEYS count: ${keys.length}`);

// Validate environment
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  log('❌ Missing Supabase credentials. Exiting.');
  process.exit(1);
}

// Initialize Supabase Client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

(async () => {
  // Test connectivity
  try {
    const { data: testData, error: testErr } = await supabase
      .from('channels')
      .select('id')
      .limit(1);
    if (testErr) log(`Test SELECT error: ${testErr.message}`);
    else log(`Test SELECT succeeded`);
  } catch (err) {
    log(`Fatal error during test SELECT: ${err.message}`);
    process.exit(1);
  }

  // Fetch channels
  let allChannels;
  try {
    const { data, error } = await supabase
      .from('channels')
      .select('id, channel_handle, override_id, unreachable');
    if (error) throw error;
    allChannels = data;
  } catch (err) {
    log(`❌ Failed to fetch channels: ${err.message}`);
    process.exit(1);
  }
  log(`Fetched channels: total = ${allChannels.length}`);

  // Filter unreachable
  const reachable = allChannels.filter(c => c.unreachable !== true);
  log(`Processing channels: reachable = ${reachable.length}`);

  // Count API calls for processing
  let apiCalls = 0;
  for (const ch of reachable) {
    const handle = ch.override_id || ch.channel_handle;
    log(`➡️ Processing id=${ch.id} handle=${handle}`);
    // TODO: Replace below with real YouTube API calls
    apiCalls += 1; // metadata call
    apiCalls += 1; // uploads call
  }
  log(`Total API calls simulated: ${apiCalls}`);

  // Increment usage in Supabase
  const today = new Date().toISOString().split('T')[0];
  try {
    // Fetch existing count for today
    const { data: usageData, error: fetchErr } = await supabase
      .from('api_key_usage')
      .select('count')
      .eq('key_label', 'DEFAULT')
      .eq('date', today)
      .single();
    if (fetchErr && fetchErr.code !== 'PGRST116') throw fetchErr;
    const previousCount = usageData?.count || 0;
    const newCount = previousCount + apiCalls;

    // Upsert new total count
    const { error: upsertErr } = await supabase
      .from('api_key_usage')
      .upsert(
        { key_label: 'DEFAULT', date: today, count: newCount, last_used_at: new Date().toISOString() },
        { onConflict: ['key_label', 'date'] }
      );
    if (upsertErr) throw upsertErr;
    log(`✅ Incremented API usage: previous=${previousCount}, added=${apiCalls}, total=${newCount}`);
  } catch (err) {
    log(`❌ Failed to update usage: ${err.message}`);
  }

  log('=== UPDATE END ===');
})();
