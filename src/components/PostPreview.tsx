import type { ProviderMeta } from '@/lib/types';

const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

function MediaStrip({ media, dark }: { media: string[]; dark: boolean }) {
  if (media.length === 0) return null;
  return (
    <div className={`mt-2 grid gap-1.5 overflow-hidden rounded-xl ${media.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {media.slice(0, 4).map((id) =>
        IMAGE_RE.test(id) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={id} src={`/api/media/${id}`} alt="attachment" className="h-24 w-full object-cover" />
        ) : (
          <div
            key={id}
            className={`flex h-24 items-center justify-center text-2xl ${dark ? 'bg-slate-800' : 'bg-slate-100'}`}
          >
            🎬
          </div>
        ),
      )}
    </div>
  );
}

function Avatar({ name, dark }: { name: string; dark: boolean }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <div
      aria-hidden
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
        dark ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'
      }`}
    >
      {initial}
    </div>
  );
}

export default function PostPreview({
  meta,
  channelName,
  content,
  media,
}: {
  meta: ProviderMeta | null;
  channelName: string;
  content: string;
  media: string[];
}) {
  const provider = meta?.id ?? 'generic';
  const text = content || 'Your post content will appear here…';
  const empty = !content;

  if (provider === 'x') {
    return (
      <div className="rounded-2xl border border-slate-700/80 bg-black p-4">
        <div className="flex gap-3">
          <Avatar name={channelName} dark />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-sm">
              <span className="truncate font-bold text-white">{channelName}</span>
              <span className="shrink-0 text-slate-500">@{channelName.replace(/\W+/g, '').toLowerCase() || 'you'} · now</span>
            </div>
            <p className={`mt-0.5 whitespace-pre-wrap break-words text-sm ${empty ? 'italic text-slate-600' : 'text-slate-100'}`}>
              {text}
            </p>
            <MediaStrip media={media} dark />
            <div className="mt-3 flex justify-between text-xs text-slate-500" aria-hidden>
              <span>💬</span>
              <span>🔁</span>
              <span>❤️</span>
              <span>👁</span>
              <span>🔖</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (provider === 'linkedin') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900">
        <div className="flex items-center gap-2.5">
          <Avatar name={channelName} dark={false} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{channelName}</p>
            <p className="text-xs text-slate-500">now · 🌐</p>
          </div>
        </div>
        <p className={`mt-2 whitespace-pre-wrap break-words text-sm ${empty ? 'italic text-slate-400' : ''}`}>{text}</p>
        <MediaStrip media={media} dark={false} />
        <div className="mt-3 flex justify-between border-t border-slate-200 pt-2 text-xs text-slate-500" aria-hidden>
          <span>👍 Like</span>
          <span>💬 Comment</span>
          <span>🔁 Repost</span>
          <span>📤 Send</span>
        </div>
      </div>
    );
  }

  if (provider === 'bluesky') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900">
        <div className="flex gap-3">
          <Avatar name={channelName} dark={false} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm">
              <span className="truncate font-semibold">{channelName}</span>
              <span className="shrink-0 text-slate-500">@bsky.social · now</span>
            </div>
            <p className={`mt-0.5 whitespace-pre-wrap break-words text-sm ${empty ? 'italic text-slate-400' : ''}`}>{text}</p>
            <MediaStrip media={media} dark={false} />
            <div className="mt-3 flex gap-6 text-xs text-slate-500" aria-hidden>
              <span>💬</span>
              <span>🔁</span>
              <span>❤️</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Generic card for every other provider — dark, provider-color accent.
  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
      <div className="h-1" style={{ backgroundColor: meta?.color ?? '#6366f1' }} aria-hidden />
      <div className="p-4">
        <div className="flex items-center gap-2.5">
          <Avatar name={channelName} dark />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {meta?.icon} {channelName}
            </p>
            <p className="text-xs text-slate-500">
              {meta?.name ?? provider} · now
            </p>
          </div>
        </div>
        <p className={`mt-2 whitespace-pre-wrap break-words text-sm ${empty ? 'italic text-slate-600' : 'text-slate-200'}`}>
          {text}
        </p>
        <MediaStrip media={media} dark />
      </div>
    </div>
  );
}
