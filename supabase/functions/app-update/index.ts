import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';
import { resolveGithubReleaseAsset } from '../_shared/githubReleases.ts';

function jsonResponse(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function parseBool(raw: string | undefined, fallback: boolean) {
  if (raw == null) return fallback;
  const s = raw.trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return fallback;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET,OPTIONS' });
  }

  const explicitLatestVersion = (Deno.env.get('APP_LATEST_VERSION') ?? '').trim();
  const githubRepo = (Deno.env.get('GITHUB_RELEASES_REPO') ?? '').trim() || 'mzazimhenga22/movieflix';

  let latestVersion = explicitLatestVersion || '1.0.0';
  try {
    const token = (Deno.env.get('GITHUB_TOKEN') ?? '').trim() || null;
    const tag = (Deno.env.get('GITHUB_RELEASE_TAG') ?? '').trim() || null;
    const assetName = (Deno.env.get('APK_GITHUB_ASSET_NAME') ?? Deno.env.get('GITHUB_RELEASE_ASSET_NAME') ?? '').trim() || null;
    const assetRegex = (Deno.env.get('APK_GITHUB_ASSET_REGEX') ?? Deno.env.get('GITHUB_RELEASE_ASSET_REGEX') ?? '').trim() || null;
    const cacheTtlMs = Number(Deno.env.get('GITHUB_RELEASE_CACHE_TTL_MS') ?? '60000') || 60_000;

    const { release } = await resolveGithubReleaseAsset({
      repo: githubRepo,
      tag,
      token,
      assetName,
      assetRegex,
      cacheTtlMs,
    });

    if (release?.tag_name) {
      latestVersion = String(release.tag_name).trim() || latestVersion;
    }
  } catch {
    // Keep env fallback if GitHub is unavailable.
  }
  const mandatory = parseBool(Deno.env.get('APP_UPDATE_MANDATORY') ?? undefined, false);
  const message =
    (Deno.env.get('APP_UPDATE_MESSAGE') ?? '').trim() ||
    'A new version is available. Please update to continue.';

  // Prefer an explicit URL; otherwise default to the sibling download function.
  const explicitUrl = (Deno.env.get('APP_UPDATE_URL') ?? '').trim();
  const envBase = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const base = (envBase || new URL(req.url).origin).replace(/^http:/i, 'https:').replace(/\/$/, '');
  const downloadUrl = explicitUrl || `${base}/functions/v1/download-apk`;

  return jsonResponse({
    latestVersion,
    mandatory,
    url: downloadUrl,
    androidUrl: downloadUrl,
    message,
  });
});
