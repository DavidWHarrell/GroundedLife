// main.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL      = 'https://bqpjljsjsssvjuztaupz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcGpsanNqc3Nzdmp1enRhdXB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1MDgzOTcsImV4cCI6MjA2NTA4NDM5N30.JSoiFcpKiYj_b5rapTl8jFIEDlTkSQGa85rpegivxKI'; 
;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function loadData() {
  console.log('➡️ Starting dashboard load');

  // 1) Fetch channel metadata
  console.log('⏳ Fetching channels...');
  const { data: channels, error: chanErr } = await supabase
    .from('channels')
    .select('id,friend_name,channel_name');
  if (chanErr) {
    console.error('❌ Error fetching channels:', chanErr);
    return;
  }
  console.log(`✅ Loaded ${channels.length} channels`);

  // 2) Fetch latest N metrics rows (N = number of channels)
  console.log('⏳ Fetching latest metrics...');
  const { data: metrics, error: metErr } = await supabase
    .from('channel_metrics')
    .select('channel_id,subscribers,views,last_video_at')
    .order('fetched_at', { ascending: false })
    .limit(channels.length);
  if (metErr) {
    console.error('❌ Error fetching metrics:', metErr);
    return;
  }
  console.log(`✅ Loaded ${metrics.length} metrics rows`);

  // 3) Build a lookup map
  const metricsById = {};
  metrics.forEach(m => { 
    if (!metricsById[m.channel_id]) metricsById[m.channel_id] = m;
  });

  // 4) Populate table and arrays
  const labels = [], subs = [], vs = [];
  const tbody = document.querySelector('#channelTable tbody');
  tbody.innerHTML = '';

  channels.forEach(ch => {
    const m = metricsById[ch.id];
    if (!m) {
      console.warn(`⚠️ No metrics for channel id=${ch.id}`);
      return;
    }
    labels.push(ch.channel_name);
    subs.push(m.subscribers);
    vs.push(m.views);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${ch.friend_name}</td>
      <td>${ch.channel_name}</td>
      <td>${m.subscribers.toLocaleString()}</td>
      <td>${m.views.toLocaleString()}</td>
      <td>${new Date(m.last_video_at).toLocaleDateString()}</td>
    `;
    tbody.append(tr);
  });

  // 5) Draw charts
  console.log('⏳ Drawing charts...');
  new Chart(document.getElementById('subsChart'), {
    type: 'bar',
    data: { labels, datasets: [{ label:'Subscribers', data: subs }] },
    options: { responsive:true, plugins:{ legend:{ display:false } } }
  });
  new Chart(document.getElementById('viewsChart'), {
    type: 'bar',
    data: { labels, datasets: [{ label:'Views', data: vs }] },
    options: { responsive:true, plugins:{ legend:{ display:false } } }
  });
  console.log('✅ Dashboard render complete');
}

window.addEventListener('DOMContentLoaded', loadData);
