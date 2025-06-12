// update.js
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

////////////////////////////////////////////////////////////////////////////////
// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY= process.env.SUPABASE_SERVICE_KEY;
const YT_API_KEYS         = (process.env.YT_API_KEYS || '').split(',');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || YT_API_KEYS.length===0) {
  console.error('⚠️  Missing one of SUPABASE_URL, SUPABASE_SERVICE_KEY or YT_API_KEYS');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// simple sleep helper
const sleep = ms => new Promise(r => setTimeout(r, ms));

////////////////////////////////////////////////////////////////////////////////
// ─── YouTube fetch helper ────────────────────────────────────────────────────
async function fetchWithKeys(urlBuilder) {
  let lastError;
  for (let key of YT_API_KEYS) {
    try {
      const url = urlBuilder(key);
      const res = await fetch(url);
      if (!res.ok) {
        const txt = await res.text();
        lastError = new Error(`HTTP ${res.status}: ${txt}`);
        continue;
      }
      return await res.json();
    } catch (e) {
      lastError = e;
      continue;
    }
  }
  throw lastError;
}

////////////////////////////////////////////////////////////////////////////////
// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  // 1) load all channels
  const { data: channels, error: chErr } = await supabase
    .from('channels')
    .select('id,channel_handle,override_id');
  if (chErr) {
    console.error('❌ Supabase read channels failed:', chErr);
    process.exit(1);
  }

  for (let ch of channels) {
    const { id, channel_handle, override_id } = ch;
    const raw = (channel_handle||'').trim();
    // normalize URL
    let channelUrl = raw.startsWith('@')
      ? `https://www.youtube.com/${raw}`
      : raw;

    // 2) derive channelId
    let channelId = (override_id||'').startsWith('UC')
      ? override_id
      : '';
    if (!channelId) {
      if (channelUrl.includes('/channel/')) {
        channelId = channelUrl.split('/channel/')[1].split(/[/?]/)[0];
      } else if (raw.includes('@')) {
        const handle = raw.split('@')[1].split(/[/?#]/)[0];
        try {
          const search = await fetchWithKeys(k =>
            `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${handle}&key=${k}`
          );
          channelId = search.items?.[0]?.snippet?.channelId || '';
        } catch (e) {
          console.error(`❌ ID-lookup error for ${raw}:`, e.message);
          continue;
        }
      }
    }
    if (!channelId) {
      console.error(`❌ No channelId for ${raw}, skipping`);
      continue;
    }

    // 3) fetch snippet, statistics, contentDetails
    let stats, uploadsPlaylist, snippet;
    try {
      const js = await fetchWithKeys(k =>
        `https://www.googleapis.com/youtube/v3/channels?` +
        `part=snippet,statistics,contentDetails&id=${channelId}&key=${k}`
      );
      const itm = js.items?.[0];
      if (!itm) throw new Error('no items returned');
      stats = itm.statistics;
      uploadsPlaylist = itm.contentDetails.relatedPlaylists.uploads;
      snippet = itm.snippet;
    } catch (e) {
      console.error(`❌ Channel data error for ${channelId}:`, e.message);
      continue;
    }

    // 4) update channels table
    const upd = {
      channel_url:    channelUrl,
      channel_name:   snippet.title,
      thumbnail_url:  snippet.thumbnails.default.url
    };
    const { error: upErr } = await supabase
      .from('channels')
      .update(upd)
      .eq('id', id);
    if (upErr) console.error(`❌ channels.update(${id}) failed:`, upErr);

    // 5) fetch last‐video date
    let lastVideoAt = null;
    try {
      const pl = await fetchWithKeys(k =>
        `https://www.googleapis.com/youtube/v3/playlistItems?` +
        `part=snippet&maxResults=1&playlistId=${uploadsPlaylist}&key=${k}`
      );
      if (pl.items?.[0]?.snippet?.publishedAt) {
        lastVideoAt = pl.items[0].snippet.publishedAt;
      }
    } catch (e) {
      console.error(`❌ playlistItems error for ${channelId}:`, e.message);
    }

    // 6) insert into channel_metrics
    const row = {
      channel_id:    id,
      fetched_at:    new Date().toISOString(),
      videos:        parseInt(stats.videoCount,10) || 0,
      subscribers:   parseInt(stats.subscriberCount,10) || 0,
      views:         parseInt(stats.viewCount,10) || 0,
      last_video_at: lastVideoAt
    };
    const { error: insErr } = await supabase
      .from('channel_metrics')
      .insert(row);
    if (insErr) {
      console.error(`❌ channel_metrics.insert for ${id} failed:`, insErr);
    } else {
      console.log(`✅ metrics inserted for ${channelId}`);
    }

    // 7) rate-limit before next channel
    await sleep(1_000);
  }

  console.log('🏁 update.js completed');
}

main().catch(e=>{
  console.error('🔥 fatal error:', e);
  process.exit(1);
});
