// update.js
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────
// ENV & CLIENT SETUP
// ─────────────────────────────────────────────────────────────────
const { SUPABASE_URL, SUPABASE_SERVICE_KEY, YT_API_KEYS } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

if (!YT_API_KEYS) {
  console.error('❌ Missing YT_API_KEYS (comma-separated list)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const ytKeys = YT_API_KEYS.split(',').map(k => k.trim()).filter(Boolean);

if (!ytKeys.length) {
  console.error('❌ YT_API_KEYS was provided but empty after split');
  process.exit(1);
}

// Simple backoff helper
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────
// Helper: try each YouTube key until one works (or all fail)
// ─────────────────────────────────────────────────────────────────
async function fetchWithKeys(urlBuilder) {
  for (const key of ytKeys) {
    const url = urlBuilder(key);
    try {
      const res = await fetch(url);
      const txt = await res.text();
      if (!res.ok) {
        // treat 403/400 as "quota or limit" and move on
        if (res.status === 403 || res.status === 400) {
          console.warn(`⚠️ Quota/API error with key ${key} → ${res.status}, trying next`);
          await sleep(100);
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      return JSON.parse(txt);
    } catch (err) {
      console.warn(`⚠️ Error for key ${key}: ${err.message}`);
      await sleep(100);
    }
  }
  throw new Error('❌ All YouTube API keys exhausted');
}

// ─────────────────────────────────────────────────────────────────
// Main runner
// ─────────────────────────────────────────────────────────────────
async function main() {
  // 1) load your channel rows
  const { data: channels, error: readErr } = await supabase
    .from('channels')
    .select('id,channel_handle')
    .eq('active', true);

  if (readErr) {
    console.error('❌ Supabase read channels failed:', readErr);
    process.exit(1);
  }

  for (const row of channels) {
    const { id, channel_handle } = row;
    console.log(`\n▶ Processing channel id=${id} handle=${channel_handle}`);

    // 2) extract YouTube ID
    let ytId = null;
    if (channel_handle.includes('/channel/')) {
      ytId = channel_handle.split('/channel/')[1].split(/[/?]/)[0];
    } else if (channel_handle.includes('@')) {
      const handle = channel_handle.split('@')[1].split(/[/?#]/)[0];
      try {
        const search = await fetchWithKeys(k =>
          `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(handle)}&key=${k}`
        );
        if (search.items?.length) ytId = search.items[0].snippet.channelId;
      } catch (e) {
        console.error(`❌ [channels.${id}] handle lookup failed: ${e.message}`);
      }
    }

    if (!ytId) {
      console.error(`❌ [channels.${id}] No YouTube ID found`);
      continue;
    }

    // 3) fetch channel metadata & stats
    let info;
    try {
      const chanRes = await fetchWithKeys(k =>
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${ytId}&key=${k}`
      );
      info = chanRes.items?.[0];
      if (!info) throw new Error('Empty items array');
    } catch (e) {
      console.error(`❌ [channels.${id}] Channel fetch failed: ${e.message}`);
      continue;
    }
    const { snippet, statistics, contentDetails } = info;

    // 4) update your FIVE fields in channels
    const updatePayload = {
      channel_url:   channel_handle,
      channel_id:    ytId,
      override_id:   ytId,
      channel_name:  snippet.title,
      thumbnail_url: snippet.thumbnails.default.url
    };
    const { error: updErr } = await supabase
      .from('channels')
      .update(updatePayload)
      .eq('id', id);

    if (updErr) {
      console.error(`❌ [channels.${id}] update failed:`, updErr);
    } else {
      console.log(`✅ [channels.${id}] channel_* fields updated`);
    }

    // 5) fetch last video date
    let lastVideoAt = null;
    try {
      const pl = contentDetails.relatedPlaylists.uploads;
      const upl = await fetchWithKeys(k =>
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=1&playlistId=${pl}&key=${k}`
      );
      if (upl.items?.length) lastVideoAt = upl.items[0].snippet.publishedAt;
    } catch (e) {
      console.warn(`❌ [channels.${id}] playlist fetch error: ${e.message}`);
    }

    // 6) insert metrics row
    const metricPayload = {
      channel_id:    id,
      fetched_at:    new Date().toISOString(),
      videos:        Number(statistics.videoCount)      || 0,
      subscribers:   Number(statistics.subscriberCount) || 0,
      views:         Number(statistics.viewCount)       || 0,
      last_video_at: lastVideoAt
    };
    const { error: metErr } = await supabase
      .from('channel_metrics')
      .insert(metricPayload);

    if (metErr) {
      console.error(`❌ [metrics.${id}] insert failed:`, metErr);
    } else {
      console.log(`✅ [metrics.${id}] row inserted`);
    }

    await sleep(200);
  }

  console.log('\n🏁 All done');
}

main().catch(e => {
  console.error('💥 Fatal error:', e);
  process.exit(1);
});
