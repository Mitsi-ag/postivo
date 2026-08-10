import crypto from 'node:crypto';
import { rateLimit } from './ratelimit';

/*
 * Transactional email via Amazon SES v2 (SendEmail), signed by hand with AWS
 * Signature Version 4 — zero new dependencies, just node:crypto and fetch.
 *
 * Env-gated: with EMAIL_ENABLED !== 'true' every send logs
 * `[mail] would send: <subject>` and resolves ok, so auth flows behave
 * identically in dev/tests without touching the network.
 *
 * Credentials come from the environment (AWS_ACCESS_KEY_ID /
 * AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN) or, when running on ECS /
 * App Runner, from the container-credentials endpoint at 169.254.170.2
 * (AWS_CONTAINER_CREDENTIALS_RELATIVE_URI) with cached refresh on expiry.
 */

const SES_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-southeast-2';
const SES_SERVICE = 'ses';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailResult {
  ok: boolean;
  rateLimited?: boolean;
  error?: string;
}

export function emailEnabled(): boolean {
  return process.env.EMAIL_ENABLED === 'true' && !!process.env.EMAIL_FROM;
}

// ---------- AWS credentials ----------

interface AwsCreds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiresAt?: number; // epoch ms, from ECS metadata Expiration
}

let cachedTaskCreds: AwsCreds | null = null;

async function getCredentials(): Promise<AwsCreds | null> {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
    };
  }
  // ECS / App Runner task role credentials (169.254.170.2 link-local endpoint).
  // Cached; refreshed 5 minutes before the stated expiry.
  if (cachedTaskCreds && (!cachedTaskCreds.expiresAt || cachedTaskCreds.expiresAt - 5 * 60_000 > Date.now())) {
    return cachedTaskCreds;
  }
  const rel = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
  if (!rel) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2_000);
    const res = await fetch(`http://169.254.170.2${rel}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      AccessKeyId?: string;
      SecretAccessKey?: string;
      Token?: string;
      Expiration?: string;
    };
    if (!data.AccessKeyId || !data.SecretAccessKey) return null;
    cachedTaskCreds = {
      accessKeyId: data.AccessKeyId,
      secretAccessKey: data.SecretAccessKey,
      sessionToken: data.Token || undefined,
      expiresAt: data.Expiration ? Date.parse(data.Expiration) : undefined,
    };
    return cachedTaskCreds;
  } catch {
    return null;
  }
}

// ---------- SigV4 ----------

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

async function sendSes(msg: MailMessage, creds: AwsCreds): Promise<void> {
  const host = `email.${SES_REGION}.amazonaws.com`;
  const body = JSON.stringify({
    FromEmailAddress: process.env.EMAIL_FROM,
    Destination: { ToAddresses: [msg.to] },
    Content: {
      Simple: {
        Subject: { Data: msg.subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: msg.text, Charset: 'UTF-8' },
          Html: { Data: msg.html, Charset: 'UTF-8' },
        },
      },
    },
  });

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = {
    'content-type': 'application/x-amz-json-1.0',
    host,
    'x-amz-date': amzDate,
    'x-amz-target': 'SimpleEmailServiceV2.SendEmail',
  };
  if (creds.sessionToken) headers['x-amz-security-token'] = creds.sessionToken;

  const signedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k].trim()}\n`).join('');
  const signedHeaders = signedHeaderKeys.join(';');
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256Hex(body)].join('\n');

  const scope = `${dateStamp}/${SES_REGION}/${SES_SERVICE}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  // Derivation chain: dateStamp -> region -> service -> aws4_request.
  let key: Buffer = hmac(`AWS4${creds.secretAccessKey}`, dateStamp);
  key = hmac(key, SES_REGION);
  key = hmac(key, SES_SERVICE);
  key = hmac(key, 'aws4_request');
  const signature = hmac(key, stringToSign).toString('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}/`, {
    method: 'POST',
    headers: { ...headers, authorization },
    body,
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`SES SendEmail failed: ${res.status} ${detail}`);
  }
}

// ---------- public send API ----------

// Outbound cap: at most 5 emails per minute per recipient, regardless of
// which flow triggered them. Protects SES quota and recipient inboxes.
export async function sendMail(msg: MailMessage): Promise<MailResult> {
  if (!rateLimit(`mail:${msg.to.toLowerCase()}`, 5, 60_000)) {
    console.warn(`[mail] rate-limited: ${msg.to} (${msg.subject})`);
    return { ok: false, rateLimited: true };
  }
  if (!emailEnabled()) {
    console.log(`[mail] would send: ${msg.subject}`);
    return { ok: true };
  }
  try {
    const creds = await getCredentials();
    if (!creds) throw new Error('no AWS credentials (env or container metadata endpoint)');
    await sendSes(msg, creds);
    return { ok: true };
  } catch (err) {
    console.warn(`[mail] send failed (${msg.subject}):`, err instanceof Error ? err.message : err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------- branded templates ----------
// Email-safe: table layout, inline styles, system font stack. Mirrors the app
// design system — ink background, iris accent, Space Grotesk with fallbacks.

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT = `'Space Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

function layout(o: {
  heading: string;
  paragraphs: string[]; // authored by us — may contain inline HTML
  cta?: { label: string; url: string };
  note?: string;
}): string {
  const paragraphs = o.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:14px;line-height:1.65;color:#9aa3b5;">${p}</p>`)
    .join('\n');
  const cta = o.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 0;">
        <tr><td align="center" bgcolor="#6e6bf0" style="border-radius:8px;">
          <a href="${escapeHtml(o.cta.url)}" target="_blank"
             style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(o.cta.label)}</a>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#78829a;word-break:break-all;">Button not working? Paste this link into your browser:<br>${escapeHtml(o.cta.url)}</p>`
    : '';
  const note = o.note
    ? `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #20242f;font-size:12px;line-height:1.6;color:#78829a;">${o.note}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>${escapeHtml(o.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#07080c;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#07080c;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;font-family:${FONT};">
        <tr><td style="padding:0 8px 24px;">
          <span style="font-family:${FONT};font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#e6e9f0;">postivo</span><span style="color:#6e6bf0;font-size:18px;font-weight:700;">.</span>
        </td></tr>
        <tr><td style="background-color:#0d1017;border:1px solid #20242f;border-top:2px solid #6e6bf0;border-radius:12px;padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;letter-spacing:-0.01em;color:#e6e9f0;">${escapeHtml(o.heading)}</h1>
          ${paragraphs}
          ${cta}
          ${note}
        </td></tr>
        <tr><td style="padding:24px 8px 0;font-size:11px;line-height:1.6;color:#78829a;">
          Postivo — schedule everywhere, self-host anywhere.<br>
          You received this email because of an action on your Postivo account.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderWelcomeEmail(o: { name: string; dashboardUrl: string }): EmailTemplate {
  const name = escapeHtml(o.name || 'there');
  return {
    subject: 'Welcome to Postivo',
    html: layout({
      heading: `Welcome aboard, ${name}`,
      paragraphs: [
        'Your Postivo account is ready. Connect your social channels, compose once, and schedule everywhere — your data stays on your own infrastructure.',
        'A good first step: connect a channel, then schedule your first post.',
      ],
      cta: { label: 'Open your dashboard', url: o.dashboardUrl },
    }),
    text: `Welcome aboard, ${o.name || 'there'}!\n\nYour Postivo account is ready. Connect your social channels, compose once, and schedule everywhere.\n\nOpen your dashboard: ${o.dashboardUrl}\n`,
  };
}

export function renderVerifyEmail(o: { verifyUrl: string }): EmailTemplate {
  return {
    subject: 'Verify your Postivo email',
    html: layout({
      heading: 'Verify your email address',
      paragraphs: [
        'Confirm this email address belongs to you to secure your Postivo account. Verification is optional — you can keep using the app either way.',
        'This link expires in 24 hours.',
      ],
      cta: { label: 'Verify email', url: o.verifyUrl },
      note: 'If you did not create a Postivo account, you can ignore this email.',
    }),
    text: `Verify your Postivo email address.\n\nOpen this link within 24 hours:\n${o.verifyUrl}\n\nIf you did not create a Postivo account, ignore this email.\n`,
  };
}

export function renderPasswordResetEmail(o: { resetUrl: string }): EmailTemplate {
  return {
    subject: 'Reset your Postivo password',
    html: layout({
      heading: 'Reset your password',
      paragraphs: [
        'We received a request to reset the password for your Postivo account. This link expires in 1 hour and can only be used once.',
        'Resetting your password signs out every existing session.',
      ],
      cta: { label: 'Reset password', url: o.resetUrl },
      note: 'If you did not request a password reset, you can ignore this email — your password will not change.',
    }),
    text: `Reset your Postivo password.\n\nOpen this link within 1 hour (single use):\n${o.resetUrl}\n\nIf you did not request this, ignore this email — your password will not change.\n`,
  };
}
