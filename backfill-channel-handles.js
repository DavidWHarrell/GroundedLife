import fs from 'fs';
import csv from 'csv-parser';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const filePath = 'cleaned_channels_with_handle.csv';
const updates = [];

fs.createReadStream(filePath)
  .pipe(csv())
  .on('data', (row) => {
    updates.push({
      channel_id: row.channel_id,
      channel_handle: row.channel_handle,
    });
  })
  .on('end', async () => {
    console.log(`🔍 Checking ${updates.length} channels for missing handles...`);

    for (const entry of updates) {
      const { data, error } = await supabase
        .from('channels')
        .select('channel_handle')
        .eq('channel_id', entry.channel_id)
        .single();

      if (error) {
        console.error(`❌ Error fetching ${entry.channel_id}:`, error.message);
        continue;
      }

      if (!data.channel_handle || data.channel_handle.trim() === '') {
        const { error: updateError } = await supabase
          .from('channels')
          .update({ channel_handle: entry.channel_handle })
          .eq('channel_id', entry.channel_id);

        if (updateError) {
          console.error(`❌ Failed to update ${entry.channel_id}:`, updateError.message);
        } else {
          console.log(`✅ Updated channel_handle for ${entry.channel_id}`);
        }
      }
    }

    console.log('🎉 Backfill complete.');
  });
