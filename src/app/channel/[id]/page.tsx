'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import Image from 'next/image';
import ApiUsageChart from '@/components/ApiUsageChart';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Channel = {
  channel_id: string;
  subscribers: number;
  views: number;
  videos: number;
  last_video_at: string;
  channels: {
    friend_name: string;
    channel_name: string;
    channel_url?: string;
    thumbnail_url?: string;
  };
};

function formatDate(dateString: string): string {
  const d = new Date(dateString);
  return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString();
}

export default function SummaryPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<'subscribers' | 'views' | 'videos' | 'last_video_at'>('subscribers');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showActive, setShowActive] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      const { data, error } = await supabase
        .from('channel_metrics')
        .select('channel_id, subscribers, views, videos, last_video_at, channels(friend_name, channel_name, channel_url, thumbnail_url)');

      if (error) {
        console.error('Error fetching data:', error);
      } else {
        const uniqueMap = new Map<string, Channel>();
        (data as Channel[]).forEach(c => {
          if (!uniqueMap.has(c.channel_id) || new Date(c.last_video_at) > new Date(uniqueMap.get(c.channel_id)!.last_video_at)) {
            uniqueMap.set(c.channel_id, c);
          }
        });
        setChannels(Array.from(uniqueMap.values()));
      }
      setLoading(false);
    };
    fetchMetrics();
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const stats = {
    total: channels.length,
    mature: channels.filter(c => c.subscribers >= 1000 || c.videos >= 50).length,
    monetized: channels.filter(c => c.subscribers >= 1000).length
  };
  const monetizedPct = stats.total ? Math.round((stats.monetized / stats.total) * 100) : 0;

  const handleSort = (key: typeof sortKey) => {
    if (key === sortKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const filtered = channels.filter(c => {
    const daysAgo = (Date.now() - new Date(c.last_video_at).getTime()) / (1000 * 60 * 60 * 24);
    return showActive ? daysAgo <= 30 : daysAgo > 30;
  });

  const sortedChannels = [...filtered].sort((a, b) => {
    const isDavidA = a.channels.channel_name === 'David and Sarah Travel';
    const isDavidB = b.channels.channel_name === 'David and Sarah Travel';
    if (showActive && isDavidA && !isDavidB) return -1;
    if (showActive && isDavidB && !isDavidA) return 1;
    if (!showActive && isDavidA && !isDavidB) return -1;
    if (!showActive && isDavidB && !isDavidA) return 1;
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const sortArrow = (key: typeof sortKey) => sortKey === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-10">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-center">Grounded Life Community YouTube Pages</h1>
        <p className="text-center text-muted-foreground">As of {today}</p>

        <div className="text-center space-y-2 text-lg">
          <p>Total Channels: {stats.total}</p>
          <p>Mature (≥50 videos or ≥1k subs): {stats.mature}</p>
          <p>Monetized (≥1k subs): {stats.monetized}</p>
          <p>% Monetized: {monetizedPct}%</p>
        </div>

        <div className="text-sm text-muted-foreground leading-relaxed border-t pt-4">
          <p>
            Normal YouTube channel monetization rate is less than 0.25%. So being part of the Grounded Life YouTube community can
            lead to much more success if you follow the guidance presented by Rob and Allie.
          </p>
          <p className="mt-2 italic">
            David and Sarah Travel is listed first as a courtesy to David for maintaining this list.
          </p>
        </div>

        <div className="pt-6 border-t">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">API Key Usage</h2>
          <div className="scale-75 origin-top-left max-w-xs">
            <ApiUsageChart fallbackMessage="No usage data found" />
          </div>
        </div>
      </div>

      <div className="border-t pt-10">
        <h2 className="text-2xl font-bold mb-4">Channel Spreadsheet</h2>

        <div className="mb-4">
          <button
            onClick={() => setShowActive(true)}
            className={`mr-2 px-3 py-1 rounded ${showActive ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            Active
          </button>
          <button
            onClick={() => setShowActive(false)}
            className={`px-3 py-1 rounded ${!showActive ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            Inactive
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full table-auto border">
            <thead>
              <tr className="bg-gray-100 text-left text-sm font-medium">
                <th className="p-2">Friend</th>
                <th className="p-2">Channel</th>
                <th className="p-2">YouTube</th>
                <th className="p-2">Thumb</th>
                <th className="p-2 cursor-pointer" onClick={() => handleSort('subscribers')}>Subscribers{sortArrow('subscribers')}</th>
                <th className="p-2 cursor-pointer" onClick={() => handleSort('views')}>Views{sortArrow('views')}</th>
                <th className="p-2 cursor-pointer" onClick={() => handleSort('videos')}>Videos{sortArrow('videos')}</th>
                <th className="p-2 cursor-pointer" onClick={() => handleSort('last_video_at')}>Last Video{sortArrow('last_video_at')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedChannels.map((c, i) => (
                <tr key={`${c.channel_id}`} className="border-t text-sm">
                  <td className="p-2 whitespace-nowrap">{c.channels.friend_name}</td>
                  <td className="p-2 whitespace-nowrap">
                    <Link href={`/channel/${c.channel_id}`} className="text-blue-600 hover:underline">
                      {c.channels.channel_name}
                    </Link>
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {c.channels.channel_url && (
                      <a href={c.channels.channel_url.startsWith('http') ? c.channels.channel_url : `https://www.youtube.com/${c.channels.channel_url}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                        Visit ↗
                      </a>
                    )}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {c.channels.thumbnail_url && (
                      <Image
                        src={c.channels.thumbnail_url}
                        alt="thumb"
                        width={40}
                        height={40}
                        className="rounded-full"
                      />
                    )}
                  </td>
                  <td className="p-2 whitespace-nowrap">{c.subscribers.toLocaleString()}</td>
                  <td className="p-2 whitespace-nowrap">{c.views.toLocaleString()}</td>
                  <td className="p-2 whitespace-nowrap">{c.videos}</td>
                  <td className="p-2 whitespace-nowrap">{formatDate(c.last_video_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
