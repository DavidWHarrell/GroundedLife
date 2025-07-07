import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

(async () => {
  console.log('🔌 Testing Supabase connection...');
  const { data: channels, error: channelsError } = await supabase.from('channels').select('*').limit(1);
  console.log('channels →', { channels, channelsError });

  console.log('🔍 Testing YouTube API...');
  const channelId = channels?.[0]?.channel_id;
  const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${process.env.YOUTUBE_API_KEY}`);
  const ytData = await ytRes.json();
  console.log('YouTube →', ytData);

  console.log('✅ Validation complete.');
})();
