import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const YT_API_KEYS = (process.env.YT_API_KEYS || '').split(',').map(k => k.trim());

// Validate environment variables
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || YT_API_KEYS.length === 0) {
  console.error('❌ Missing environment variables:');
  console.error(`  SUPABASE_URL: ${SUPABASE_URL || 'undefined'}`);
  console.error(`  SUPABASE_SERVICE_KEY: ${SUPABASE_SERVICE_KEY ? '[set]' : 'undefined'}`);
  console.error(`  YT_API_KEYS: ${YT_API_KEYS.length > 0 ? '[set]' : 'undefined'}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function testColumns() {
  console.log('⏳ Testing channels table columns...');
  const testPayload = {
    channel_url: 'test',
    channel_name: 'test',
    thumbnail_url: 'test',
    override_id: 'test'
  };
  const { error } = await supabase
    .from('channels')
    .update(testPayload)
    .eq('id', -1); // Use an ID that won't match to avoid actual updates
  if (error) {
    console.error('❌ Column test failed. Possible missing columns or permissions issue:', JSON.stringify(error, null, 2));
    console.error('Please ensure the channels table has columns: channel_url, channel_name, thumbnail_url, override_id');
    process.exit(1);
  }
  console.log('✅ Column test passed: Required columns appear to exist');
}

async function fetchWithRotation(urlBuilder) {
  for (let i = 0; i < YT_API_KEYS.length; i++) {
    const key = YT_API_KEYS[i];
    const url = urlBuilder(key);
    try {
      const res = await fetch(url);
      if (res.status === 200) {
        const data = await res.json();
        console.log(`DEBUG: YouTube API response for key[${i}]:`, JSON.stringify(data, null, 2));
        return data;
      }
      console.warn(`⚠️ YouTube API returned ${res.status} for key[${i}], will try next`);
    } catch (e) {
      console.warn(`⚠️ YouTube fetch error with key[${i}]:`, e.message);
    }
  }
  throw new Error('⚠️ All YouTube API keys exhausted or failing');
}

function extractChannelIdFromUrl(url) {
  url = (url || '').trim();
  console.log(`DEBUG: Extracting channel ID from URL: ${url}`);
  if (url.includes('/channel/')) {
    const channelId = url.split('/channel/')[1].split(/[?\/#]/)[0];
    console.log(`DEBUG: Extracted channelId: ${channelId}`);
    return channelId;
  }
  const m = url.match(/@([A-Za-z0-9_]+)/);
  if (m) {
    console.log(`DEBUG: Extracted handle: ${m[1]}`);
    return { handle: m[1] };
  }
  console.log('DEBUG: No channelId or handle found');
  return null;
}

async function resolveHandleToId(handle) {
  console.log(`DEBUG: Resolving handle: ${handle}`);
  const data = await fetchWithRotation(key =>
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${handle}&key=${key}`
  );
  if (data.items && data.items[0]?.snippet?.channelId) {
    const channelId = data.items[0].snippet.channelId;
    console.log(`DEBUG: Resolved handle ${handle} to channelId: ${channelId}`);
    return channelId;
  }
  console.warn(`⚠️ No channelId found for handle: ${handle}`);
  return null;
}

async function main() {
  // Test columns before processing
  await testColumns();

  // Load all channels
  console.log('⏳ Fetching channels...');
  const { data: rows, error: readErr } = await supabase
    .from('channels')
    .select('id,channel_handle');
  if (readErr) {
    console.error('❌ Supabase read channels failed:', JSON.stringify(readErr, null, 2));
    process.exit(1);
  }
  console.log(`✅ Found ${rows.length} channels to process`);

  let skippedCount = 0;
  for (const row of rows) {
    const { id, channel_handle } = row;
    console.log(`\n--- Processing channel id=${id} ---`);
    console.log(`DEBUG: channel_handle: ${channel_handle || 'NULL'}`);
    let channelId = null;

    // Extract or resolve channelId
    const extracted = extractChannelIdFromUrl(channel_handle);
    if (typeof extracted === 'string') {
      channelId = extracted;
    } else if (extracted?.handle) {
      channelId = await resolveHandleToId(extracted.handle);
    }

    if (!channelId) {
      console.warn(`⚠️ Could not determine channelId for id=${id}`);
      skippedCount++;
      continue;
    }
    console.log(`DEBUG: channelId: ${channelId}`);

    // Fetch stats + uploads playlist
    let info;
    try {
      info = await fetchWithRotation(key =>
        `https://www.googleapis.com/youtube/v3/channels?` +
        `part=snippet,contentDetails,statistics&id=${channelId}&key=${key}`
      );
    } catch (e) {
      console.warn(`⚠️ Skipping ${id} – stats fetch failed:`, e.message);
      skippedCount++;
      continue;
    }
    const item = info.items?.[0];
    if (!item) {
      console.warn(`⚠️ No channel data for ${channelId}`);
      skippedCount++;
      continue;
    }

    const { snippet, statistics, contentDetails } = item;
    console.log(`DEBUG: snippet.title: ${snippet?.title || 'NULL'}`);
    console.log(`DEBUG: thumbnail_url: ${snippet?.thumbnails?.default?.url || 'NULL'}`);

    const uploadsId = contentDetails?.relatedPlaylists?.uploads;

    // Fetch last video date
    let lastVideoAt = null;
    if (uploadsId) {
      try {
        const upl = await fetchWithRotation(key =>
          `https://www.googleapis.com/youtube/v3/playlistItems?` +
          `part=snippet&maxResults=1&playlistId=${uploadsId}&key=${key}`
        );
        lastVideoAt = upl.items?.[0]?.snippet?.publishedAt || null;
        console.log(`DEBUG: lastVideoAt: ${lastVideoAt || 'NULL'}`);
      } catch (e) {
        console.warn(`⚠️ Could not fetch last-video for ${channelId}:`, e.message);
      }
    }

    // Update channels table
    const upd = {
      channel_url: channel_handle ? channel_handle.trim() : null,
      channel_name: snippet.title || null,
      thumbnail_url: snippet.thumbnails?.default?.url || null,
      override_id: channelId
    };
    console.log(`DEBUG: Update payload for id=${id}:`, JSON.stringify(upd, null, 2));

    const { error: updErr } = await supabase
      .from('channels')
      .update(upd)
      .eq('id', id);

    if (updErr) {
      console.warn(`⚠️ channels.update failed for id=${id}:`, JSON.stringify(updErr, null, 2));
    } else {
      console.log(`✅ [channels.${id}] updated successfully`);
    }

    // Insert metric snapshot
    const metric = {
      channel_id: id,
      subscribers: Number(statistics.subscriberCount) || 0,
      views: Number(statistics.viewCount) || 0,
      videos: Number(statistics.videoCount) || 0,
      last_video_at: lastVideoAt
    };
    console.log(`DEBUG: Metric payload for id=${id}:`, JSON.stringify(metric, null, 2));
    const { error: insErr } = await supabase
      .from('channel_metrics')
      .insert(metric);

    if (insErr) {
      console.warn(`⚠️ channel_metrics.insert failed for id=${id}:`, JSON.stringify(insErr, null, 2));
    } else {
      console.log(`✅ [metrics.${id}] snapshot inserted`);
    }
  }

  console.log(`🏁 Processed ${rows.length - skippedCount} channels, skipped ${skippedCount}`);
}

main().catch(err => {
  console.error('❌ Fatal error:', JSON.stringify(err, null, 2));
  process.exit(1);
});
