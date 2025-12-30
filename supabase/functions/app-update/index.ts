import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

import { corsHeaders } from '../_shared/cors.ts';

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

serve((req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET,OPTIONS' });
  }

  const latestVersion = (Deno.env.get('APP_LATEST_VERSION') ?? '1.0.0').trim();
  const mandatory = parseBool(Deno.env.get('APP_UPDATE_MANDATORY') ?? undefined, false);
  const message =
    (Deno.env.get('APP_UPDATE_MESSAGE') ?? '').trim() ||
    'A new version is available. Please update to continue.';

  // Prefer an explicit URL; otherwise default to the sibling download function.
  const explicitUrl = (Deno.env.get('APP_UPDATE_URL') ?? '').trim();
  const downloadUrl = explicitUrl || `${new URL(req.url).origin}/functions/v1/download-apk`;

  return jsonResponse({
    latestVersion,
    mandatory,
    url: downloadUrl,
    message,
  });
});
