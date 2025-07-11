import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const API_KEYS = process.env.YT_API_KEYS?.split(',') || [];
let apiUsageCount = 0;
const LOG_FILE = 'api-usage.log';

function log(message) {
  console.log(message);
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
}

function countApiUsage() {
  apiUsageCount++;
}

async function logUsageToSupabase(label, count) {
  const today = new Date().toISOString().split('T')[0];
  const { error } = await supabase
    .from('api_key_usage')
    .upsert({
      key_label: label,
      date: today,
      count,
      last_used_at: new Date().toISOString()
    }, { onConflict: 'key_label,date' });

  if (error) {
    log(`❌ Failed to log usage to Supabase: ${error.message}`);
  } else {
    log(`✅ Usage logged to Supabase: ${label} → ${count} queries`);
  }
}

async function update() {
  log('=== UPDATE START ===');
  const { data: channels, error } = await supabase
    .from('channels')
    .select('*')
    .eq('unreachable', false);

  if (error) {
    log(`❌ Failed to fetch channels: ${error.message}`);
    return;
  }

  log(`Found ${channels.length} channels...`);

  for (const ch of channels) {
    const channelName = ch.channel_name || ch.channel_handle || 'Unknown';
    log(`➡️ ${channelName}`);

    try {
      const key = API_KEYS[0]; // Only one key for now

      // Simulate YouTube API calls (real fetch code should go here)
      countApiUsage(); // metadata
      countApiUsage(); // uploads

      // Simulate successful updates
      log(`✅ Done: ${channelName}`);
    } catch (err) {
      log(`❌ Error updating ${channelName}: ${err.message}`);
    }
  }

  await logUsageToSupabase('KEY 1', apiUsageCount);
  log(`📊 API usage: ${apiUsageCount}`);
  log('=== UPDATE END ===');
}

update();
