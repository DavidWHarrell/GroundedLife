import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

(async()=> {
  const { data, error } = await supabase
    .from('channel_metrics')
    .select('fetched_at,videos,subscribers,views,last_video_at,channels(friend_name,channel_name)')
    .order('fetched_at', { ascending: false })
    .limit(1);
  console.log('metrics →', { data, error });
})();
