// Shared DTO types — safe to import from both server and client code
// (this file must not import any node:* modules).

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
  plan: string; // 'free' | 'pro'
  signature: string;
  signature_enabled: boolean;
  outbound_webhook_url: string | null;
  email_verified: boolean;
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
  supportsReply: boolean;
  supportsStats: boolean;
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
  external_id: string | null;
  stats: Record<string, number>;
  content_override: string | null;
}

export interface PostCommentDTO {
  content: string;
  delayMin: number;
}

export interface PostDTO {
  id: string;
  content: string;
  media: string[];
  scheduled_at: string | null;
  status: string;
  comments: PostCommentDTO[];
  repeat_every_days: number | null;
  tags: string[];
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
  engagement: { likes: number; reposts: number; replies: number; views: number; comments: number };
  byProvider: { provider: string; count: number }[];
  last14Days: { date: string; count: number }[];
  recentLog: { id: number; at: string; level: string; message: string }[];
}

export interface MediaListItemDTO {
  id: string;
  name: string;
  mime: string;
  size: number;
  url: string;
  created_at: string;
}

export interface RssFeedDTO {
  id: string;
  url: string;
  channel_ids: string[];
  interval_min: number;
  ai_caption: boolean;
  last_item_guid: string | null;
  last_polled_at: string | null;
  created_at: string;
}

export interface ChannelSetDTO {
  id: string;
  name: string;
  channel_ids: string[];
  created_at: string;
}
