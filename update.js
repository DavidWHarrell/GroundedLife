// update.js (DEBUG VERSION)
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

// ─── CONFIG ────────────────────────────────────────────────────────────────
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const YT_API_KEYS          = (process.env.YT_API_KEYS || '')
  .split(',')
  .map(k => k.trim())
  .filter(k => k);

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}
if (!YT_API_KEYS.length) {
  console.error('❌ Missing YT_API_KEYS');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});
let keyIndex = 0;

// ─── DEBUG HELPER ──────────────────────────────────────────────────────────
async function fetchWithKeysDebug(urlBuilder) {
  const errors = [];
  for (let i = 0; i < YT_API_KEYS.length; i++) {
    const key = YT_API_KEYS[keyIndex % YT_API_KEYS.length];
    keyIndex++;
    const url = urlBuilder(key);
    console.log(`\n🔑 [${i+1}/${YT_API_KEYS.length}] Trying key: ${key}`);
    console.log(`📡 URL: ${url}`);

    let res, text;
    try {
      res = await fetch(url);
    } catch (e) {
      console.error(`❌ Network fetch error: ${e.message}`);
      errors.push(`Network error with key ${key}: ${e.message}`);
      continue;
    }

    console.log(`🔢 Status: ${res.status}`);
    try {
      text = await res.text();
      console.log(`ℹ️ Body (first 500 chars):\n${text.slice(0, 500)}${text.length>500?'…':''}`);
    } catch (e) {
      console.error(`❌ Failed to read body: ${e.message}`);
      errors.push(`Body read error with key ${key}: ${e.message}`);
      continue;
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error(`❌ JSON parse error: ${e.message}`);
      errors.push(`JSON parse error with key ${key}: ${e.message}`);
      continue;
    }

    if (res.ok && !json.error) {
      console.log(`✅ Key worked, returning JSON.`);
      return json;
    }

    const msg = json.error?.message || `HTTP ${res.status}`;
    console.warn(`⚠️ API returned error: ${msg}`);
    errors.push(`API error with key ${key}: ${msg}`);
  }

  throw new Error(`All keys failed:\n${errors.join('\n')}`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────
async function main() {
  const { data: channels, error } = await supabase
    .from('channels')
    .select('id,channel_handle');
  if (error) throw error;
  if (!channels.length) {
    console.log('ℹ️ No channels to process.');
    return;
  }

  for (const { id: recordId, channel_handle } of channels) {
    const raw = (channel_handle||'').trim();
    if (!raw) {
      console.warn(`⚠️ Skipping blank handle for record ${recordId}`);
      continue;
    }
    console.log(`\n▶ Processing ${raw} (record ${recordId})`);

    // STEP 1: Extract or search for UC… ID
    let youtubeId = null;
    if (/\/channel\//i.test(raw)) {
      youtubeId = raw.split('/channel/')[1]?.split(/[^A-Za-z0-9_-]/)[0] || null;
      console.log(`🔍 Detected direct URL → ID = ${youtubeId}`);
    }
    if (!youtubeId && raw.startsWith('@')) {
      console.log(`🔍 Searching for handle ${raw}`);
      try {
        const searchJson = await fetchWithKeysDebug(key =>
          `https://www.googleapis.com/youtube/v3/search?` +
          `part=snippet&type=channel&maxResults=1` +
          `&q=${encodeURIComponent(raw.slice(1))}` +
          `&key=${key}`
        );
        youtubeId = searchJson.items?.[0]?.snippet?.channelId || null;
        console.log(`   → Search result channelId = ${youtubeId}`);
      } catch (e) {
        console.error(`❌ Search failed for ${raw}: ${e.message}`);
        continue;
      }
    }
    if (!youtubeId) {
      console.warn(`❌ Could not resolve channelId for ${raw}, skipping.`);
      continue;
    }

    // STEP 2: Fetch stats + uploads playlist
    let stats, uploads;
    try {
      console.log(`📡 Fetching stats for ${youtubeId}`);
      const chanJson = await fetchWithKeysDebug(key =>
        `https://www.googleapis.com/youtube/v3/channels?` +
        `part=statistics,contentDetails` +
        `&id=${youtubeId}` +
        `&key=${key}`
      );
      const item = chanJson.items?.[0];
      if (!item) throw new Error('No channel data returned');
      stats = item.statistics;
      uploads = item.contentDetails.relatedPlaylists.uploads;
      console.log(`   → stats=${JSON.stringify(stats)} uploads=${uploads}`);
    } catch (e) {
      console.error(`❌ Stats fetch failed for ${raw}: ${e.message}`);
      continue;
    }

    // STEP 3: Fetch last video date
    let lastVideoAt = null;
    if (uploads) {
      try {
        console.log(`📡 Fetching last video date for playlist ${uploads}`);
        const uplJson = await fetchWithKeysDebug(key =>
          `https://www.googleapis.com/youtube/v3/playlistItems?` +
          `part=snippet&maxResults=1&playlistId=${uploads}` +
          `&key=${key}`
        );
        lastVideoAt = uplJson.items?.[0]?.snippet?.publishedAt || null;
        console.log(`   → lastVideoAt=${lastVideoAt}`);
      } catch (e) {
        console.warn(`⚠️ Could not fetch last video date: ${e.message}`);
      }
    }

    // STEP 4: Insert into channel_metrics
    try {
      console.log(`💾 Inserting metric row for ${raw}`);
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
      if (insErr) throw insErr;
      console.log(`✅ Insert succeeded for ${raw}`);
    } catch (e) {
      console.error(`❌ Insert failed for ${raw}: ${e.message}`);
    }
  }
  console.log('\n✅ update.js completed');
}

main().catch(err => {
  console.error('\n❌ Fatal error in update.js:', err.message);
  process.exit(1);
});
