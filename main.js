// main.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://bqpjljsjsssvjuztaupz.supabase.co';
const SUPABASE_ANON = '<YOUR_ANON_PUBLIC_KEY>';  // safe for browser use

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

async function loadData() {
  // Fetch the latest snapshot for each channel
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

  if (error) return console.error(error);

  // Prepare arrays for charts
  const labels = data.map(r => r.channels.channel_name);
  const subs = data.map(r => r.subscribers);
  const vs   = data.map(r => r.views);

  // Subscribers bar chart
  new Chart(document.getElementById('subsChart'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Subscribers', data: subs }] },
    options:{ responsive:true, plugins:{ legend:{ display:false } } }
  });

  // Views bar chart
  new Chart(document.getElementById('viewsChart'), {
    type: 'bar',
    data: { labels, datasets:[{ label:'Views', data: vs }] },
    options:{ responsive:true, plugins:{ legend:{ display:false } } }
  });

  // Fill table
  const tbody = document.querySelector('#channelTable tbody');
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
