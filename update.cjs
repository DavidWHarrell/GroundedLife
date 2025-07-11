#!/usr/bin/env node
// update.js - ESM with detailed debug instrumentation for Supabase channel processing and API usage
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
    console.error(`[${ts}] Failed to write log file: ${err.message}`);
  }
}

log('=== UPDATE START ===');
log(`ENV SUPABASE_URL set: ${!!process.env.SUPABASE_URL}`);
log(`ENV SUPABASE_SERVICE_KEY set: ${!!process.env.SUPABASE_SERVICE_KEY}`);
log(`ENV YT_API_KEYS count: ${process.env.YT_API_KEYS ? process.env.YT_API_KEYS.split(',').length : 0}`);

// -- Validate environment --
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  log('❌ Missing Supabase credentials. Exiting.');
  process.exit(1);
}

// -- Initialize Supabase Client --
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// -- Main Update Routine --
async function update() {
  // 1. Test connectivity
  try {
    const { data: testData, error: testErr } = await supabase
      .from('channels')
      .select('id, unreachable')
      .limit(1);
    if (testErr) log(`Test SELECT error: ${testErr.message}`);
    else log(`Test SELECT sample: ${JSON.stringify(testData)}`);
  } catch (err) {
    log(`Fatal error during test SELECT: ${err.message}`);
    return;
  }

  // 2. Fetch all channels
  let allChannels;
  try {
    const { data, error } = await supabase
      .from('channels')
      .select('id, channel_handle, override_id, unreachable');
    if (error) throw error;
    allChannels = data;
  } catch (err) {
    log(`❌ Failed to fetch channels: ${err.message}`);
    return;
  }
  log(`Fetched channels: total rows = ${allChannels.length}`);
  log(`Raw unreachable values: ${allChannels.map(c => c.unreachable).join(', ')}`);

  // 3. Filter out unreachable === true only
  const reachable = allChannels.filter(c => c.unreachable !== true);
  log(`After filter (unreachable !== true): ${reachable.length} channels to process`);

  // 4. Simulate processing each channel and count API calls
  let apiCalls = 0;
  for (const ch of reachable) {
    const handle = ch.override_id || ch.channel_handle;
    log(`➡️ Processing id=${ch.id} handle=${handle} unreachable=${ch.unreachable}`);
    // TODO: Insert actual YouTube API calls here
    apiCalls += 1; // metadata call
    apiCalls += 1; // uploads call
  }

  log(`📊 Debugged total API calls counted: ${apiCalls}`);

  // 5. Log usage back to Supabase
  try {
    const today = new Date().toISOString().split('T')[0];
    const { error: upsertErr } = await supabase
      .from('api_key_usage')
      .upsert(
        { key_label: 'DEFAULT', date: today, count: apiCalls, last_used_at: new Date().toISOString() },
        { onConflict: ['key_label', 'date'] }
      );
    if (upsertErr) throw upsertErr;
    log(`✅ Supabase logged API usage: count=${apiCalls}`);
  } catch (err) {
    log(`❌ Failed to log usage to Supabase: ${err.message}`);
  }
}

// Run and finalize
update()
  .catch(err => log(`Fatal error in update(): ${err.message}`))
  .finally(() => log('=== UPDATE END ==='));
