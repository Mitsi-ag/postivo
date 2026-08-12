import type { ProviderMeta } from '@/lib/types';
import {
  BookmarkIcon,
  CommentIcon,
  EyeIcon,
  FilmIcon,
  HeartIcon,
  ProviderMark,
  RepostIcon,
  SendIcon,
} from '@/components/icons';

/*
 * PostPreview mimics each platform's native card — these deliberately keep
 * their own look (light LinkedIn/Bluesky cards, black X card). Portal chrome
 * tokens don't apply here; the frame around them does.
 */

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
            className={`flex h-24 items-center justify-center ${dark ? 'bg-neutral-800 text-neutral-500' : 'bg-slate-100 text-slate-400'}`}
          >
            <FilmIcon size={20} />
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
        dark ? 'bg-[#2f3336] text-white' : 'bg-indigo-100 text-indigo-700'
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
  when = 'now',
}: {
  meta: ProviderMeta | null;
  channelName: string;
  content: string;
  media: string[];
  when?: string;
}) {
  const provider = meta?.id ?? 'generic';
  const text = content || 'Your post content will appear here…';
  const empty = !content;

  if (provider === 'x') {
    return (
      <div className="rounded-2xl border border-[#2f3336] bg-black p-4 shadow-[0_8px_30px_rgba(0,0,0,.45)]">
        <div className="flex gap-3">
          <Avatar name={channelName} dark />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-sm">
              <span className="truncate font-bold text-white">{channelName}</span>
              <span className="shrink-0 text-[#71767b]">· {when}</span>
            </div>
            <p className={`mt-0.5 whitespace-pre-wrap break-words text-sm ${empty ? 'italic text-[#71767b]' : 'text-[#e7e9ea]'}`}>
              {text}
            </p>
            <MediaStrip media={media} dark />
            <div className="mt-3 flex justify-between text-[#71767b]" aria-hidden>
              <CommentIcon size={15} />
              <RepostIcon size={15} />
              <HeartIcon size={15} />
              <EyeIcon size={15} />
              <BookmarkIcon size={15} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (provider === 'linkedin') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-[0_8px_30px_rgba(0,0,0,.35)]">
        <div className="flex items-center gap-2.5">
          <Avatar name={channelName} dark={false} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{channelName}</p>
            <p className="text-xs text-slate-500">{when} · Anyone</p>
          </div>
        </div>
        <p className={`mt-2 whitespace-pre-wrap break-words text-sm ${empty ? 'italic text-slate-400' : ''}`}>{text}</p>
        <MediaStrip media={media} dark={false} />
        <div className="mt-3 flex justify-between border-t border-slate-200 pt-2 text-xs text-slate-500" aria-hidden>
          <span className="inline-flex items-center gap-1"><HeartIcon size={13} /> Like</span>
          <span className="inline-flex items-center gap-1"><CommentIcon size={13} /> Comment</span>
          <span className="inline-flex items-center gap-1"><RepostIcon size={13} /> Repost</span>
          <span className="inline-flex items-center gap-1"><SendIcon size={13} /> Send</span>
        </div>
      </div>
    );
  }

  if (provider === 'bluesky') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-[0_8px_30px_rgba(0,0,0,.35)]">
        <div className="flex gap-3">
          <Avatar name={channelName} dark={false} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm">
              <span className="truncate font-semibold">{channelName}</span>
              <span className="shrink-0 text-slate-500">· {when}</span>
            </div>
            <p className={`mt-0.5 whitespace-pre-wrap break-words text-sm ${empty ? 'italic text-slate-400' : ''}`}>{text}</p>
            <MediaStrip media={media} dark={false} />
            <div className="mt-3 flex gap-6 text-slate-500" aria-hidden>
              <CommentIcon size={15} />
              <RepostIcon size={15} />
              <HeartIcon size={15} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Generic card for every other provider — dark, provider-color accent.
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_8px_30px_rgba(0,0,0,.35)]">
      <div className="h-0.5" style={{ backgroundColor: meta?.color ?? '#6e6bf0' }} aria-hidden />
      <div className="p-4">
        <div className="flex items-center gap-2.5">
          <Avatar name={channelName} dark />
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-sm font-semibold text-fg">
              <ProviderMark id={meta?.id} name={meta?.name} color={meta?.color} size={16} />
              {channelName}
            </p>
            <p className="font-mono text-[11px] text-dim">
              {meta?.name ?? provider} · {when}
            </p>
          </div>
        </div>
        <p className={`mt-2 whitespace-pre-wrap break-words text-sm ${empty ? 'italic text-dim' : 'text-fg'}`}>
          {text}
        </p>
        <MediaStrip media={media} dark />
      </div>
    </div>
  );
}
