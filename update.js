// update.js
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
// comma-separated in env, e.g.
//   YT_API_KEYS="KEY1,KEY2,KEY3,KEY4"
const YT_API_KEYS = (process.env.YT_API_KEYS || '').split(',').map(k => k.trim());

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || YT_API_KEYS.length === 0) {
  console.error('❌ Missing one of SUPABASE_URL, SUPABASE_SERVICE_KEY or YT_API_KEYS');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function fetchWithRotation(urlBuilder) {
  for (let i = 0; i < YT_API_KEYS.length; i++) {
    const key = YT_API_KEYS[i];
    const url = urlBuilder(key);
    try {
      const res = await fetch(url);
      if (res.status === 200) return await res.json();
      // treat 4xx/5xx as a failure to rotate
      console.warn(`⚠️ YouTube API returned ${res.status} for key[${i}], will try next`);
    } catch (e) {
      console.warn(`⚠️ YouTube fetch error with key[${i}]:`, e.message);
    }
  }
  throw new Error('⚠️ All YouTube API keys exhausted or failing');
}

function extractChannelIdFromUrl(url) {
  url = (url||'').trim();
  if (url.includes('/channel/')) {
    return url.split('/channel/')[1].split(/[?\/#]/)[0];
  }
  // handle @handles or custom URLs
  const m = url.match(/@([A-Za-z0-9_]+)/);
  if (m) return { handle: m[1] };
  return null;
}

async function resolveHandleToId(handle) {
  const data = await fetchWithRotation(key =>
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${handle}&key=${key}`
  );
  if (data.items && data.items[0]?.snippet?.channelId) {
    return data.items[0].snippet.channelId;
  }
  return null;
}

async function main() {
  // 1) Load all channels
  const { data: rows, error: readErr } = await supabase
    .from('channels')
    .select('id,channel_handle');
  if (readErr) {
    console.error('❌ Supabase read channels failed:', readErr);
    process.exit(1);
  }

  for (const row of rows) {
    const { id, channel_handle } = row;
    let channelId = null;

    // 2) extract or resolve
    const extracted = extractChannelIdFromUrl(channel_handle);
    if (typeof extracted === 'string') {
      channelId = extracted;
    } else if (extracted?.handle) {
      channelId = await resolveHandleToId(extracted.handle);
    }

    if (!channelId) {
      console.warn(`⚠️ Could not determine channelId for record id=${id}`);
      continue;
    }

    // 3) fetch stats + uploads playlist
    let info;
    try {
      info = await fetchWithRotation(key =>
        `https://www.googleapis.com/youtube/v3/channels?` +
        `part=snippet,contentDetails,statistics&id=${channelId}&key=${key}`
      );
    } catch (e) {
      console.warn(`⚠️ Skipping ${id} – stats fetch failed:`, e.message);
      continue;
    }
    const item = info.items?.[0];
    if (!item) {
      console.warn(`⚠️ No channel data for ${channelId}`);
      continue;
    }

    const { snippet, statistics, contentDetails } = item;
    const uploadsId = contentDetails?.relatedPlaylists?.uploads;

    // 4) fetch last video date
    let lastVideoAt = null;
    if (uploadsId) {
      try {
        const upl = await fetchWithRotation(key =>
          `https://www.googleapis.com/youtube/v3/playlistItems?`+
          `part=snippet&maxResults=1&playlistId=${uploadsId}&key=${key}`
        );
        lastVideoAt = upl.items?.[0]?.snippet?.publishedAt || null;
      } catch (e) {
        console.warn(`⚠️ Could not fetch last-video for ${channelId}:`, e.message);
      }
    }

    // 5) update the channels table
    const upd = {
      channel_url:   channel_handle.trim(),
      channel_name:  snippet.title,
      thumbnail_url: snippet.thumbnails.default.url,
      override_id:   channelId
    };
    const { error: updErr } = await supabase
      .from('channels')
      .update(upd)
      .eq('id', id);

    if (updErr) {
      console.warn(`⚠️ channels.update failed for id=${id}:`, updErr);
    } else {
      console.log(`✅ [channels.${id}] updated`);
    }

    // 6) insert a metric snapshot
    const metric = {
      channel_id:   id,                       // FK to channels.id
      subscribers:  Number(statistics.subscriberCount)||0,
      views:        Number(statistics.viewCount)||0,
      videos:       Number(statistics.videoCount)||0,
      last_video_at: lastVideoAt
    };
    const { error: insErr } = await supabase
      .from('channel_metrics')
      .insert(metric);

    if (insErr) {
      console.warn(`⚠️ channel_metrics.insert failed for id=${id}:`, insErr);
    } else {
      console.log(`✅ [metrics.${id}] snapshot inserted`);
    }
  }

  console.log('🏁 All done');
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
