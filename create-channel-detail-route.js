// create-channel-detail-route.js
import fs from 'fs';
import path from 'path';

const baseDir = './src/app/channel/[id]';
const filePath = path.join(baseDir, 'page.tsx');

// Replace this with the actual content from the "Channel-metrics-page" file
const fileContent = `// AUTO-GENERATED
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ChannelDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<any[]>([]);
  const [channelName, setChannelName] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      const { data: metrics, error } = await supabase
        .from('channel_metrics')
        .select('fetched_at, subscribers, views, channels(channel_name)')
        .eq('channel_id', id)
        .order('fetched_at', { ascending: true });

      if (!error && metrics.length) {
        setData(metrics);
        setChannelName(metrics[0].channels?.channel_name || id);
      }
    };

    if (id) fetchData();
  }, [id]);

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 space-y-8">
      <h1 className="text-2xl font-bold">📈 {channelName}</h1>

      {data.length === 0 ? (
        <p>No chart data available for this channel.</p>
      ) : (
        <>
          <div>
            <h2 className="font-semibold mb-2">Subscribers Over Time</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fetched_at" tickFormatter={(v) => new Date(v).toLocaleDateString()} />
                <YAxis />
                <Tooltip labelFormatter={(v) => new Date(v).toLocaleDateString()} />
                <Legend />
                <Line type="monotone" dataKey="subscribers" stroke="#8884d8" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="pt-8">
            <h2 className="font-semibold mb-2">Views Over Time</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fetched_at" tickFormatter={(v) => new Date(v).toLocaleDateString()} />
                <YAxis />
                <Tooltip labelFormatter={(v) => new Date(v).toLocaleDateString()} />
                <Legend />
                <Line type="monotone" dataKey="views" stroke="#82ca9d" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
`;

fs.mkdirSync(baseDir, { recursive: true });
fs.writeFileSync(filePath, fileContent, 'utf8');
console.log(`✅ Channel detail route created at ${filePath}`);
