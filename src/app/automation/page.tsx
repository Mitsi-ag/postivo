'use client';

import { useEffect, useState } from 'react';
import Portal from '@/components/Portal';
import { useToast } from '@/components/toast';
import { ProviderMark, RssIcon, SparkIcon } from '@/components/icons';
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
    return c ? c.name : 'deleted channel';
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
          <h2 className="font-semibold text-fg">RSS auto-posting</h2>
          <p className="mt-1 text-xs text-dim">
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
              <p className="text-xs text-dim">
                No channels yet —{' '}
                <a href="/channels" className="text-iris-soft hover:text-iris-soft">
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
                          ? 'border-iris bg-iris/10 text-iris-soft'
                          : 'border-line text-mut hover:border-line2'
                      }`}
                    >
                      <ProviderMark id={c.provider} name={c.provider_meta?.name ?? c.provider} color={c.provider_meta?.color} size={16} />
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-mut">
                Poll every
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={intervalMin}
                  onChange={(e) => setIntervalMin(e.target.value)}
                  className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-fg focus:border-iris focus:outline-none"
                />
                minutes
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-mut">
                <input
                  type="checkbox"
                  checked={aiCaption}
                  onChange={(e) => setAiCaption(e.target.checked)}
                  className="h-4 w-4 rounded border-line2 bg-surface accent-iris"
                />
                <SparkIcon size={13} className="text-iris-soft" />
                Generate AI caption for each item
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
              <EmptyState icon={<RssIcon size={18} />} title="No feeds yet" hint="Add a blog or news feed above and Postivo will schedule new items for you." />
            ) : (
              <ul className="divide-y divide-line/60">
                {feeds.map((f) => (
                  <li key={f.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-fg" title={f.url}>
                        {f.url}
                        {f.ai_caption && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-iris/30 bg-iris/10 px-1.5 py-0.5 font-mono text-[10px] text-iris-soft">
                            <SparkIcon size={9} />
                            AI captions
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-dim">
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
            <h2 className="font-semibold text-fg">Signature & webhooks</h2>
            <p className="mt-1 text-xs text-dim">
              A signature is appended to every post at publish time. The outbound webhook receives a JSON event for
              every published or failed target.
            </p>
          </div>

          <div>
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={signatureEnabled}
                onChange={(e) => setSignatureEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-line2 bg-surface accent-iris"
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
            <label htmlFor="outbound-webhook" className="mb-1 block text-sm text-fg">
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
