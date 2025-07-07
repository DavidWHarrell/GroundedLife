// update.js — Safe version with no Supabase relationship joins, JS-side filtering only

import dotenv from 'dotenv';
dotenv.config();

import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const API_KEYS = process.env.YT_API_KEYS.split(',');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function logApiUsage(keyLabel, units = 1) {
  const today = new Date().toISOString().split('T')[0];

  const { data: existing, error: fetchError } = await supabase
    .from('api_key_usage')
    .select('count')
    .eq('key_label', keyLabel)
    .eq('date', today)
    .single();

  const newCount = existing?.count ? existing.count + units : units;

  const { error } = await supabase
    .from('api_key_usage')
    .upsert({
      key_label: keyLabel,
      date: today,
      count: newCount,
      last_used_at: new Date().toISOString()
    }, {
      onConflict: ['key_label', 'date']
    });

  if (error) {
    console.error(`❌ Failed to log usage for ${keyLabel}:`, error.message);
  }
}

async function fetchWithKeyRotation(urlBuilder, cost = 1) {
  for (let i = 0; i < API_KEYS.length; i++) {
    const key = API_KEYS[i];
    try {
      const url = urlBuilder(key);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await logApiUsage(`KEY ${i + 1}`, cost);  // 💥 log cost per request
      return await res.json();
    } catch (e) {
      if (/quota|403|exceeded/.test(e.message)) {
        console.warn(`⚠️ Quota hit for KEY ${i + 1}`);
        continue;
      }
      throw e;
    }
  }
  throw new Error('❌ All API keys exhausted.');
}

async function getAllChannels() {
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .is('unreachable', null);

  if (error) throw new Error(`Failed to load channels: ${error.message}`);
  return data;
}

async function getLastFetched(channelId) {
  const { data, error } = await supabase
    .from('channel_metrics')
    .select('fetched_at')
    .eq('channel_id', channelId)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .single();

  return error ? null : data?.fetched_at;
}

async function saveMetric(channel, stats, lastVideoDate) {
  const { error } = await supabase.from('channel_metrics').insert({
    channel_id: channel.id,
    videos: parseInt(stats.videoCount || '0'),
    subscribers: parseInt(stats.subscriberCount || '0'),
    views: parseInt(stats.viewCount || '0'),
    last_video_at: lastVideoDate || null,
    fetched_at: new Date().toISOString()
  });
  if (error) console.error(`❌ Failed to save metric for ${channel.channel_name}:`, error.message);
}

async function getLastVideoDate(channelId) {
  const details = await fetchWithKeyRotation(k => `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${k}`);
  const uploads = details?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return null;
  const pl = await fetchWithKeyRotation(k => `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=1&playlistId=${uploads}&key=${k}`);
  return pl?.items?.[0]?.snippet?.publishedAt || null;
}

async function markUnreachable(channelId) {
  await supabase.from('channels').update({ unreachable: true }).eq('id', channelId);
}

async function update() {
  const channels = await getAllChannels();
  console.log(`🔍 Found ${channels.length} total channels...`);

  const recentChannels = [];
  const cutoff = Date.now() - 24 * 3600000;

  for (const ch of channels) {
    const lastFetched = await getLastFetched(ch.id);
    if (!lastFetched || new Date(lastFetched).getTime() < cutoff) {
      recentChannels.push(ch);
    }
  }

  console.log(`🚀 Starting update for ${recentChannels.length} channels...`);

  let updated = 0;
  for (const channel of recentChannels) {
    try {
      const statsRes = await fetchWithKeyRotation(k =>
        `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channel.channel_id}&key=${k}`
      );
      const stats = statsRes?.items?.[0]?.statistics;
      if (!stats) throw new Error('Missing stats');

      const lastVideoAt = await getLastVideoDate(channel.channel_id);
      await saveMetric(channel, stats, lastVideoAt);

      console.log(`✅ Updated: ${channel.channel_name}`);
      updated++;
    } catch (e) {
      console.warn(`❌ Skipped ${channel.channel_name || channel.channel_id}: ${e.message}`);
      await markUnreachable(channel.id);
    }
  }

  console.log(`🏁 Finished. Updated: ${updated}, Skipped: ${recentChannels.length - updated}`);
}

update();
