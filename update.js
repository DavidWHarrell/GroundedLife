// update.js
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const YT_API_KEYS          = (process.env.YT_API_KEYS || '')
  .split(',').map(k=>k.trim()).filter(Boolean);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth:{persistSession:false}
});

let keyIndex = 0;
async function fetchWithKeys(urlBuilder) {
  const errs = [];
  for (let i=0; i<YT_API_KEYS.length; i++) {
    const key = YT_API_KEYS[keyIndex % YT_API_KEYS.length];
    keyIndex++;
    const url = urlBuilder(key);
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (res.ok && !json.error) return json;
      errs.push(json.error?.message||`HTTP ${res.status}`);
    } catch(e) { errs.push(e.message) }
  }
  throw new Error('YT keys failed:\n'+errs.join('\n'));
}

async function main(){
  const { data:channels, error:chanErr } =
    await supabase.from('channels').select('*');
  if (chanErr) throw chanErr;
  for (const ch of channels||[]) {
    const id = ch.id;
    console.log('▶', id, ch.channel_handle);

    // Always set channel_url from handle
    await supabase
      .from('channels')
      .update({ channel_url: ch.channel_handle })
      .eq('id', id);

    // Determine UC… ID
    let ytId = ch.override_id || null;
    if (!ytId) {
      if (/\/channel\//.test(ch.channel_handle)) {
        ytId = ch.channel_handle.split('/channel/')[1].split(/[/?]/)[0];
      } else {
        // search by handle
        const handle = ch.channel_handle.replace(/^@/, '');
        const js = await fetchWithKeys(k=>
          `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(handle)}&key=${k}`
        );
        ytId = js.items?.[0]?.snippet?.channelId || null;
      }
      if (ytId) {
        await supabase
          .from('channels')
          .update({ channel_id: ytId, override_id: ytId })
          .eq('id', id);
      }
    }
    if (!ytId) { console.warn('  no yt id'); continue; }

    // Fetch snippet+stats
    const cjson = await fetchWithKeys(k=>
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&id=${ytId}&key=${k}`
    );
    const info = cjson.items?.[0];
    if (!info) { console.warn('  no info'); continue; }

    // Always write title & thumbnail
    const title = info.snippet.title;
    const thumb = info.snippet.thumbnails.default.url;
    await supabase
      .from('channels')
      .update({ channel_name: title, thumbnail_url: thumb })
      .eq('id', id);

    // Metrics insert (once per day)
    const stats = info.statistics,
          uploads = info.contentDetails.relatedPlaylists.uploads;
    // get last video date...
    let lastVideo=null;
    if (uploads) {
      const pj = await fetchWithKeys(k=>
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=1&playlistId=${uploads}&key=${k}`
      );
      lastVideo = pj.items?.[0]?.snippet.publishedAt || null;
    }
    await supabase.from('channel_metrics').insert({
      channel_id: id,
      videos: Number(stats.videoCount)||0,
      subscribers: Number(stats.subscriberCount)||0,
      views: Number(stats.viewCount)||0,
      last_video_at: lastVideo,
      fetched_at: new Date().toISOString()
    });

    console.log('  ✅ updated', id);
  }
  console.log('✅ done');
}

main().catch(e=>{
  console.error('❌ error', e);
  process.exit(1);
});
