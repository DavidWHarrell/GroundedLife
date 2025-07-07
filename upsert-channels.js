import fs from 'fs';
import csv from 'csv-parser';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const results = [];

fs.createReadStream('cleaned_channels_with_handle.csv') // ← Use the file with `channel_handle`
  .pipe(csv())
  .on('data', (row) => {
    results.push({
      friend_name: row.friend_name,
      channel_name: row.channel_name,
      channel_id: row.channel_id,
      channel_url: row.channel_url,
      channel_handle: row.channel_handle,
      thumbnail_url: row.thumbnail_url,
    });
  })
  .on('end', async () => {
    console.log(`🔄 Attempting to upsert ${results.length} channels...`);

    const { data, error } = await supabase
      .from('channels')
      .upsert(results, { onConflict: ['channel_id'] });

    if (error) {
      console.error('❌ Upsert failed:', error);
    } else {
      console.log(`✅ Upsert successful. Rows affected: ${data?.length ?? 0}`);
    }
  });
