// Shared DTO types — safe to import from both server and client code
// (this file must not import any node:* modules).

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
  plan: string; // 'free' | 'pro'
  created_at: string;
}

export interface ProviderField {
  key: string;
  label: string;
  secret?: boolean;
  optional?: boolean;
  placeholder?: string;
}

export interface ProviderMeta {
  id: string;
  name: string;
  icon: string;
  color: string;
  maxLength: number;
  supportsMedia: boolean;
  fields: ProviderField[];
}

export interface ChannelDTO {
  id: string;
  provider: string;
  name: string;
  status: string;
  created_at: string;
  provider_meta: ProviderMeta | null;
}

export interface TargetDTO {
  id: string;
  channel_id: string;
  channel_name: string | null;
  provider: string | null;
  status: string;
  published_at: string | null;
  error: string | null;
  retry_count: number;
  next_retry_at: string | null;
  external_url: string | null;
  content_override: string | null;
}

export interface PostDTO {
  id: string;
  content: string;
  media: string[];
  scheduled_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  targets: TargetDTO[];
}

export interface ApiKeyDTO {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

export interface UsageDTO {
  plan: 'free' | 'pro';
  channels: { used: number; limit: number };
  postsThisMonth: { used: number; limit: number };
  billingEnabled: boolean;
}

export interface AnalyticsDTO {
  totals: {
    channels: number;
    scheduled: number;
    publishedThisWeek: number;
    failed: number;
  };
  byProvider: { provider: string; count: number }[];
  last14Days: { date: string; count: number }[];
  recentLog: { id: number; at: string; level: string; message: string }[];
}
