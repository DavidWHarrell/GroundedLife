// update.js
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const YT_API_KEYS          = (process.env.YT_API_KEYS || '').split(',')
  .map(k => k.trim())
  .filter(k => k.length > 0);

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
      console.warn(`⚠️ YouTube API returned ${res.status} for key[${i}], rotating…`);
    } catch (e) {
      console.warn(`⚠️ YouTube fetch error with key[${i}]:`, e.message);
    }
  }
  throw new Error('⚠️ All YouTube API keys exhausted or failing');
}

function parseChannelId(url) {
  url = (url || '').trim();
  // https://www.youtube.com/channel/UCxxx
  if (url.includes('/channel/')) {
    return url.split('/channel/')[1].split(/[/?#]/)[0];
  }
  // custom handle: @somebody
  const m = url.match(/@([A-Za-z0-9_]+)/);
  if (m) return { handle: m[1] };
  return null;
}

async function resolveHandleToId(handle) {
  const data = await fetchWithRotation(key =>
    `https://www.googleapis.com/youtube/v3/search`
    + `?part=snippet&type=channel&q=${handle}&key=${key}`
  );
  return data.items?.[0]?.snippet?.channelId || null;
}

async function main() {
  // 1) fetch all channels
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
    const parsed = parseChannelId(channel_handle);
    if (typeof parsed === 'string') {
      channelId = parsed;
    } else if (parsed?.handle) {
      channelId = await resolveHandleToId(parsed.handle);
    }

    if (!channelId) {
      console.warn(`⚠️ Skipping record ${id}: cannot determine channelId from "${channel_handle}"`);
      continue;
    }

    // 3) fetch channel info
    let info;
    try {
      info = await fetchWithRotation(key =>
        `https://www.googleapis.com/youtube/v3/channels`
        + `?part=snippet,contentDetails,statistics`
        + `&id=${channelId}&key=${key}`
      );
    } catch (e) {
      console.warn(`⚠️ Skipping ${id}: stats fetch failed:`, e.message);
      continue;
    }

    const item = info.items?.[0];
    if (!item) {
      console.warn(`⚠️ No channel data for ID ${channelId}`);
      continue;
    }

    const { snippet, statistics, contentDetails } = item;
    const uploadsPlaylist = contentDetails.relatedPlaylists.uploads;

    // 4) fetch last video
    let lastVideoAt = null;
    if (uploadsPlaylist) {
      try {
        const upl = await fetchWithRotation(key =>
          `https://www.googleapis.com/youtube/v3/playlistItems`
          + `?part=snippet&maxResults=1&playlistId=${uploadsPlaylist}&key=${key}`
        );
        lastVideoAt = upl.items?.[0]?.snippet?.publishedAt || null;
      } catch (e) {
        console.warn(`⚠️ Could not fetch last-video for ${channelId}:`, e.message);
      }
    }

    // 5) update the channels row
    const updates = {
      channel_url:   channel_handle.trim(),
      channel_name:  snippet.title,
      thumbnail_url: snippet.thumbnails.default.url,
      override_id:   channelId
    };
    const { error: updErr } = await supabase
      .from('channels')
      .update(updates)
      .eq('id', id);

    if (updErr) {
      console.warn(`⚠️ channels.update failed for id=${id}:`, updErr);
    } else {
      console.log(`✅ [channels.${id}] fields updated`);
    }

    // 6) insert a history snapshot
    const metric = {
      channel_id:    id,
      subscribers:   Number(statistics.subscriberCount) || 0,
      views:         Number(statistics.viewCount)        || 0,
      videos:        Number(statistics.videoCount)       || 0,
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
