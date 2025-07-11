import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const API_KEYS = process.env.YT_API_KEYS?.split(',') || [];
const LOG_FILE = 'api-usage.log';
const USAGE_TABLE = 'api_key_usage';

// Usage counters
let totalUsage = 0;
const usageBreakdown: Record<string, number> = {};

function log(message: string) {
  const entry = `[${new Date().toISOString()}] ${message}`;
  console.log(entry);
  fs.appendFileSync(LOG_FILE, entry + '\n');
}

function countApiUsage(label: string = 'general') {
  totalUsage++;
  usageBreakdown[label] = (usageBreakdown[label] || 0) + 1;
}

async function logUsageToSupabase(label: string, count: number) {
  const today = new Date().toISOString().split('T')[0];
  const { error } = await supabase
    .from(USAGE_TABLE)
    .upsert({
      key_label: label,
      date: today,
      count,
      last_used_at: new Date().toISOString(),
    }, { onConflict: 'key_label,date' });

  if (error) {
    log(`❌ Failed to log ${label} usage to Supabase: ${error.message}`);
  } else {
    log(`✅ Logged usage: ${label} → ${count}`);
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
    const name = ch.channel_name || ch.channel_handle || 'Unknown';
    log(`➡️ ${name}`);

    try {
      // Simulate YouTube API calls
      countApiUsage('fetch_metadata');
      countApiUsage('fetch_uploads');
      countApiUsage('fetch_playlist_items');
      log(`✅ Done: ${name}`);
    } catch (err: any) {
      log(`❌ Error updating ${name}: ${err.message}`);
    }
  }

  for (const [label, count] of Object.entries(usageBreakdown)) {
    await logUsageToSupabase(label, count);
  }

  log(`📊 Total API usage: ${totalUsage}`);
  log('=== UPDATE END ===');
}

update();
