ey// main.js
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

async function loadData() {
  // 1) Fetch the most recent metrics row for each channel
  const { data, error } = await supabase
    .from('channel_metrics')
    .select(`
      fetched_at,
      videos,
      subscribers,
      views,
      last_video_at,
      channels (
        friend_name,
        channel_name
      )
    `)
    .order('fetched_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Supabase fetch error:', error);
    return;
  }

  // 2) Build subscriber & view bar charts
  const labels = data.map(r => r.channels.channel_name);
  const subs   = data.map(r => r.subscribers);
  const views  = data.map(r => r.views);

  new Chart(document.getElementById('subsChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Subscribers', data: subs }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } }
    }
  });

  new Chart(document.getElementById('viewsChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Views', data: views }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } }
    }
  });

  // 3) Populate the table
  const tbody = document.querySelector('#channelTable tbody');
  tbody.innerHTML = ''; // clear any existing rows
  data.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.channels.friend_name}</td>
      <td>${r.channels.channel_name}</td>
      <td>${r.subscribers.toLocaleString()}</td>
      <td>${r.views.toLocaleString()}</td>
      <td>${new Date(r.last_video_at).toLocaleDateString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

window.addEventListener('DOMContentLoaded', loadData);
