// update-debug.js
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const YT_API_KEYS          = (process.env.YT_API_KEYS || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

// 1) Validate env-vars
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || YT_API_KEYS.length === 0) {
  console.error('🚨 Missing one of the following env-vars:');
  console.error(`   SUPABASE_URL:        ${SUPABASE_URL  ? '[set]' : 'undefined'}`);
  console.error(`   SUPABASE_SERVICE_KEY:${SUPABASE_SERVICE_KEY ? '[set]' : 'undefined'}`);
  console.error(`   YT_API_KEYS:         ${YT_API_KEYS.length > 0 ? '[set]' : 'undefined'}`);
  process.exit(1);
}

console.log('⚙️ ENV VARS OK. YouTube keys count:', YT_API_KEYS.length);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

async function main() {
  // 2) Fetch your channels and catch any errors
  const { data: channels, error: chanErr } = await supabase
    .from('channels')
    .select('id, channel_handle');

  if (chanErr) {
    console.error('❌ Supabase .select() failed:', JSON.stringify(chanErr, null, 2));
    console.error('   Double-check your SUPABASE_URL & SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  if (!channels || channels.length === 0) {
    console.log('ℹ️ No channels found to process.');
    return;
  }

  console.log(`✅ Found ${channels.length} channel(s) to process:`);
  channels.forEach(c => console.log(`   • [${c.id}] ${c.channel_handle}`));

  // 3) Now you can drop into your existing for-loop and fetchWithKeysDebug logic...
  for (const { id, channel_handle } of channels) {
    console.log(`\n▶ Processing: ${channel_handle}`);
    // …your fetchWithKeysDebug and further logic here…
  }
}

main().catch(err => {
  console.error('\n❌ Uncaught error:', err);
  process.exit(1);
});
