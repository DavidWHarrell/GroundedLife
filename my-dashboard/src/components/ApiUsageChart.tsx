'use client';

import React, { useEffect, useState } from 'react';
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

function ApiUsageChart({ fallbackMessage = 'No data' }: { fallbackMessage?: string }) {
  const [data, setData] = useState<{ key: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUsage = async () => {
const now = new Date();
const startDate = new Date(now);
startDate.setDate(startDate.getDate() - 2); // 2 days ago
const isoStart = startDate.toISOString().split('T')[0];

const { data, error } = await supabase
  .from('api_key_usage')
  .select('key_label, count, date')
  .gte('date', isoStart)
  .order('date', { ascending: true });


      if (!error && data) {
        setData(data);
      } else {
        console.error('Failed to load usage data:', error);
      }

      setLoading(false);
    };
    loadUsage();
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading usage data...</p>;
  if (data.length === 0) return <p className="text-sm text-muted-foreground">{fallbackMessage}</p>;

  return (
    <div className="w-full max-w-3xl mx-auto p-4">
      <h2 className="text-xl font-semibold mb-4">🔑 API Key Usage Today</h2>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
   <XAxis dataKey="key_label" />
<Tooltip
  formatter={(val: any) => `${val} queries`}
  labelFormatter={(label: any) => `Key: ${label}`}
/>
<Bar dataKey="count">
  {data.map((entry, index) => (
    <Cell
      key={`cell-${index}`}
      fill={
        entry.count >= 8000
          ? '#ef4444'
          : entry.count >= 4000
          ? '#facc15'
          : '#22c55e'
      }
    />
  ))}
</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default ApiUsageChart;
