'use client';

import ApiUsageChart from "@/components/ApiUsageChart";
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import Image from 'next/image';

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
    thumbnail_url: string;
  };
};

export default function Dashboard() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      const { data, error } = await supabase
        .from('channel_metrics')
        .select('channel_id, subscribers, views, videos, last_video_at, channels(friend_name, channel_name, thumbnail_url)');

      if (error) {
        console.error('Error fetching data:', error);
      } else {
        setChannels(data as Channel[]);
      }
      setLoading(false);
    };

    fetchMetrics();
  }, []);

  const now = new Date();
  const isActive = (dateStr: string) => {
    const last = new Date(dateStr);
    const days = (now.getTime() - last.getTime()) / 86400000;
    return days <= 30;
  };

  const latestMetrics = Object.values(
    (channels || []).reduce((acc, curr) => {
      if (
        !acc[curr.channel_id] ||
        new Date(curr.last_video_at) > new Date(acc[curr.channel_id].last_video_at)
      ) {
        acc[curr.channel_id] = curr;
      }
      return acc;
    }, {} as Record<string, Channel>)
  );

  const groupedByFriend = latestMetrics.reduce((acc, ch) => {
    const friend = ch.channels?.friend_name || 'Unknown';
    acc[friend] = acc[friend] || [];
    acc[friend].push(ch);
    return acc;
  }, {} as Record<string, Channel[]>);

  const stats = {
    total: Object.keys(groupedByFriend).length,
    mature: latestMetrics.filter(c => c.subscribers >= 1000 || c.videos >= 50).length,
    monetized: latestMetrics.filter(c => c.subscribers >= 1000).length,
    active: latestMetrics.filter(c => isActive(c.last_video_at)).length
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">🌱 Grounded Life YouTube Community</h1>
      <p className="text-sm text-muted-foreground">
        Total Channels: {stats.total} · Mature: {stats.mature} · Monetized: {stats.monetized} · Active this month: {stats.active}
      </p>
      <ApiUsageChart />

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">✅ Active</TabsTrigger>
          <TabsTrigger value="inactive">⚠️ Inactive</TabsTrigger>
        </TabsList>

        {['active', 'inactive'].map(tab => (
          <TabsContent key={tab} value={tab}>
            {Object.entries(groupedByFriend).map(([friend, list]) => {
              const filtered = list.filter(ch =>
                tab === 'active' ? isActive(ch.last_video_at) : !isActive(ch.last_video_at)
              );
              if (filtered.length === 0) return null;
              return (
                <div key={friend} className="mb-6">
                  <h2 className="text-xl font-semibold mb-2">👥 {friend}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filtered.map(c => (
                      <Card key={`${friend}-${c.channel_id}`} className="p-4 space-y-2">
                        <a href={`https://www.youtube.com/channel/${c.channel_id}`} target="_blank" rel="noopener noreferrer">
                          <Image
                            src={c.channels.thumbnail_url || '/default.jpg'}
                            alt={c.channels.channel_name}
                            width={80}
                            height={80}
                            className="rounded-full mx-auto"
                          />
                          <p className="text-center font-semibold mt-2">{c.channels.channel_name}</p>
                        </a>
                        <div className="text-sm text-center text-muted-foreground">
                          <p>{c.subscribers.toLocaleString()} subs</p>
                          <p>{c.views.toLocaleString()} views</p>
                          <p>{c.videos.toLocaleString()} videos</p>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
