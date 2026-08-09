'use client';

import { useEffect, useState } from 'react';
import Portal from '@/components/Portal';
import { useToast } from '@/components/toast';
import { btnDanger, btnPrimary, cardCls, EmptyState, ErrorBanner, inputCls, SkeletonCards } from '@/components/ui';
import { api, formatDate } from '@/lib/client';
import type { ChannelDTO, PublicUser, RssFeedDTO } from '@/lib/types';

export default function AutomationPage() {
  const toast = useToast();
  const [channels, setChannels] = useState<ChannelDTO[]>([]);
  const [feeds, setFeeds] = useState<RssFeedDTO[] | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  // RSS form
  const [url, setUrl] = useState('');
  const [feedChannels, setFeedChannels] = useState<Record<string, boolean>>({});
  const [intervalMin, setIntervalMin] = useState('60');
  const [aiCaption, setAiCaption] = useState(false);
  const [feedBusy, setFeedBusy] = useState(false);

  // Signature + webhook
  const [signature, setSignature] = useState('');
  const [signatureEnabled, setSignatureEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);

  function loadFeeds() {
    api<{ feeds: RssFeedDTO[] }>('/api/rss')
      .then((d) => setFeeds(d.feeds))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load feeds'));
  }

  useEffect(() => {
    loadFeeds();
    api<{ channels: ChannelDTO[] }>('/api/channels')
      .then((d) => setChannels(d.channels))
      .catch(() => {});
    api<{ user: PublicUser }>('/api/auth/me')
      .then((d) => {
        setUser(d.user);
        setSignature(d.user.signature ?? '');
        setSignatureEnabled(d.user.signature_enabled);
        setWebhookUrl(d.user.outbound_webhook_url ?? '');
      })
      .catch(() => {});
  }, []);

  const channelName = (id: string) => {
    const c = channels.find((x) => x.id === id);
    return c ? `${c.provider_meta?.icon ?? ''} ${c.name}` : 'deleted channel';
  };

  async function addFeed(e: React.FormEvent) {
    e.preventDefault();
    const channelIds = Object.keys(feedChannels).filter((k) => feedChannels[k]);
    if (channelIds.length === 0) {
      toast.error('Select at least one channel for the feed');
      return;
    }
    setFeedBusy(true);
    try {
      await api('/api/rss', {
        method: 'POST',
        json: { url: url.trim(), channelIds, interval_min: Number(intervalMin) || 60, ai_caption: aiCaption },
      });
      setUrl('');
      setFeedChannels({});
      setAiCaption(false);
      toast.success('RSS feed added — new items will be auto-scheduled');
      loadFeeds();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add feed');
    } finally {
      setFeedBusy(false);
    }
  }

  async function deleteFeed(f: RssFeedDTO) {
    if (!window.confirm(`Stop polling ${f.url}?`)) return;
    try {
      await api(`/api/rss?id=${encodeURIComponent(f.id)}`, { method: 'DELETE' });
      toast.success('Feed removed');
      setFeeds((list) => (list ?? []).filter((x) => x.id !== f.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function saveAutomation(e: React.FormEvent) {
    e.preventDefault();
    setSettingsBusy(true);
    try {
      await api('/api/settings/profile', {
        method: 'POST',
        json: {
          signature,
          signature_enabled: signatureEnabled,
          outbound_webhook_url: webhookUrl.trim() || null,
        },
      });
      toast.success('Automation settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSettingsBusy(false);
    }
  }

  return (
    <Portal title="Automation">
      <div className="mx-auto max-w-3xl space-y-6">
        <ErrorBanner message={error} />

        {/* RSS feeds */}
        <div className={cardCls}>
          <h2 className="font-semibold text-white">RSS auto-posting</h2>
          <p className="mt-1 text-xs text-slate-500">
            Poll a feed and automatically schedule new items to your channels.
          </p>

          <form onSubmit={addFeed} className="mt-4 space-y-3">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
              aria-label="Feed URL"
              className={inputCls}
              required
            />
            {channels.length === 0 ? (
              <p className="text-xs text-slate-500">
                No channels yet —{' '}
                <a href="/channels" className="text-indigo-400 hover:text-indigo-300">
                  connect one first
                </a>
                .
              </p>
            ) : (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Feed target channels">
                {channels.map((c) => {
                  const active = !!feedChannels[c.id];
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => setFeedChannels((s) => ({ ...s, [c.id]: !s[c.id] }))}
                      aria-pressed={active}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${
                        active
                          ? 'border-indigo-500 bg-indigo-600/20 text-indigo-200'
                          : 'border-slate-700 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {c.provider_meta?.icon} {c.name}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-slate-400">
                Poll every
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={intervalMin}
                  onChange={(e) => setIntervalMin(e.target.value)}
                  className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
                minutes
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={aiCaption}
                  onChange={(e) => setAiCaption(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-indigo-600"
                />
                ✨ Generate AI caption for each item
              </label>
              <button type="submit" disabled={feedBusy || channels.length === 0} className={`${btnPrimary} ml-auto`}>
                {feedBusy ? 'Adding…' : 'Add feed'}
              </button>
            </div>
          </form>

          <div className="mt-5">
            {feeds === null ? (
              <SkeletonCards count={2} height="h-16" />
            ) : feeds.length === 0 ? (
              <EmptyState icon="📡" title="No feeds yet" hint="Add a blog or news feed above and Postivo will schedule new items for you." />
            ) : (
              <ul className="divide-y divide-slate-800">
                {feeds.map((f) => (
                  <li key={f.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-200" title={f.url}>
                        {f.url}
                        {f.ai_caption && (
                          <span className="ml-2 rounded-full border border-indigo-800 bg-indigo-950/50 px-1.5 py-0.5 text-[10px] text-indigo-300">
                            ✨ AI captions
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        → {f.channel_ids.map(channelName).join(', ') || 'no channels'} · every {f.interval_min}m · last
                        polled {f.last_polled_at ? formatDate(f.last_polled_at) : 'never'}
                      </p>
                    </div>
                    <button onClick={() => void deleteFeed(f)} className={btnDanger} aria-label={`Delete feed ${f.url}`}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Signature + outbound webhook */}
        <form onSubmit={saveAutomation} className={`${cardCls} space-y-4`}>
          <div>
            <h2 className="font-semibold text-white">Signature & webhooks</h2>
            <p className="mt-1 text-xs text-slate-500">
              A signature is appended to every post at publish time. The outbound webhook receives a JSON event for
              every published or failed target.
            </p>
          </div>

          <div>
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={signatureEnabled}
                onChange={(e) => setSignatureEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-indigo-600"
              />
              Append signature to posts
            </label>
            <textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              rows={2}
              maxLength={500}
              disabled={!signatureEnabled}
              placeholder={'— Sent from Postivo\nhttps://yoursite.com'}
              aria-label="Post signature"
              className={`${inputCls} disabled:opacity-50`}
            />
          </div>

          <div>
            <label htmlFor="outbound-webhook" className="mb-1 block text-sm text-slate-300">
              Outbound webhook URL
            </label>
            <input
              id="outbound-webhook"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.example.com/postivo (leave empty to disable)"
              className={inputCls}
            />
          </div>

          <button type="submit" disabled={settingsBusy || !user} className={btnPrimary}>
            {settingsBusy ? 'Saving…' : 'Save automation settings'}
          </button>
        </form>
      </div>
    </Portal>
  );
}
