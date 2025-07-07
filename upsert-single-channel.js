import fs from 'fs';
import csv from 'csv-parser';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const filePath = '/Users/sarahharrell/Downloads/single_missing_channel.csv';
const rows = [];

fs.createReadStream(filePath)
  .pipe(csv())
  .on('data', (row) => {
    rows.push({
      friend_name: row.friend_name,
      channel_name: row.channel_name,
      channel_id: row.channel_id,
      channel_url: row.channel_url,
      channel_handle: row.channel_handle,
      thumbnail_url: row.thumbnail_url,
    });
  })
  .on('end', async () => {
    const { data, error } = await supabase
      .from('channels')
      .upsert(rows, { onConflict: ['channel_id'] });

    if (error) {
      console.error('❌ Upsert failed:', error.message);
    } else {
      console.log(`✅ Upsert successful for channel_id: ${rows[0].channel_id}`);
    }
  });
