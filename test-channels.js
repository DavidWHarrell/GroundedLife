import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

(async()=> {
  const { data, error } = await supabase
    .from('channels')
    .select('id,friend_name,channel_handle,channel_url,thumbnail_url,override_id,channel_name');
  console.log('channels →', { data, error });
})();
