// update.js
// — CommonJS script to fetch channels, count YouTube API usage, and log to Supabase
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// — must be set in your local .env (and in GitHub Actions secrets)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const YT_API_KEYS = process.env.YT_API_KEYS ? process.env.YT_API_KEYS.split(',') : [];

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || YT_API_KEYS.length === 0) {
  console.error('❌ Missing environment variables. Check your .env file.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const LOG_FILE = path.join(__dirname, 'api-usage.log');
const USAGE_TABLE = 'api_key_usage';

let totalUsage = 0;
const usageByType = {};

function log(line) {
  const entry = `[${new Date().toISOString()}] ${line}`;
  console.log(entry);
  try { fs.appendFileSync(LOG_FILE, entry + '\n'); } catch {}
}

function countUsage(type) {
  totalUsage++;
  usageByType[type] = (usageByType[type] || 0) + 1;
}

async function logUsage(label, count) {
  const date = new Date().toISOString().slice(0,10);
  const { error } = await supabase
    .from(USAGE_TABLE)
    .upsert(
      { key_label: label, date, count, last_used_at: new Date().toISOString() },
      { onConflict: ['key_label','date'] }
    );
  if (error) log(`❌ Failed to log ${label}: ${error.message}`);
  else     log(`✅ Supabase logged ${label}: ${count}`);
}

async function runUpdate() {
  log('=== UPDATE START ===');

  // grab every channel where unreachable is not true (i.e. false or null)
  const { data: channels, error: chErr } = await supabase
    .from('channels')
    .select('*')
    .neq('unreachable', true);

  if (chErr) {
    log(`❌ Fetch channels error: ${chErr.message}`);
    process.exit(1);
  }

  log(`Found ${channels.length} channels.`);

  for (const ch of channels) {
    const name = ch.channel_name || ch.channel_handle || 'Unknown';
    log(`➡️ Processing ${name}`);

    try {
      // YouTube metadata call
      countUsage('fetch_metadata');
      // TODO: insert your actual fetch(…) for metadata here

      // YouTube uploads call
      countUsage('fetch_uploads');
      // TODO: insert your actual fetch(…) for uploads here

      log(`✅ Done: ${name}`);
    } catch (e) {
      log(`❌ Error for ${name}: ${e.message}`);
    }
  }

  // write per‐type and total counts
  for (const [type, cnt] of Object.entries(usageByType)) {
    await logUsage(type, cnt);
  }
  log(`📊 Total API usage: ${totalUsage}`);
  log('=== UPDATE END ===');
}

runUpdate().catch(e => log(`❌ Unexpected error: ${e.message}`));
