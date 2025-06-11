// main.js
//
// Dashboard script for Grounded Life YouTube metrics.
// ————————————————
// 1) Include this file in dashboard.html with: <script type="module" src="main.js"></script>
// 2) Make sure dashboard.html <canvas> and <table> elements match these IDs:
//      - id="subsChart"
//      - id="viewsChart"
//      - table id="channelTable"
// ————————————————

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL       = 'https://bqpjljsjsssvjuztaupz.supabase.co';
const SUPABASE_ANON_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcGpsanNqc3Nzdmp1enRhdXB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1MDgzOTcsImV4cCI6MjA2NTA4NDM5N30.JSoiFcpKiYj_b5rapTl8jFIEDlTkSQGa85rpegivxKI'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// main.js (update this section)

async function loadData() {
  // 1) Fetch all channels metadata
  const { data: channels, error: chanErr } = await supabase
    .from('channels')
    .select('id,friend_name,channel_name');
  if (chanErr) return console.error('Channels fetch error:', chanErr);

  // 2) Fetch the most recent metrics for each channel
  //    We'll assume your updater inserts one row per channel each run,
  //    so the newest N rows (limit = channels.length) are the latest snapshot.
  const { data: metrics, error: metErr } = await supabase
    .from('channel_metrics')
    .select('channel_id,subscribers,views,last_video_at')
    .order('fetched_at', { ascending: false })
    .limit(channels.length);
  if (metErr) return console.error('Metrics fetch error:', metErr);

  // 3) Build a lookup map from channel_id → metrics
  const metricsById = {};
  for (const m of metrics) {
    if (!metricsById[m.channel_id]) {
      metricsById[m.channel_id] = m;
    }
  }

  // 4) Prepare chart data & table rows
  const labels = [], subs = [], vs = [];
  const tbody = document.querySelector('#channelTable tbody');
  tbody.innerHTML = '';

  channels.forEach(ch => {
    const m = metricsById[ch.id];
    // Skip channels with no metrics yet
    if (!m) return;

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
    tbody.appendChild(tr);
  });

  // 5) Draw charts
  new Chart(document.getElementById('subsChart'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Subscribers', data: subs }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
  new Chart(document.getElementById('viewsChart'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Views', data: vs }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
}
