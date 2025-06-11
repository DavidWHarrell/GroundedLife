// update.js

import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

// Round-robin key rotation
let keyIndex = 0;
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

async function main() {
  // 1) Load all channels from Supabase
  const { data: channels, error: chanErr } = await supabase
    .from('channels')
    .select('*');
  if (chanErr) throw chanErr;
  if (!channels.length) {
    console.log('ℹ️ No channels to process.');
    return;
  }

  const today = new Date().toDateString();

  for (const ch of channels) {
    const recordId = ch.id;
    let { channel_handle, override_id, channel_id, channel_url } = ch;

    console.log(`\n▶ Processing record ${recordId}: ${channel_handle}`);

    // 2) Normalize and save channel_url
    let newUrl = channel_url;
    if (channel_handle.startsWith('@')) {
      newUrl = `https://www.youtube.com/${channel_handle}`;
    } else if (/^https?:\/\//.test(channel_handle)) {
      newUrl = channel_handle;
    }
    if (newUrl !== channel_url) {
      await supabase
        .from('channels')
        .update({ channel_url: newUrl })
        .eq('id', recordId);
      channel_url = newUrl;
      console.log('   • Updated channel_url');
    }

    // 3) Determine YouTube channel ID (use override_id if present)
    let ytId = override_id || channel_id || null;
    if (!ytId) {
      if (/\/channel\//.test(channel_url)) {
        ytId = channel_url.split('/channel/')[1].split(/[/?]/)[0];
      } else {
        // search by handle without '@'
        const handle = channel_handle.replace(/^@/, '');
        const searchJson = await fetchWithKeys(key =>
          `https://www.googleapis.com/youtube/v3/search?` +
          `part=snippet&type=channel&maxResults=1` +
          `&q=${encodeURIComponent(handle)}` +
          `&key=${key}`
        );
        ytId = searchJson.items?.[0]?.snippet?.channelId || null;
        if (ytId) {
          // save override_id
          await supabase
            .from('channels')
            .update({ override_id: ytId })
            .eq('id', recordId);
          console.log('   • Saved override_id');
        }
      }
      if (ytId) {
        await supabase
          .from('channels')
          .update({ channel_id: ytId })
          .eq('id', recordId);
        console.log('   • Saved channel_id');
      }
    }
    if (!ytId) {
      console.warn('   ⚠️ No YouTube ID found, skipping');
      continue;
    }

    // 4) Avoid duplicate daily metrics
    const { data: lastRow } = await supabase
      .from('channel_metrics')
      .select('fetched_at')
      .eq('channel_id', recordId)
      .order('fetched_at', { ascending: false })
      .limit(1);
    if (lastRow?.[0]?.fetched_at) {
      const lastDate = new Date(lastRow[0].fetched_at).toDateString();
      if (lastDate === today) {
        console.log('   ⏭ Already updated today, skipping metrics');
        continue;
      }
    }

    // 5) Fetch channel details from YouTube
    const chanJson = await fetchWithKeys(key =>
      `https://www.googleapis.com/youtube/v3/channels?` +
      `part=snippet,contentDetails,statistics` +
      `&id=${ytId}&key=${key}`
    );
    const info = chanJson.items?.[0];
    if (!info) {
      console.warn('   ❌ No channel info returned, skipping');
      continue;
    }

    const snippet = info.snippet;
    const stats   = info.statistics;
    const uploads = info.contentDetails.relatedPlaylists.uploads;

    // 6) Save snippet metadata
    await supabase
      .from('channels')
      .update({
        channel_name:  snippet.title,
        thumbnail_url: snippet.thumbnails.default.url
      })
      .eq('id', recordId);
    console.log('   • Updated channel_name & thumbnail_url');

    // 7) Fetch last video date
    let lastVideo = null;
    if (uploads) {
      const uplJson = await fetchWithKeys(key =>
        `https://www.googleapis.com/youtube/v3/playlistItems?` +
        `part=snippet&maxResults=1&playlistId=${uploads}` +
        `&key=${key}`
      );
      lastVideo = uplJson.items?.[0]?.snippet?.publishedAt || null;
    }

    // 8) Insert metrics row
    const { error: insErr } = await supabase
      .from('channel_metrics')
      .insert({
        channel_id:    recordId,
        videos:        Number(stats.videoCount)      || 0,
        subscribers:   Number(stats.subscriberCount) || 0,
        views:         Number(stats.viewCount)       || 0,
        last_video_at: lastVideo,
        fetched_at:    new Date().toISOString()
      });
    if (insErr) {
      console.error('   ❌ Insert metrics failed:', insErr);
    } else {
      console.log('   ✅ Metrics recorded');
    }
  }

  console.log('\n✅ update.js completed');
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
