type GithubReleaseAsset = {
  name: string;
  browser_download_url: string;
  size?: number;
};

type GithubRelease = {
  tag_name: string;
  name?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GithubReleaseAsset[];
};

type ResolveArgs = {
  repo: string;
  tag?: string | null;
  token?: string | null;
  assetName?: string | null;
  assetRegex?: string | null;
  cacheTtlMs?: number;
};

let cached:
  | {
      key: string;
      expiresAt: number;
      release: GithubRelease;
      asset: GithubReleaseAsset | null;
    }
  | null = null;

function normalizeRepo(repo: string) {
  const v = String(repo ?? '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
  if (!v || !/^[^/\s]+\/[^/\s]+$/.test(v)) {
    throw new Error('Invalid GITHUB_RELEASES_REPO (expected "owner/repo")');
  }
  return v;
}

function buildHeaders(token?: string | null) {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'movieflix-supabase-function',
  };
  const t = String(token ?? '').trim();
  if (t) headers.Authorization = `Bearer ${t}`;
  return headers;
}

async function fetchRelease(args: { repo: string; tag?: string | null; token?: string | null }) {
  const repo = normalizeRepo(args.repo);
  const tag = String(args.tag ?? '').trim();
  const base = `https://api.github.com/repos/${repo}/releases`;
  const url = tag ? `${base}/tags/${encodeURIComponent(tag)}` : `${base}/latest`;

  const res = await fetch(url, { headers: buildHeaders(args.token) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub releases request failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as GithubRelease;
}

function pickAsset(release: GithubRelease, args: { assetName?: string | null; assetRegex?: string | null }): GithubReleaseAsset | null {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  if (assets.length === 0) return null;

  const name = String(args.assetName ?? '').trim();
  if (name) {
    const exact = assets.find((a) => String(a?.name ?? '').trim() === name) ?? null;
    if (exact) return exact;
    // Fallback to regex selection (default *.apk) if the exact name wasn't uploaded.
  }

  const regexRaw = String(args.assetRegex ?? '').trim();
  const rx = regexRaw ? new RegExp(regexRaw) : /\.apk$/i;
  return assets.find((a) => rx.test(String(a?.name ?? ''))) ?? null;
}

export async function resolveGithubReleaseAsset(args: ResolveArgs): Promise<{ release: GithubRelease; asset: GithubReleaseAsset | null }> {
  const ttl = Math.max(10_000, Math.min(10 * 60_000, Number(args.cacheTtlMs ?? 60_000) || 60_000));
  const repo = normalizeRepo(args.repo);
  const tag = String(args.tag ?? '').trim();
  const key = [repo, tag || 'latest', String(args.assetName ?? '').trim(), String(args.assetRegex ?? '').trim()].join('|');

  if (cached && cached.key === key && Date.now() < cached.expiresAt) {
    return { release: cached.release, asset: cached.asset };
  }

  const release = await fetchRelease({ repo, tag: tag || null, token: args.token ?? null });
  const asset = pickAsset(release, { assetName: args.assetName ?? null, assetRegex: args.assetRegex ?? null });

  cached = { key, expiresAt: Date.now() + ttl, release, asset };
  return { release, asset };
}
