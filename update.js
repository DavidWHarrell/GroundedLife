// update.js
//
// Fetch and store YouTube channel metadata & daily metrics in Supabase.
// ––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
// Prerequisites (in your GitHub Actions or local env):
//   • SUPABASE_URL         = https://bqpjljsjsssvjuztaupz.supabase.co
//   • SUPABASE_SERVICE_KEY = (your full service_role key)
//   • YT_API_KEYS          = comma-separated list of valid YouTube Data API v3 keys
//
// Usage:
//   npm install node-fetch@2 @supabase/supabase-js
//   node update.js
//

import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

////////////////////////////////////////////////////////////////////////////////
// CONFIGURATION (via environment variables)

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const YT_API_KEYS          = (process.env.YT_API_KEYS || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}
if (!YT_API_KEYS.length) {
  console.error('❌ No YT_API_KEYS provided');
  process.exit(1);
}

// Create Supabase client (service role)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

// Round-robin index for YouTube API keys
let keyIndex = 0;

////////////////////////////////////////////////////////////////////////////////
// Helper: rotate through keys until a request succeeds

async function fetchWithKeys(urlBuilder) {
  const errors = [];
  for (let i = 0; i < YT_API_KEYS.length; i++) {
    const key = YT_API_KEYS[keyIndex % YT_API_KEYS.length];
    keyIndex++;
    const url = urlBuilder(key);
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (res.ok && !json.error) return json;
      errors.push(json.error?.message || `HTTP ${res.status}`);
    } catch (e) {
      errors.push(e.message);
    }
  }
  throw new Error('All YouTube API keys failed:\n' + errors.join('\n'));
}

////////////////////////////////////////////////////////////////////////////////
// Main updater

async function main() {
  // 1) Load all channels metadata
  const { data: channels, error: chanErr } = await supabase
    .from('channels')
    .select('id,channel_handle,override_id,thumbnail_url,created_at');
  if (chanErr) throw chanErr;
  if (!channels.length) {
    console.log('ℹ️ No channels to update');
    return;
  }

  const today = (new Date()).toDateString();

  for (const ch of channels) {
    const recordId = ch.id;
    let { channel_handle, override_id } = ch;
    let youtubeChannelId = override_id || null;

    console.log(`\n▶ Processing record ${recordId}: ${channel_handle}`);

    // 2) Normalize handle → full URL if needed
    if (channel_handle.startsWith('@')) {
      channel_handle = `https://www.youtube.com/${channel_handle}`;
      await supabase
        .from('channels')
        .update({ channel_url: channel_handle })
        .eq('id', recordId);
    }

    // 3) Extract or search for UC... ID
    if (!youtubeChannelId) {
      if (/\/channel\//.test(channel_handle)) {
        youtubeChannelId = channel_handle.split('/channel/')[1].split(/[/?]/)[0];
      } else {
        const handle = channel_handle.split('@')[1]?.split(/[/?#]/)[0];
        if (handle) {
          const searchJson = await fetchWithKeys(key =>
            `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel` +
            `&q=${encodeURIComponent(handle)}&key=${key}`
          );
          youtubeChannelId = searchJson.items?.[0]?.snippet?.channelId || null;
        }
      }
      if (youtubeChannelId) {
        await supabase
          .from('channels')
          .update({ channel_id: youtubeChannelId })
          .eq('id', recordId);
      }
    }
    if (!youtubeChannelId) {
      console.warn(`❌ No channel ID for record ${recordId}, skipping`);
      continue;
    }

    // 4) Avoid re-fetching unchanged channels more than once per day
    const { data: latestMetrics } = await supabase
      .from('channel_metrics')
      .select('fetched_at')
      .eq('channel_id', recordId)
      .order('fetched_at', { ascending: false })
      .limit(1);
    if (latestMetrics?.[0]?.fetched_at) {
      const last = new Date(latestMetrics[0].fetched_at).toDateString();
      if (last === today) {
        console.log(`⏭ Already updated today, skipping ${recordId}`);
        continue;
      }
    }

    // 5) Fetch channel details (statistics & uploads playlist)
    const channelJson = await fetchWithKeys(key =>
      `https://www.googleapis.com/youtube/v3/channels?` +
      `part=snippet,contentDetails,statistics` +
      `&id=${youtubeChannelId}&key=${key}`
    );
    const info = channelJson.items?.[0];
    if (!info) {
      console.warn(`❌ No channel info returned for ${youtubeChannelId}`);
      continue;
    }

    const snippet = info.snippet;
    const stats   = info.statistics;
    const uploads = info.contentDetails.relatedPlaylists.uploads;

    // 6) Update channel metadata (name, thumbnail)
    await supabase
      .from('channels')
      .update({
        channel_name:  snippet.title,
        thumbnail_url: snippet.thumbnails.default.url
      })
      .eq('id', recordId);

    // 7) Fetch last video date
    let lastVideoAt = null;
    if (uploads) {
      const uplJson = await fetchWithKeys(key =>
        `https://www.googleapis.com/youtube/v3/playlistItems?` +
        `part=snippet&maxResults=1&playlistId=${uploads}&key=${key}`
      );
      lastVideoAt = uplJson.items?.[0]?.snippet.publishedAt || null;
    }

    // 8) Insert today's metrics
    const { error: insErr } = await supabase
      .from('channel_metrics')
      .insert({
        channel_id:    recordId,
        videos:        Number(stats.videoCount)      || 0,
        subscribers:   Number(stats.subscriberCount) || 0,
        views:         Number(stats.viewCount)       || 0,
        last_video_at: lastVideoAt,
        fetched_at:    new Date().toISOString()
      });
    if (insErr) {
      console.error(`❌ Insert failed for ${recordId}:`, insErr);
    } else {
      console.log(`✅ Metrics recorded for ${recordId}`);
    }
  }

  console.log('\n✅ update.js completed');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
