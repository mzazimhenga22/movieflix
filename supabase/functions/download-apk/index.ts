import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function redirect(location: string, filename?: string) {
  const headers: Record<string, string> = {
    ...corsHeaders,
    Location: location,
    'Cache-Control': 'no-store',
  };

  // Best-effort: some browsers respect this on redirects, some ignore it.
  if (filename) {
    headers['Content-Disposition'] = `attachment; filename="${filename.replace(/\"/g, '')}"`;
  }

  return new Response('', { status: 302, headers });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET,HEAD,OPTIONS' });
  }

  // If you host on GitHub Releases (or any public CDN), set this env var and we just redirect.
  const explicit = (Deno.env.get('APK_DOWNLOAD_URL') ?? '').trim();
  const fileName = (Deno.env.get('APK_FILENAME') ?? 'MovieFlix-latest.apk').trim();
  if (explicit) return redirect(explicit, fileName);

  const githubRepo = (Deno.env.get('GITHUB_RELEASES_REPO') ?? '').trim() || 'mzazimhenga22/movieflix';
  try {
    const token = (Deno.env.get('GITHUB_TOKEN') ?? '').trim() || null;
    const tag = (Deno.env.get('GITHUB_RELEASE_TAG') ?? '').trim() || null;
    const assetName = (Deno.env.get('APK_GITHUB_ASSET_NAME') ?? Deno.env.get('GITHUB_RELEASE_ASSET_NAME') ?? '').trim() || null;
    const assetRegex = (Deno.env.get('APK_GITHUB_ASSET_REGEX') ?? Deno.env.get('GITHUB_RELEASE_ASSET_REGEX') ?? '').trim() || null;
    const cacheTtlMs = Number(Deno.env.get('GITHUB_RELEASE_CACHE_TTL_MS') ?? '60000') || 60_000;

    const { asset } = await resolveGithubReleaseAsset({
      repo: githubRepo,
      tag,
      token,
      assetName: assetName || fileName,
      assetRegex,
      cacheTtlMs,
    });

    if (asset?.browser_download_url) {
      return redirect(asset.browser_download_url, asset.name || fileName);
    }
  } catch (err) {
    console.error('[download-apk] github release lookup failed', err);
  }

  // Otherwise, use Supabase Storage signed URL.
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Server misconfigured: missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }

  const bucket = (Deno.env.get('APK_STORAGE_BUCKET') ?? 'updates').trim() || 'updates';
  const path = (Deno.env.get('APK_STORAGE_PATH') ?? fileName).trim();
  const expiresIn = Math.max(60, Math.min(3600, Number(Deno.env.get('APK_SIGNED_URL_TTL_SECONDS') ?? '900') || 900));

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    console.error('[download-apk] signed url failed', error);
    return jsonResponse({ error: 'Failed to generate download URL' }, 502);
  }

  return redirect(data.signedUrl, fileName);
});
