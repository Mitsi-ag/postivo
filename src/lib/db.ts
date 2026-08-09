import path from 'node:path';
import fs from 'node:fs';
import pg from 'pg';

// Local-disk fallback dir (dev-mode media uploads + generated jwt_secret).
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');

fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

// Return timestamptz as clean ISO strings instead of Date objects.
pg.types.setTypeParser(1184, (v: string) => new Date(v).toISOString());
pg.types.setTypeParser(1114, (v: string) => new Date(v).toISOString());

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  timezone: string;
  plan: string; // 'free' | 'pro'
  stripe_customer_id: string | null;
  plan_renews_at: string | null;
  created_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

export interface Channel {
  id: string;
  user_id: string;
  provider: string;
  name: string;
  credentials: Record<string, string>; // jsonb
  status: string; // active | error
  created_at: string;
}

export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed';

export interface Post {
  id: string;
  user_id: string;
  content: string;
  media: string[]; // jsonb array of media ids
  scheduled_at: string | null;
  status: PostStatus;
  created_at: string;
  updated_at: string;
}

export type TargetStatus = 'pending' | 'publishing' | 'published' | 'failed';

export interface PostTarget {
  id: string;
  post_id: string;
  channel_id: string;
  content_override: string | null;
  status: TargetStatus;
  published_at: string | null;
  error: string | null;
  retry_count: number;
  next_retry_at: string | null;
  external_url: string | null;
}

export interface MediaItem {
  id: string;
  user_id: string;
  mime: string;
  created_at: string;
}

export interface PublishLog {
  id: number;
  target_id: string;
  at: string;
  level: string;
  message: string;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    plan TEXT NOT NULL DEFAULT 'free',
    stripe_customer_id TEXT,
    plan_renews_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    key_hash TEXT UNIQUE NOT NULL,
    key_prefix TEXT NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
  );
  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    name TEXT NOT NULL,
    credentials jsonb NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    media jsonb NOT NULL DEFAULT '[]',
    scheduled_at timestamptz,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS post_targets (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    content_override TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    published_at timestamptz,
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at timestamptz,
    external_url TEXT
  );
  CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    mime TEXT NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS publish_log (
    id SERIAL PRIMARY KEY,
    target_id TEXT NOT NULL,
    at timestamptz NOT NULL DEFAULT now(),
    level TEXT NOT NULL,
    message TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
  CREATE INDEX IF NOT EXISTS idx_targets_post ON post_targets(post_id);
  CREATE INDEX IF NOT EXISTS idx_targets_channel ON post_targets(channel_id);
  CREATE INDEX IF NOT EXISTS idx_targets_status ON post_targets(status, next_retry_at);
  CREATE INDEX IF NOT EXISTS idx_log_target ON publish_log(target_id);
`;

const g = globalThis as unknown as { __postivoPool?: pg.Pool; __postivoSchema?: Promise<void> };

export function getPool(): pg.Pool {
  if (!g.__postivoPool) {
    g.__postivoPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL ?? 'postgres://postivo:postivo@localhost:5432/postivo',
      max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
  }
  return g.__postivoPool;
}

// Idempotent schema bootstrap, run once per process on first use.
async function ensureSchema(): Promise<void> {
  if (!g.__postivoSchema) {
    g.__postivoSchema = getPool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((err) => {
        g.__postivoSchema = undefined; // allow retry on next query
        throw err;
      });
  }
  return g.__postivoSchema;
}

export type SqlValue = string | number | boolean | null | Date;

export async function query<T>(text: string, params: SqlValue[] = []): Promise<T[]> {
  await ensureSchema();
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

export async function one<T>(text: string, params: SqlValue[] = []): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}
