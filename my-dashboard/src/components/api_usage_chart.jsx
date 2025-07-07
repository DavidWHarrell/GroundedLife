// components/ApiUsageChart.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ApiUsageChart() {
  const [data, setData] = useState([]);

  useEffect(() => {
    const loadUsage = async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('api_key_usage')
        .select('key_label, count')
        .eq('date', today)
        .order('key_label');

      if (!error && data) {
        setData(data);
      } else {
        console.error('Failed to load usage data:', error);
      }
    };
    loadUsage();
  }, []);

  return (
    <div className="w-full max-w-3xl mx-auto p-4">
      <h2 className="text-xl font-semibold mb-4">🔑 API Key Usage Today</h2>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <XAxis dataKey="key_label" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count">
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.count >= 8000 ? '#ef4444' : entry.count >= 4000 ? '#facc15' : '#22c55e'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
