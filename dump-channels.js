import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

(async () => {
  const { data, error } = await supabase
    .from('channels')
    .select('channel_id, channel_name, friend_name, channel_url, channel_handle');

  if (error) {
    console.error('❌ Error fetching channels:', error.message);
    return;
  }

  console.log(`📦 Found ${data.length} channels:\n`);
  data.forEach((ch, i) => {
    console.log(`${i + 1}. ${ch.channel_name} (${ch.channel_id}) — ${ch.friend_name}`);
  });

  // Optional: print raw JSON for copy/paste comparison
  console.log('\n📋 Full JSON Dump:');
  console.log(JSON.stringify(data, null, 2));
})();
