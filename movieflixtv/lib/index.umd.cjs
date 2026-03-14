(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? factory(exports, require("cheerio"), require("nanoid"), require("unpacker"), require("crypto-js"), require("iso-639-1"), require("fuse.js"), require("hls-parser"), require("form-data")) : typeof define === "function" && define.amd ? define(["exports", "cheerio", "nanoid", "unpacker", "crypto-js", "iso-639-1", "fuse.js", "hls-parser", "form-data"], factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, factory(global.index = {}, global.cheerio, global.nanoid, global.unpacker, global["crypto-js"], global["iso-639-1"], global.fuse.js, global["hls-parser"], global["form-data"]));
})(this, function(exports2, cheerio, nanoid$1, unpacker, crypto, ISO6391, Fuse, hlsParser, FormData) {
  "use strict";var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  var _a, _b, _c, _d;
  function _interopNamespaceDefault(e) {
    const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
    if (e) {
      for (const k in e) {
        if (k !== "default") {
          const d = Object.getOwnPropertyDescriptor(e, k);
          Object.defineProperty(n, k, d.get ? d : {
            enumerable: true,
            get: () => e[k]
          });
        }
      }
    }
    n.default = e;
    return Object.freeze(n);
  }
  const cheerio__namespace = /* @__PURE__ */ _interopNamespaceDefault(cheerio);
  const unpacker__namespace = /* @__PURE__ */ _interopNamespaceDefault(unpacker);
  function formatSourceMeta(v) {
    const types = [];
    if (v.scrapeMovie) types.push("movie");
    if (v.scrapeShow) types.push("show");
    return {
      type: "source",
      id: v.id,
      rank: v.rank,
      name: v.name,
      flags: v.flags,
      mediaTypes: types
    };
  }
  function formatEmbedMeta(v) {
    return {
      type: "embed",
      id: v.id,
      rank: v.rank,
      name: v.name,
      flags: v.flags
    };
  }
  function getAllSourceMetaSorted(list) {
    return list.sources.sort((a, b) => b.rank - a.rank).map(formatSourceMeta);
  }
  function getAllEmbedMetaSorted(list) {
    return list.embeds.sort((a, b) => b.rank - a.rank).map(formatEmbedMeta);
  }
  function getSpecificId(list, id) {
    const foundSource = list.sources.find((v) => v.id === id);
    if (foundSource) {
      return formatSourceMeta(foundSource);
    }
    const foundEmbed = list.embeds.find((v) => v.id === id);
    if (foundEmbed) {
      return formatEmbedMeta(foundEmbed);
    }
    return null;
  }
  function makeFullUrl(url, ops) {
    let leftSide = (ops == null ? void 0 : ops.baseUrl) ?? "";
    let rightSide = url;
    if (leftSide.length > 0 && !leftSide.endsWith("/")) leftSide += "/";
    if (rightSide.startsWith("/")) rightSide = rightSide.slice(1);
    const fullUrl = leftSide + rightSide;
    if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://") && !fullUrl.startsWith("data:"))
      throw new Error(`Invald URL -- URL doesn't start with a http scheme: '${fullUrl}'`);
    const parsedUrl = new URL(fullUrl);
    Object.entries((ops == null ? void 0 : ops.query) ?? {}).forEach(([k, v]) => {
      parsedUrl.searchParams.set(k, v);
    });
    return parsedUrl.toString();
  }
  function makeFetcher(fetcher) {
    const newFetcher = (url, ops) => {
      return fetcher(url, {
        headers: (ops == null ? void 0 : ops.headers) ?? {},
        method: (ops == null ? void 0 : ops.method) ?? "GET",
        query: (ops == null ? void 0 : ops.query) ?? {},
        baseUrl: (ops == null ? void 0 : ops.baseUrl) ?? "",
        readHeaders: (ops == null ? void 0 : ops.readHeaders) ?? [],
        body: ops == null ? void 0 : ops.body,
        credentials: ops == null ? void 0 : ops.credentials
      });
    };
    const output = async (url, ops) => (await newFetcher(url, ops)).body;
    output.full = newFetcher;
    return output;
  }
  const flags = {
    // CORS are set to allow any origin
    CORS_ALLOWED: "cors-allowed",
    // the stream is locked on IP, so only works if
    // request maker is same as player (not compatible with proxies)
    IP_LOCKED: "ip-locked",
    // The source/embed is blocking cloudflare ip's
    // This flag is not compatible with a proxy hosted on cloudflare
    CF_BLOCKED: "cf-blocked",
    // Streams and sources with this flag wont be proxied
    // And will be exclusive to the extension
    PROXY_BLOCKED: "proxy-blocked"
  };
  const targets = {
    // browser with CORS restrictions
    BROWSER: "browser",
    // browser, but no CORS restrictions through a browser extension
    BROWSER_EXTENSION: "browser-extension",
    // native app, so no restrictions in what can be played
    NATIVE: "native",
    // any target, no target restrictions
    ANY: "any"
  };
  const targetToFeatures = {
    browser: {
      requires: [flags.CORS_ALLOWED],
      disallowed: []
    },
    "browser-extension": {
      requires: [],
      disallowed: []
    },
    native: {
      requires: [],
      disallowed: []
    },
    any: {
      requires: [],
      disallowed: []
    }
  };
  function getTargetFeatures(target, consistentIpForRequests, proxyStreams) {
    const features = targetToFeatures[target];
    if (!consistentIpForRequests) features.disallowed.push(flags.IP_LOCKED);
    if (proxyStreams) features.disallowed.push(flags.PROXY_BLOCKED);
    return features;
  }
  function flagsAllowedInFeatures(features, inputFlags) {
    const hasAllFlags = features.requires.every((v) => inputFlags.includes(v));
    if (!hasAllFlags) return false;
    const hasDisallowedFlag = features.disallowed.some((v) => inputFlags.includes(v));
    if (hasDisallowedFlag) return false;
    return true;
  }
  class NotFoundError extends Error {
    constructor(reason) {
      super(`Couldn't find a stream: ${reason ?? "not found"}`);
      this.name = "NotFoundError";
    }
  }
  const DEFAULT_PROXY_URL = "https://proxy.nsbx.ru/proxy";
  const ABSOLUTE_URL_REGEX = /^https?:\/\//i;
  function defaultM3U8Proxy() {
    var _a2;
    try {
      const env = process && ((_a2 = process.env) == null ? void 0 : _a2.NEXT_PUBLIC_PSTREAM_M3U8_PROXY_URL);
      if (env) return env;
    } catch (e) {
    }
    return "/api/proxy";
  }
  let CONFIGURED_M3U8_PROXY_URL = defaultM3U8Proxy();
  const getLocationOrigin = () => {
    try {
      if (typeof globalThis === "undefined") return null;
      const maybeLocation = globalThis == null ? void 0 : globalThis.location;
      if (maybeLocation && typeof maybeLocation.origin === "string") {
        return maybeLocation.origin;
      }
    } catch (e) {
    }
    return null;
  };
  const resolveProxyBase = () => {
    const candidate = CONFIGURED_M3U8_PROXY_URL == null ? void 0 : CONFIGURED_M3U8_PROXY_URL.trim();
    if (candidate) {
      if (ABSOLUTE_URL_REGEX.test(candidate)) {
        return candidate;
      }
      if (candidate.startsWith("//")) {
        return `https:${candidate}`;
      }
      if (candidate.startsWith("/")) {
        const origin2 = getLocationOrigin();
        if (origin2) {
          return `${origin2}${candidate}`;
        }
        return DEFAULT_PROXY_URL;
      }
      const sanitized = candidate.replace(/^\/*/, "");
      if (sanitized) {
        if (sanitized.startsWith("localhost")) {
          return `http://${sanitized}`;
        }
        if (sanitized.includes(".")) {
          return `https://${sanitized}`;
        }
      }
    }
    return DEFAULT_PROXY_URL;
  };
  function setM3U8ProxyUrl(proxyUrl) {
    CONFIGURED_M3U8_PROXY_URL = proxyUrl;
  }
  function getM3U8ProxyUrl() {
    return CONFIGURED_M3U8_PROXY_URL;
  }
  function requiresProxy(stream) {
    if (!stream.flags.includes(flags.CORS_ALLOWED) || !!(stream.headers && Object.keys(stream.headers).length > 0))
      return true;
    return false;
  }
  function setupProxy(stream) {
    const headers2 = stream.headers && Object.keys(stream.headers).length > 0 ? stream.headers : void 0;
    ({
      ...stream.type === "hls" && { depth: stream.proxyDepth ?? 0 }
    });
    if (stream.type === "hls") {
      stream.playlist;
      stream.playlist = createM3U8ProxyUrl(stream.playlist, void 0, headers2);
    }
    if (stream.type === "file") {
      Object.entries(stream.qualities).forEach((entry) => {
        entry[1].url;
        entry[1].url = createM3U8ProxyUrl(entry[1].url, void 0, headers2);
      });
    }
    stream.headers = {};
    stream.flags = [flags.CORS_ALLOWED];
    return stream;
  }
  function createM3U8ProxyUrl(url, features, headers2 = {}) {
    if (features && !features.requires.includes(flags.CORS_ALLOWED)) {
      return url;
    }
    const b64Url = Buffer.from(url).toString("base64");
    const hdr = headers2 && Object.keys(headers2).length ? `&h=${encodeURIComponent(Buffer.from(JSON.stringify(headers2)).toString("base64"))}` : "";
    const proxyBase = resolveProxyBase();
    return `${proxyBase}?url=${encodeURIComponent(b64Url)}${hdr}`;
  }
  function updateM3U8ProxyUrl(url) {
    if (url.includes("/m3u8-proxy?url=")) {
      const proxyBase = resolveProxyBase();
      return url.replace(/https?:\/\/[^/]+\/m3u8-proxy/, `${proxyBase}`);
    }
    return url;
  }
  function makeSourcerer(state) {
    const mediaTypes = [];
    if (state.scrapeMovie) mediaTypes.push("movie");
    if (state.scrapeShow) mediaTypes.push("show");
    return {
      ...state,
      type: "source",
      disabled: state.disabled ?? false,
      externalSource: state.externalSource ?? false,
      mediaTypes
    };
  }
  function makeEmbed(state) {
    return {
      ...state,
      type: "embed",
      disabled: state.disabled ?? false,
      mediaTypes: void 0
    };
  }
  async function comboScraper$u(ctx) {
    const embedPage = await ctx.proxiedFetcher(
      `https://bombthe.irish/embed/${ctx.media.type === "movie" ? `movie/${ctx.media.tmdbId}` : `tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`}`
    );
    const $ = cheerio.load(embedPage);
    const embeds = [];
    $("#dropdownMenu a").each((_, element) => {
      const url = new URL($(element).data("url")).searchParams.get("url");
      if (!url) return;
      embeds.push({ embedId: $(element).text().toLowerCase(), url: atob(url) });
    });
    return { embeds };
  }
  const bombtheirishScraper = makeSourcerer({
    id: "bombtheirish",
    name: "bombthe.irish",
    rank: 100,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$u,
    scrapeShow: comboScraper$u
  });
  const warezcdnBase = "https://embed.warezcdn.link";
  const warezcdnPlayerBase = "https://warezcdn.link/player";
  const warezcdnWorkerProxy = "https://workerproxy.warezcdn.workers.dev";
  function decrypt$1(input) {
    let output = atob(input);
    output = output.trim();
    output = output.split("").reverse().join("");
    let last = output.slice(-5);
    last = last.split("").reverse().join("");
    output = output.slice(0, -5);
    return `${output}${last}`;
  }
  async function getDecryptedId(ctx) {
    var _a2;
    const page = await ctx.proxiedFetcher(`/player.php`, {
      baseUrl: warezcdnPlayerBase,
      headers: {
        Referer: `${warezcdnPlayerBase}/getEmbed.php?${new URLSearchParams({
          id: ctx.url,
          sv: "warezcdn"
        })}`
      },
      query: {
        id: ctx.url
      }
    });
    const allowanceKey = (_a2 = page.match(/let allowanceKey = "(.*?)";/)) == null ? void 0 : _a2[1];
    if (!allowanceKey) throw new NotFoundError("Failed to get allowanceKey");
    const streamData = await ctx.proxiedFetcher("/functions.php", {
      baseUrl: warezcdnPlayerBase,
      method: "POST",
      body: new URLSearchParams({
        getVideo: ctx.url,
        key: allowanceKey
      })
    });
    const stream = JSON.parse(streamData);
    if (!stream.id) throw new NotFoundError("can't get stream id");
    const decryptedId = decrypt$1(stream.id);
    if (!decryptedId) throw new NotFoundError("can't get file id");
    return decryptedId;
  }
  const cdnListing = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64];
  async function checkUrls(ctx, fileId) {
    for (const id of cdnListing) {
      const url = `https://cloclo${id}.cloud.mail.ru/weblink/view/${fileId}`;
      const response = await ctx.proxiedFetcher.full(url, {
        method: "GET",
        headers: {
          Range: "bytes=0-1"
        }
      });
      if (response.statusCode === 206) return url;
    }
    return null;
  }
  const warezcdnembedMp4Scraper = makeEmbed({
    id: "warezcdnembedmp4",
    // WarezCDN is both a source and an embed host
    name: "WarezCDN MP4",
    // method no longer works
    rank: 82,
    flags: [flags.CORS_ALLOWED],
    disabled: true,
    async scrape(ctx) {
      const decryptedId = await getDecryptedId(ctx);
      if (!decryptedId) throw new NotFoundError("can't get file id");
      const streamUrl = await checkUrls(ctx, decryptedId);
      if (!streamUrl) throw new NotFoundError("can't get stream id");
      return {
        stream: [
          {
            id: "primary",
            captions: [],
            qualities: {
              unknown: {
                type: "mp4",
                url: `${warezcdnWorkerProxy}/?${new URLSearchParams({
                  url: streamUrl
                })}`
              }
            },
            type: "file",
            flags: [flags.CORS_ALLOWED]
          }
        ]
      };
    }
  });
  const SKIP_VALIDATION_CHECK_IDS = [
    warezcdnembedMp4Scraper.id
    // deltaScraper.id,
    // alphaScraper.id,
    // novaScraper.id,
    // astraScraper.id,
    // orionScraper.id,
  ];
  const UNPROXIED_VALIDATION_CHECK_IDS = [
    // sources here are always proxied, so we dont need to validate with a proxy
    bombtheirishScraper.id
    // this one is dead, but i'll keep it here for now
  ];
  function isValidStream(stream) {
    if (!stream) return false;
    if (stream.type === "hls") {
      if (!stream.playlist) return false;
      return true;
    }
    if (stream.type === "file") {
      const validQualities = Object.values(stream.qualities).filter((v) => v.url.length > 0);
      if (validQualities.length === 0) return false;
      return true;
    }
    return false;
  }
  function isAlreadyProxyUrl(url) {
    if (url.includes("/m3u8-proxy?url=")) return true;
    if (url.includes("shegu.net")) return true;
    try {
      const match = url.match(/[?&]url=([^&#]+)/i);
      if (!match) return false;
      const value = decodeURIComponent(match[1]);
      return value.startsWith("aHR0c");
    } catch {
      return false;
    }
  }
  function isErrorResponse(result) {
    if (result.statusCode === 403) return true;
    const bodyStr = typeof result.body === "string" ? result.body : String(result.body);
    if (result.statusCode === 200 && bodyStr.trim() === "error_wrong_ip") return true;
    if (result.statusCode === 200) {
      try {
        const parsed = JSON.parse(bodyStr);
        if (parsed.status === 403 && parsed.msg === "Access Denied") return true;
      } catch {
      }
    }
    return false;
  }
  async function validatePlayableStream(stream, ops, sourcererId) {
    if (SKIP_VALIDATION_CHECK_IDS.includes(sourcererId)) return stream;
    if (stream.skipValidation) return stream;
    const alwaysUseNormalFetch = UNPROXIED_VALIDATION_CHECK_IDS.includes(sourcererId);
    if (stream.type === "hls") {
      if (stream.playlist.startsWith("data:")) return stream;
      const useNormalFetch = alwaysUseNormalFetch || isAlreadyProxyUrl(stream.playlist);
      let result;
      if (useNormalFetch) {
        try {
          const response = await fetch(stream.playlist, {
            method: "GET",
            headers: {
              ...stream.preferredHeaders,
              ...stream.headers
            }
          });
          result = {
            statusCode: response.status,
            body: await response.text(),
            finalUrl: response.url
          };
        } catch (error) {
          return null;
        }
      } else {
        result = await ops.proxiedFetcher.full(stream.playlist, {
          method: "GET",
          headers: {
            ...stream.preferredHeaders,
            ...stream.headers
          }
        });
      }
      if (result.statusCode < 200 || result.statusCode >= 400 || isErrorResponse(result)) return null;
      return stream;
    }
    if (stream.type === "file") {
      const validQualitiesResults = await Promise.all(
        Object.values(stream.qualities).map(async (quality) => {
          const useNormalFetch = alwaysUseNormalFetch || isAlreadyProxyUrl(quality.url);
          if (useNormalFetch) {
            try {
              const response = await fetch(quality.url, {
                method: "GET",
                headers: {
                  ...stream.preferredHeaders,
                  ...stream.headers,
                  Range: "bytes=0-1"
                }
              });
              return {
                statusCode: response.status,
                body: await response.text(),
                finalUrl: response.url
              };
            } catch (error) {
              return { statusCode: 500, body: "", finalUrl: quality.url };
            }
          }
          return ops.proxiedFetcher.full(quality.url, {
            method: "GET",
            headers: {
              ...stream.preferredHeaders,
              ...stream.headers,
              Range: "bytes=0-1"
            }
          });
        })
      );
      const validQualities = stream.qualities;
      Object.keys(stream.qualities).forEach((quality, index) => {
        if (validQualitiesResults[index].statusCode < 200 || validQualitiesResults[index].statusCode >= 400 || isErrorResponse(validQualitiesResults[index])) {
          delete validQualities[quality];
        }
      });
      if (Object.keys(validQualities).length === 0) return null;
      return { ...stream, qualities: validQualities };
    }
    return null;
  }
  async function validatePlayableStreams(streams, ops, sourcererId) {
    if (SKIP_VALIDATION_CHECK_IDS.includes(sourcererId)) return streams;
    return (await Promise.all(streams.map((stream) => validatePlayableStream(stream, ops, sourcererId)))).filter(
      (v) => v !== null
    );
  }
  async function scrapeInvidualSource(list, ops) {
    const sourceScraper = list.sources.find((v) => ops.id === v.id);
    if (!sourceScraper) throw new Error("Source with ID not found");
    if (ops.media.type === "movie" && !sourceScraper.scrapeMovie) throw new Error("Source is not compatible with movies");
    if (ops.media.type === "show" && !sourceScraper.scrapeShow) throw new Error("Source is not compatible with shows");
    const contextBase = {
      fetcher: ops.fetcher,
      proxiedFetcher: ops.proxiedFetcher,
      features: ops.features,
      progress(val) {
        var _a2, _b2;
        (_b2 = (_a2 = ops.events) == null ? void 0 : _a2.update) == null ? void 0 : _b2.call(_a2, {
          id: sourceScraper.id,
          percentage: val,
          status: "pending"
        });
      }
    };
    let output = null;
    if (ops.media.type === "movie" && sourceScraper.scrapeMovie)
      output = await sourceScraper.scrapeMovie({
        ...contextBase,
        media: ops.media
      });
    else if (ops.media.type === "show" && sourceScraper.scrapeShow)
      output = await sourceScraper.scrapeShow({
        ...contextBase,
        media: ops.media
      });
    if (output == null ? void 0 : output.stream) {
      output.stream = output.stream.filter((stream) => isValidStream(stream)).filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
      output.stream = output.stream.map(
        (stream) => requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream
      );
    }
    if (!output) throw new Error("output is null");
    output.embeds = output.embeds.filter((embed2) => {
      const e = list.embeds.find((v) => v.id === embed2.embedId);
      if (!e || e.disabled) return false;
      return true;
    });
    if ((!output.stream || output.stream.length === 0) && output.embeds.length === 0)
      throw new NotFoundError("No streams found");
    if (output.stream && output.stream.length > 0 && output.embeds.length === 0) {
      const playableStreams = await validatePlayableStreams(output.stream, ops, sourceScraper.id);
      if (playableStreams.length === 0) throw new NotFoundError("No playable streams found");
      output.stream = playableStreams;
    }
    return output;
  }
  async function scrapeIndividualEmbed(list, ops) {
    const embedScraper = list.embeds.find((v) => ops.id === v.id);
    if (!embedScraper) throw new Error("Embed with ID not found");
    const url = ops.url;
    const output = await embedScraper.scrape({
      fetcher: ops.fetcher,
      proxiedFetcher: ops.proxiedFetcher,
      features: ops.features,
      url,
      progress(val) {
        var _a2, _b2;
        (_b2 = (_a2 = ops.events) == null ? void 0 : _a2.update) == null ? void 0 : _b2.call(_a2, {
          id: embedScraper.id,
          percentage: val,
          status: "pending"
        });
      }
    });
    output.stream = output.stream.filter((stream) => isValidStream(stream)).filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
    if (output.stream.length === 0) throw new NotFoundError("No streams found");
    output.stream = output.stream.map(
      (stream) => requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream
    );
    const playableStreams = await validatePlayableStreams(output.stream, ops, embedScraper.id);
    if (playableStreams.length === 0) throw new NotFoundError("No playable streams found");
    output.stream = playableStreams;
    return output;
  }
  function reorderOnIdList(order, list) {
    const copy = [...list];
    copy.sort((a, b) => {
      const aIndex = order.indexOf(a.id);
      const bIndex = order.indexOf(b.id);
      if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
      if (bIndex >= 0) return 1;
      if (aIndex >= 0) return -1;
      return b.rank - a.rank;
    });
    return copy;
  }
  async function runAllProviders(list, ops) {
    var _a2, _b2, _c2, _d2, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
    const sources = reorderOnIdList(ops.sourceOrder ?? [], list.sources).filter((source) => {
      if (ops.media.type === "movie") return !!source.scrapeMovie;
      if (ops.media.type === "show") return !!source.scrapeShow;
      return false;
    });
    const embeds = reorderOnIdList(ops.embedOrder ?? [], list.embeds);
    const embedIds = embeds.map((embed2) => embed2.id);
    let lastId = "";
    const deferredEmbeds = [];
    const contextBase = {
      fetcher: ops.fetcher,
      proxiedFetcher: ops.proxiedFetcher,
      features: ops.features,
      progress(val) {
        var _a3, _b3;
        (_b3 = (_a3 = ops.events) == null ? void 0 : _a3.update) == null ? void 0 : _b3.call(_a3, {
          id: lastId,
          percentage: val,
          status: "pending"
        });
      }
    };
    (_b2 = (_a2 = ops.events) == null ? void 0 : _a2.init) == null ? void 0 : _b2.call(_a2, {
      sourceIds: sources.map((v) => v.id)
    });
    for (const source of sources) {
      (_d2 = (_c2 = ops.events) == null ? void 0 : _c2.start) == null ? void 0 : _d2.call(_c2, source.id);
      lastId = source.id;
      let output = null;
      try {
        if (ops.media.type === "movie" && source.scrapeMovie)
          output = await source.scrapeMovie({
            ...contextBase,
            media: ops.media
          });
        else if (ops.media.type === "show" && source.scrapeShow)
          output = await source.scrapeShow({
            ...contextBase,
            media: ops.media
          });
        if (output) {
          output.stream = (output.stream ?? []).filter(isValidStream).filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
          output.stream = output.stream.map(
            (stream) => requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream
          );
        }
        if (!output || !((_e = output.stream) == null ? void 0 : _e.length) && !output.embeds.length) {
          throw new NotFoundError("No streams found");
        }
      } catch (error) {
        const updateParams = {
          id: source.id,
          percentage: 100,
          status: error instanceof NotFoundError ? "notfound" : "failure",
          reason: error instanceof NotFoundError ? error.message : void 0,
          error: error instanceof NotFoundError ? void 0 : error
        };
        (_g = (_f = ops.events) == null ? void 0 : _f.update) == null ? void 0 : _g.call(_f, updateParams);
        continue;
      }
      if (!output) throw new Error("Invalid media type");
      if ((_h = output.stream) == null ? void 0 : _h[0]) {
        try {
          const playableStream = await validatePlayableStream(output.stream[0], ops, source.id);
          if (!playableStream) throw new NotFoundError("No streams found");
          return {
            sourceId: source.id,
            stream: playableStream
          };
        } catch (error) {
          const updateParams = {
            id: source.id,
            percentage: 100,
            status: error instanceof NotFoundError ? "notfound" : "failure",
            reason: error instanceof NotFoundError ? error.message : void 0,
            error: error instanceof NotFoundError ? void 0 : error
          };
          (_j = (_i = ops.events) == null ? void 0 : _i.update) == null ? void 0 : _j.call(_i, updateParams);
          continue;
        }
      }
      const sortedEmbeds = output.embeds.filter((embed2) => {
        const e = list.embeds.find((v) => v.id === embed2.embedId);
        return e && !e.disabled;
      }).sort((a, b) => embedIds.indexOf(a.embedId) - embedIds.indexOf(b.embedId));
      if (sortedEmbeds.length > 0) {
        (_l = (_k = ops.events) == null ? void 0 : _k.discoverEmbeds) == null ? void 0 : _l.call(_k, {
          embeds: sortedEmbeds.map((embed2, i2) => ({
            id: [source.id, i2].join("-"),
            embedScraperId: embed2.embedId
          })),
          sourceId: source.id
        });
      }
      for (const [ind, embed2] of sortedEmbeds.entries()) {
        deferredEmbeds.push({
          sourceId: source.id,
          id: [source.id, ind].join("-"),
          embedId: embed2.embedId,
          url: embed2.url
        });
      }
    }
    for (const embed2 of deferredEmbeds) {
      const scraper = embeds.find((v) => v.id === embed2.embedId);
      if (!scraper) continue;
      (_n = (_m = ops.events) == null ? void 0 : _m.start) == null ? void 0 : _n.call(_m, embed2.id);
      lastId = embed2.id;
      let embedOutput;
      try {
        embedOutput = await scraper.scrape({
          ...contextBase,
          url: embed2.url
        });
        embedOutput.stream = embedOutput.stream.filter(isValidStream).filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
        embedOutput.stream = embedOutput.stream.map(
          (stream) => requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream
        );
        if (embedOutput.stream.length === 0) {
          throw new NotFoundError("No streams found");
        }
        const playableStream = await validatePlayableStream(embedOutput.stream[0], ops, embed2.embedId);
        if (!playableStream) throw new NotFoundError("No streams found");
        embedOutput.stream = [playableStream];
      } catch (error) {
        const updateParams = {
          id: embed2.id,
          percentage: 100,
          status: error instanceof NotFoundError ? "notfound" : "failure",
          reason: error instanceof NotFoundError ? error.message : void 0,
          error: error instanceof NotFoundError ? void 0 : error
        };
        (_p = (_o = ops.events) == null ? void 0 : _o.update) == null ? void 0 : _p.call(_o, updateParams);
        continue;
      }
      return {
        sourceId: embed2.sourceId,
        embedId: scraper.id,
        stream: embedOutput.stream[0]
      };
    }
    return null;
  }
  function makeControls(ops) {
    const list = {
      embeds: ops.embeds,
      sources: ops.sources
    };
    const providerRunnerOps = {
      features: ops.features,
      fetcher: makeFetcher(ops.fetcher),
      proxiedFetcher: makeFetcher(ops.proxiedFetcher ?? ops.fetcher),
      proxyStreams: ops.proxyStreams
    };
    return {
      runAll(runnerOps) {
        return runAllProviders(list, {
          ...providerRunnerOps,
          ...runnerOps
        });
      },
      runSourceScraper(runnerOps) {
        return scrapeInvidualSource(list, {
          ...providerRunnerOps,
          ...runnerOps
        });
      },
      runEmbedScraper(runnerOps) {
        return scrapeIndividualEmbed(list, {
          ...providerRunnerOps,
          ...runnerOps
        });
      },
      getMetadata(id) {
        return getSpecificId(list, id);
      },
      listSources() {
        return getAllSourceMetaSorted(list);
      },
      listEmbeds() {
        return getAllEmbedMetaSorted(list);
      }
    };
  }
  const nanoid = nanoid$1.customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", 10);
  const PASS_MD5_PATTERNS = [
    /\$\.get\(['"](\/pass_md5\/[^'"]+)['"]/,
    /\$\.get\(["`](\/pass_md5\/[^"']+)["`]/,
    /\$\.get\s*\(['"](\/pass_md5\/[^'"]+)['"]/,
    /\$\.get\s*\(["`](\/pass_md5\/[^"']+)["`]/
  ];
  const TOKEN_PATTERNS = [/token["']?\s*[:=]\s*["']([^"']+)["']/, /makePlay.*?token=([^"&']+)/];
  function extractFirst(html, patterns) {
    for (const pat of patterns) {
      const m = pat.exec(html);
      if (m && m[1]) {
        return m[1];
      }
    }
    return null;
  }
  function resolveAbsoluteUrl(base, maybeRelative) {
    try {
      return new URL(maybeRelative, base).toString();
    } catch {
      return maybeRelative;
    }
  }
  async function extractVideoUrl(ctx, streamingLink) {
    try {
      const headers2 = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-Mode": "navigate",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Dest": "document",
        Connection: "keep-alive"
      };
      const response = await ctx.proxiedFetcher.full(streamingLink, {
        headers: headers2,
        allowRedirects: true
      });
      const passMd5Match = extractFirst(response.body, PASS_MD5_PATTERNS);
      if (!passMd5Match) {
        return null;
      }
      const baseUrl2 = `${response.finalUrl.split("://")[0]}://${response.finalUrl.split("://")[1].split("/")[0]}`;
      const passMd5Url = resolveAbsoluteUrl(baseUrl2, passMd5Match);
      const passMd5Response = await ctx.proxiedFetcher(passMd5Url, {
        headers: headers2,
        cookies: response.cookies
      });
      const videoUrl = passMd5Response.trim();
      const tokenMatch = extractFirst(response.body, TOKEN_PATTERNS);
      if (tokenMatch) {
        const randomString = nanoid();
        const expiry = Date.now();
        return `${videoUrl}${randomString}?token=${tokenMatch}&expiry=${expiry}`;
      }
      return videoUrl;
    } catch (e) {
      return null;
    }
  }
  const doodScraper = makeEmbed({
    id: "dood",
    name: "dood",
    disabled: false,
    rank: 173,
    flags: [flags.CORS_ALLOWED],
    async scrape(ctx) {
      let pageUrl = ctx.url;
      try {
        const url = new URL(pageUrl);
        if (url.hostname === "dood.watch") {
          pageUrl = `https://myvidplay.com${url.pathname}${url.search}`;
        }
      } catch {
      }
      const redirectReq = await ctx.proxiedFetcher.full(pageUrl);
      pageUrl = redirectReq.finalUrl;
      const videoUrl = await extractVideoUrl(ctx, pageUrl);
      if (!videoUrl) {
        throw new Error("dood: could not extract video URL");
      }
      const pageResp = await ctx.proxiedFetcher.full(pageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });
      const thumbnailMatch = pageResp.body.match(/thumbnails:\s*\{\s*vtt:\s*['"]([^'"]+)['"]/);
      const thumbUrl = thumbnailMatch ? resolveAbsoluteUrl(pageUrl, thumbnailMatch[1]) : null;
      const pageOrigin = new URL(pageUrl).origin;
      return {
        stream: [
          {
            id: "primary",
            type: "file",
            flags: [flags.CORS_ALLOWED],
            captions: [],
            qualities: {
              unknown: {
                type: "mp4",
                url: videoUrl
              }
            },
            preferredHeaders: {
              Referer: pageOrigin
            },
            ...thumbUrl ? {
              thumbnailTrack: {
                type: "vtt",
                url: thumbUrl
              }
            } : {}
          }
        ]
      };
    }
  });
  const userAgent$1 = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36";
  const filemoonScraper = makeEmbed({
    id: "filemoon",
    name: "Filemoon",
    rank: 405,
    flags: [],
    async scrape(ctx) {
      const headers2 = {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        Referer: `${new URL(ctx.url).origin}/`,
        "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
        "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "User-Agent": userAgent$1
      };
      const response = await ctx.proxiedFetcher(ctx.url, { headers: headers2 });
      const soup = cheerio.load(response);
      const iframe = soup("iframe").first();
      if (!iframe.length) throw new NotFoundError("No iframe found");
      const iframeUrl = iframe.attr("src");
      if (!iframeUrl) throw new NotFoundError("No iframe src found");
      const iframeResponse = await ctx.proxiedFetcher(iframeUrl, { headers: headers2 });
      const iframeSoup = cheerio.load(iframeResponse);
      const jsCode = iframeSoup("script").filter((_, el) => {
        const text = iframeSoup(el).html() || "";
        return text.includes("eval(function(p,a,c,k,e,d)");
      }).first().html();
      if (!jsCode) throw new NotFoundError("No packed JS code found");
      const unpacked = unpacker.unpack(jsCode);
      if (!unpacked) throw new NotFoundError("Failed to unpack JS code");
      const videoMatch = unpacked.match(/file:"([^"]+)"/);
      if (!videoMatch) throw new NotFoundError("No video URL found");
      const videoUrl = videoMatch[1];
      return {
        stream: [
          {
            id: "primary",
            type: "hls",
            playlist: videoUrl,
            headers: {
              Referer: `${new URL(ctx.url).origin}/`,
              "User-Agent": userAgent$1
            },
            flags: [],
            captions: []
          }
        ]
      };
    }
  });
  const mixdropBase = "https://mixdrop.ag";
  const packedRegex$1 = /(eval\(function\(p,a,c,k,e,d\){.*{}\)\))/;
  const linkRegex$1 = /MDCore\.wurl="(.*?)";/;
  const mixdropScraper = makeEmbed({
    id: "mixdrop",
    name: "MixDrop",
    rank: 198,
    flags: [flags.IP_LOCKED],
    async scrape(ctx) {
      let embedUrl = ctx.url;
      if (ctx.url.includes("primewire")) embedUrl = (await ctx.fetcher.full(ctx.url)).finalUrl;
      const embedId = new URL(embedUrl).pathname.split("/")[2];
      const streamRes = await ctx.proxiedFetcher(`/e/${embedId}`, {
        baseUrl: mixdropBase
      });
      const packed = streamRes.match(packedRegex$1);
      if (!packed) {
        throw new Error("failed to find packed mixdrop JavaScript");
      }
      const unpacked = unpacker__namespace.unpack(packed[1]);
      const link = unpacked.match(linkRegex$1);
      if (!link) {
        throw new Error("failed to find packed mixdrop source link");
      }
      const url = link[1];
      return {
        stream: [
          {
            id: "primary",
            type: "file",
            flags: [flags.IP_LOCKED],
            captions: [],
            qualities: {
              unknown: {
                type: "mp4",
                url: url.startsWith("http") ? url : `https:${url}`,
                // URLs don't always start with the protocol
                headers: {
                  // MixDrop requires this header on all streams
                  Referer: mixdropBase
                }
              }
            }
          }
        ]
      };
    }
  });
  const serverMirrorEmbed = makeEmbed({
    id: "mirror",
    name: "Mirror",
    rank: 1,
    flags: [flags.CORS_ALLOWED],
    async scrape(ctx) {
      const context = JSON.parse(ctx.url);
      if (context.type === "hls") {
        return {
          stream: [
            {
              id: "primary",
              type: "hls",
              playlist: context.stream,
              headers: context.headers,
              flags: context.flags,
              captions: context.captions,
              skipValidation: context.skipvalid
            }
          ]
        };
      }
      return {
        stream: [
          {
            id: "primary",
            type: "file",
            qualities: context.qualities,
            flags: context.flags,
            captions: context.captions,
            headers: context.headers,
            skipValidation: context.skipvalid
          }
        ]
      };
    }
  });
  function hexToChar(hex) {
    return String.fromCharCode(parseInt(hex, 16));
  }
  function decrypt(data, key) {
    var _a2;
    const formatedData = ((_a2 = data.match(/../g)) == null ? void 0 : _a2.map(hexToChar).join("")) || "";
    return formatedData.split("").map((char, i2) => String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i2 % key.length))).join("");
  }
  const turbovidScraper = makeEmbed({
    id: "turbovid",
    name: "Turbovid",
    rank: 122,
    flags: [flags.CORS_ALLOWED],
    async scrape(ctx) {
      var _a2, _b2;
      const baseUrl2 = new URL(ctx.url).origin;
      const embedPage = await ctx.proxiedFetcher(ctx.url);
      ctx.progress(30);
      const apkey = (_a2 = embedPage.match(/const\s+apkey\s*=\s*"(.*?)";/)) == null ? void 0 : _a2[1];
      const xxid = (_b2 = embedPage.match(/const\s+xxid\s*=\s*"(.*?)";/)) == null ? void 0 : _b2[1];
      if (!apkey || !xxid) throw new Error("Failed to get required values");
      const encodedJuiceKey = JSON.parse(
        await ctx.proxiedFetcher("/api/cucked/juice_key", {
          baseUrl: baseUrl2,
          headers: {
            referer: ctx.url,
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
            Accept: "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            Connection: "keep-alive",
            "Content-Type": "application/json",
            "X-Turbo": "TurboVidClient",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin"
          }
        })
      ).juice;
      if (!encodedJuiceKey) throw new Error("Failed to fetch the key");
      const juiceKey = atob(encodedJuiceKey);
      ctx.progress(60);
      const data = JSON.parse(
        await ctx.proxiedFetcher("/api/cucked/the_juice_v2/", {
          baseUrl: baseUrl2,
          query: {
            [apkey]: xxid
          },
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
            Accept: "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            Connection: "keep-alive",
            "Content-Type": "application/json",
            "X-Turbo": "TurboVidClient",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            referer: ctx.url
          }
        })
      ).data;
      if (!data) throw new Error("Failed to fetch required data");
      ctx.progress(90);
      const playlist = decrypt(data, juiceKey);
      const streamHeaders = {
        referer: `${baseUrl2}/`,
        origin: baseUrl2
      };
      return {
        stream: [
          {
            type: "hls",
            id: "primary",
            playlist,
            preferredHeaders: streamHeaders,
            flags: [flags.CORS_ALLOWED],
            captions: []
          }
        ]
      };
    }
  });
  const captionTypes = {
    srt: "srt",
    vtt: "vtt"
  };
  function getCaptionTypeFromUrl(url) {
    const extensions = Object.keys(captionTypes);
    const type = extensions.find((v) => url.endsWith(`.${v}`));
    if (!type) return null;
    return type;
  }
  function labelToLanguageCode(label) {
    const languageMap = {
      "chinese - hong kong": "zh",
      "chinese - traditional": "zh",
      czech: "cs",
      danish: "da",
      dutch: "nl",
      english: "en",
      "english - sdh": "en",
      finnish: "fi",
      french: "fr",
      german: "de",
      greek: "el",
      hungarian: "hu",
      italian: "it",
      korean: "ko",
      norwegian: "no",
      polish: "pl",
      portuguese: "pt",
      "portuguese - brazilian": "pt",
      romanian: "ro",
      "spanish - european": "es",
      "spanish - latin american": "es",
      spanish: "es",
      swedish: "sv",
      turkish: "tr",
      اَلْعَرَبِيَّةُ: "ar",
      বাংলা: "bn",
      filipino: "tl",
      indonesia: "id",
      اردو: "ur",
      English: "en",
      Arabic: "ar",
      Bosnian: "bs",
      Bulgarian: "bg",
      Croatian: "hr",
      Czech: "cs",
      Danish: "da",
      Dutch: "nl",
      Estonian: "et",
      Finnish: "fi",
      French: "fr",
      German: "de",
      Greek: "el",
      Hebrew: "he",
      Hungarian: "hu",
      Indonesian: "id",
      Italian: "it",
      Norwegian: "no",
      Persian: "fa",
      Polish: "pl",
      Portuguese: "pt",
      "Protuguese (BR)": "pt-br",
      Romanian: "ro",
      Russian: "ru",
      russian: "ru",
      Serbian: "sr",
      Slovenian: "sl",
      Spanish: "es",
      Swedish: "sv",
      Thai: "th",
      Turkish: "tr",
      // Simple language codes
      ng: "en",
      re: "fr",
      pa: "es"
    };
    const mappedCode = languageMap[label.toLowerCase()];
    if (mappedCode) return mappedCode;
    const code2 = ISO6391.getCode(label);
    if (code2.length === 0) return null;
    return code2;
  }
  function removeDuplicatedLanguages(list) {
    const beenSeen = {};
    return list.filter((sub) => {
      if (beenSeen[sub.language]) return false;
      beenSeen[sub.language] = true;
      return true;
    });
  }
  const origin = "https://rabbitstream.net";
  const referer$2 = "https://rabbitstream.net/";
  const { AES, enc } = crypto;
  function isJSON(json) {
    try {
      JSON.parse(json);
      return true;
    } catch {
      return false;
    }
  }
  function extractKey(script) {
    const startOfSwitch = script.lastIndexOf("switch");
    const endOfCases = script.indexOf("partKeyStartPosition");
    const switchBody = script.slice(startOfSwitch, endOfCases);
    const nums = [];
    const matches = switchBody.matchAll(/:[a-zA-Z0-9]+=([a-zA-Z0-9]+),[a-zA-Z0-9]+=([a-zA-Z0-9]+);/g);
    for (const match of matches) {
      const innerNumbers = [];
      for (const varMatch of [match[1], match[2]]) {
        const regex = new RegExp(`${varMatch}=0x([a-zA-Z0-9]+)`, "g");
        const varMatches = [...script.matchAll(regex)];
        const lastMatch = varMatches[varMatches.length - 1];
        if (!lastMatch) return null;
        const number = parseInt(lastMatch[1], 16);
        innerNumbers.push(number);
      }
      nums.push([innerNumbers[0], innerNumbers[1]]);
    }
    return nums;
  }
  const upcloudScraper = makeEmbed({
    id: "upcloud",
    name: "UpCloud",
    rank: 200,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    async scrape(ctx) {
      const parsedUrl = new URL(ctx.url.replace("embed-5", "embed-4"));
      const dataPath = parsedUrl.pathname.split("/");
      const dataId = dataPath[dataPath.length - 1];
      const streamRes = await ctx.proxiedFetcher(`${parsedUrl.origin}/ajax/embed-4/getSources?id=${dataId}`, {
        headers: {
          Referer: parsedUrl.origin,
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      let sources = null;
      if (!isJSON(streamRes.sources)) {
        const scriptJs = await ctx.proxiedFetcher(`https://rabbitstream.net/js/player/prod/e4-player.min.js`, {
          query: {
            // browser side caching on this endpoint is quite extreme. Add version query paramter to circumvent any caching
            v: Date.now().toString()
          }
        });
        const decryptionKey = extractKey(scriptJs);
        if (!decryptionKey) throw new Error("Key extraction failed");
        let extractedKey = "";
        let strippedSources = streamRes.sources;
        let totalledOffset = 0;
        decryptionKey.forEach(([a, b]) => {
          const start = a + totalledOffset;
          const end = start + b;
          extractedKey += streamRes.sources.slice(start, end);
          strippedSources = strippedSources.replace(streamRes.sources.substring(start, end), "");
          totalledOffset += b;
        });
        const decryptedStream = AES.decrypt(strippedSources, extractedKey).toString(enc.Utf8);
        const parsedStream = JSON.parse(decryptedStream)[0];
        if (!parsedStream) throw new Error("No stream found");
        sources = parsedStream;
      }
      if (!sources) throw new Error("upcloud source not found");
      const captions = [];
      streamRes.tracks.forEach((track) => {
        if (track.kind !== "captions") return;
        const type = getCaptionTypeFromUrl(track.file);
        if (!type) return;
        const language = labelToLanguageCode(track.label.split(" ")[0]);
        if (!language) return;
        captions.push({
          id: track.file,
          language,
          hasCorsRestrictions: false,
          type,
          url: track.file
        });
      });
      return {
        stream: [
          {
            id: "primary",
            type: "hls",
            playlist: sources.file,
            flags: [flags.CORS_ALLOWED],
            captions,
            preferredHeaders: {
              Referer: referer$2,
              Origin: origin
            }
          }
        ]
      };
    }
  });
  async function comboScraper$t(ctx) {
    ctx.media.type === "show" ? "tv" : "movie";
    let id = ctx.media.tmdbId;
    if (ctx.media.type === "show") {
      id = `tv/${id}/${ctx.media.season.number}/${ctx.media.episode.number}`;
    } else {
      id = `movie/${id}`;
    }
    const embedUrl = `https://player.autoembed.cc/embed/${id}`;
    const embeds = [
      {
        embedId: `autoembed-english`,
        url: embedUrl
      }
    ];
    return {
      embeds
    };
  }
  const autoembedScraper = makeSourcerer({
    id: "autoembed",
    name: "Autoembed",
    rank: 110,
    disabled: false,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$t,
    scrapeShow: comboScraper$t
  });
  const TMDB_API_KEY$1 = (typeof process !== "undefined" && ((_a = process.env) == null ? void 0 : _a.EXPO_PUBLIC_TMDB_API_KEY) || typeof process !== "undefined" && ((_b = process.env) == null ? void 0 : _b.MOVIE_WEB_TMDB_API_KEY) || "").trim();
  async function fetchTMDBName(ctx, lang = "en-US") {
    if (!TMDB_API_KEY$1) {
      throw new Error("Missing TMDB API key. Set EXPO_PUBLIC_TMDB_API_KEY (or MOVIE_WEB_TMDB_API_KEY for the providers CLI).");
    }
    const type = ctx.media.type === "movie" ? "movie" : "tv";
    const url = `https://api.themoviedb.org/3/${type}/${ctx.media.tmdbId}?api_key=${TMDB_API_KEY$1}&language=${lang}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error fetching TMDB data: ${response.statusText}`);
    }
    const data = await response.json();
    return ctx.media.type === "movie" ? data.title : data.name;
  }
  const BASE_URL$1 = "https://dopebox.to";
  const SEARCH_URL = `${BASE_URL$1}/search/`;
  const SEASONS_URL = `${BASE_URL$1}/ajax/season/list/`;
  const EPISODES_URL = `${BASE_URL$1}/ajax/season/episodes/`;
  const SHOW_SERVERS_URL = `${BASE_URL$1}/ajax/episode/servers/`;
  const MOVIE_SERVERS_URL = `${BASE_URL$1}/ajax/episode/list/`;
  const FETCH_EMBEDS_URL = `${BASE_URL$1}/ajax/episode/sources/`;
  const FETCH_SOURCES_URL = "https://streameeeeee.site/embed-1/v3/e-1/getSources";
  const CLIENT_KEY_PATTERN_1 = /window\._lk_db\s*?=\s*?{\s*?x:\s*?"(\w+)?",\s*?y:\s*?"(\w+)?",\s*?z:\s*?"(\w+)?"\s*?}/;
  const CLIENT_KEY_PATTERN_2 = /window\._xy_ws\s*?=\s*?"(\w+)?"/;
  const CLIENT_KEY_PATTERN_3 = /\s*?_is_th:\s*?(\w+)\s*?/;
  function getSearchQuery(title) {
    return title.trim().split(" ").join("-").toLowerCase();
  }
  async function searchMedia(ctx, query) {
    const response = await ctx.proxiedFetcher.full(`${SEARCH_URL}${query}`, {
      headers: {
        Origin: BASE_URL$1,
        Referer: `${BASE_URL$1}/`
      }
    });
    const $ = cheerio__namespace.load(response.body);
    const results = [];
    $(".flw-item").each((_, film) => {
      var _a2, _b2, _c2, _d2;
      const detail = $(film).find(".film-detail").first();
      const nameURL = (_a2 = detail == null ? void 0 : detail.find(".film-name").first()) == null ? void 0 : _a2.find("a").first();
      if (!detail || !nameURL) {
        return;
      }
      const pathname = (_b2 = nameURL.attr("href")) == null ? void 0 : _b2.trim();
      const title = (_c2 = nameURL.attr("title")) == null ? void 0 : _c2.trim();
      const info = (_d2 = detail.find(".fd-infor").first()) == null ? void 0 : _d2.find("span").map((__, span) => $(span).text().trim()).toArray();
      if (!pathname || !title || !info || info.length === 0) {
        return;
      }
      const url = URL.parse(pathname, BASE_URL$1);
      const id = url == null ? void 0 : url.pathname.split("-").pop();
      if (!url || !id) {
        console.error("Could not parse media URL", pathname);
        return;
      }
      results.push({
        url,
        id,
        title,
        info
      });
    });
    return results;
  }
  async function getSeasons(ctx, media) {
    const response = await ctx.proxiedFetcher.full(`${SEASONS_URL}${media.id}`, {
      headers: {
        Origin: BASE_URL$1,
        Referer: `${BASE_URL$1}/`,
        "X-Requested-With": "XMLHttpRequest",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin"
      }
    });
    const $ = cheerio__namespace.load(response.body);
    const seasons = [];
    $(".ss-item").each((_, s) => {
      var _a2, _b2;
      const id = (_a2 = $(s).attr("data-id")) == null ? void 0 : _a2.trim();
      const number = (_b2 = /(\d+)/.exec($(s).text().trim())) == null ? void 0 : _b2[1].trim();
      if (!id || !number) {
        return;
      }
      seasons.push({
        id,
        number: parseInt(number, 10)
      });
    });
    return seasons;
  }
  async function getEpisodes$1(ctx, season) {
    const response = await ctx.proxiedFetcher.full(`${EPISODES_URL}${season.id}`, {
      headers: {
        Origin: BASE_URL$1,
        Referer: `${BASE_URL$1}/`,
        "X-Requested-With": "XMLHttpRequest",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin"
      }
    });
    const $ = cheerio__namespace.load(response.body);
    const episodes = [];
    $(".eps-item").each((_, ep) => {
      var _a2, _b2, _c2, _d2, _e;
      const id = (_a2 = $(ep).attr("data-id")) == null ? void 0 : _a2.trim();
      const number = (_b2 = /(\d+)/.exec($(ep).find(".episode-number").first().text())) == null ? void 0 : _b2[1].trim();
      const title = (_e = (_d2 = (_c2 = $(ep).find(".film-name").first()) == null ? void 0 : _c2.find("a").first()) == null ? void 0 : _d2.attr("title")) == null ? void 0 : _e.trim();
      if (!id || !number) {
        return;
      }
      episodes.push({
        id,
        number: parseInt(number, 10),
        title
      });
    });
    return episodes;
  }
  async function getPlayers(ctx, media, url) {
    const response = await ctx.proxiedFetcher.full(url, {
      headers: {
        Origin: BASE_URL$1,
        Referer: `${BASE_URL$1}/`,
        "X-Requested-With": "XMLHttpRequest",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin"
      }
    });
    const $ = cheerio__namespace.load(response.body);
    const players = [];
    $(".link-item").each((_, p) => {
      var _a2, _b2;
      const id = (_a2 = $(p).attr("data-id")) == null ? void 0 : _a2.trim();
      const name = (_b2 = $(p).find("span").first()) == null ? void 0 : _b2.text().trim();
      if (!id || !name) {
        return;
      }
      players.push({
        id,
        url: `${media.url.href.replace(/\/tv\//, "/watch-tv/").replace(/\/movie\//, "/watch-movie/")}.${id}`,
        name
      });
    });
    return players;
  }
  async function getEpisodePlayers(ctx, media, episode) {
    return getPlayers(ctx, media, `${SHOW_SERVERS_URL}${episode.id}`);
  }
  async function getMoviePlayers(ctx, media) {
    return getPlayers(ctx, media, `${MOVIE_SERVERS_URL}${media.id}`);
  }
  async function getEmbedLink(ctx, playerURL) {
    const sourceID = playerURL.split(".").pop();
    const response = await ctx.proxiedFetcher.full(`${FETCH_EMBEDS_URL}${sourceID}`, {
      headers: {
        Referer: playerURL,
        "X-Requested-With": "XMLHttpRequest",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin"
      }
    });
    return response.body.link;
  }
  async function getClientKey(ctx, embedURL) {
    const response = await ctx.proxiedFetcher.full(embedURL, {
      headers: {
        Referer: `${BASE_URL$1}/`,
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site"
      }
    });
    const $ = cheerio__namespace.load(response.body);
    let key = "";
    $("script").each((_, script) => {
      if (key) {
        return false;
      }
      const text = $(script).text().trim();
      let match = CLIENT_KEY_PATTERN_2.exec(text);
      if (match) {
        key = match.slice(1).join("").trim();
        return;
      }
      match = CLIENT_KEY_PATTERN_1.exec(text);
      if (!match) {
        return;
      }
      key = match[1].trim();
    });
    $("script").each((_, script) => {
      if (key) {
        return false;
      }
      const attr = $(script).attr("nonce");
      if (!attr) {
        return;
      }
      key = attr.trim();
    });
    $("div").each((_, div) => {
      if (key) {
        return false;
      }
      const attr = $(div).attr("data-dpi");
      if (!attr) {
        return;
      }
      key = attr.trim();
    });
    $("meta").each((_, meta) => {
      var _a2, _b2;
      if (key) {
        return false;
      }
      const name = (_a2 = $(meta).attr("name")) == null ? void 0 : _a2.trim();
      const content = (_b2 = $(meta).attr("content")) == null ? void 0 : _b2.trim();
      if (!name || !content || name !== "_gg_fb") {
        return;
      }
      key = content.trim();
    });
    $("*").contents().each((_, node) => {
      if (key) {
        return false;
      }
      if (node.nodeType === 8) {
        const match = CLIENT_KEY_PATTERN_3.exec(node.nodeValue.trim());
        if (!match) {
          return;
        }
        key = match[1].trim();
      }
    });
    return key;
  }
  async function scrapeUpCloudEmbed(ctx) {
    const embedURL = URL.parse(await getEmbedLink(ctx, ctx.url));
    if (!embedURL) {
      throw new Error("Failed to get embed URL (invalid movie?)");
    }
    const embedID = embedURL.pathname.split("/").pop();
    if (!embedID) {
      throw new Error("Failed to get embed ID");
    }
    const clientKey = await getClientKey(ctx, embedURL.href);
    if (!clientKey) {
      throw new Error("Failed to get client key");
    }
    const response = await ctx.proxiedFetcher.full(`${FETCH_SOURCES_URL}?id=${embedID}&_k=${clientKey}`, {
      headers: {
        Referer: embedURL.href,
        Origin: "https://streameeeeee.site",
        "X-Requested-With": "XMLHttpRequest",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin"
      }
    });
    if (!response.body.sources || response.body.sources.length === 0) {
      console.warn("Server gave no sources", response.body);
      return {
        stream: []
      };
    }
    const streamHeaders = {
      Referer: "https://streameeeeee.site/",
      Origin: "https://streameeeeee.site"
    };
    return {
      stream: response.body.sources.map((source, i2) => {
        return {
          type: "hls",
          id: `stream-${i2}`,
          flags: [flags.CORS_ALLOWED],
          captions: [],
          playlist: createM3U8ProxyUrl(source.file, ctx.features, streamHeaders),
          headers: streamHeaders
        };
      })
    };
  }
  async function handleContext(ctx) {
    var _a2;
    if (ctx.media.type !== "movie" && ctx.media.type !== "show") {
      return [];
    }
    const mediaType = ctx.media.type === "show" ? "TV" : "Movie";
    const mediaTitle = await fetchTMDBName(ctx);
    const results = (await searchMedia(ctx, getSearchQuery(mediaTitle))).filter((r) => r.info.includes(mediaType));
    const fuse = new Fuse(results, {
      keys: ["title"]
    });
    const media = (_a2 = fuse.search(mediaTitle).find((r) => r.item.info.includes(ctx.media.releaseYear.toString()))) == null ? void 0 : _a2.item;
    if (!media) {
      throw new Error("Could not find movie");
    }
    if (ctx.media.type === "show") {
      const seasonNumber = ctx.media.season.number;
      const epNumber = ctx.media.episode.number;
      const season = (await getSeasons(ctx, media)).find((s) => s.number === seasonNumber);
      if (!season) {
        throw new Error("Could not find season");
      }
      const episode = (await getEpisodes$1(ctx, season)).find((ep) => ep.number === epNumber);
      if (!episode) {
        throw new Error("Could not find episode");
      }
      return getEpisodePlayers(ctx, media, episode);
    }
    return getMoviePlayers(ctx, media);
  }
  function addEmbedFromPlayer(name, players, embeds) {
    const player = players.find((p) => p.name.toLowerCase().trim() === name.toLowerCase().trim());
    if (!player) {
      return;
    }
    embeds.push({
      embedId: `dopebox-${player.name.toLowerCase().trim()}`,
      url: player.url
    });
  }
  async function comboScraper$s(ctx) {
    const players = await handleContext(ctx);
    if (!players) {
      return {
        embeds: [],
        stream: []
      };
    }
    const embeds = [];
    addEmbedFromPlayer("UpCloud", players, embeds);
    if (embeds.length < 1) {
      throw new Error("No valid sources were found");
    }
    return {
      embeds
    };
  }
  const dopeboxScraper = makeSourcerer({
    id: "dopebox",
    name: "Dopebox",
    rank: 197,
    disabled: false,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$s,
    scrapeShow: comboScraper$s
  });
  const dopeboxEmbeds = [
    makeEmbed({
      id: "dopebox-upcloud",
      name: "UpCloud",
      rank: 101,
      disabled: true,
      flags: [flags.CORS_ALLOWED],
      scrape: scrapeUpCloudEmbed
    })
  ];
  const getEnvValue = (keys) => {
    try {
      if (typeof process === "undefined") return void 0;
      const env = process.env;
      for (const key of keys) {
        const value = env == null ? void 0 : env[key];
        if (value && value.trim()) {
          return value.trim();
        }
      }
    } catch (e) {
    }
    return void 0;
  };
  const apiBaseUrl = "https://borg.rips.cc";
  const envUsername = getEnvValue(["EE3_USERNAME", "PSTREAM_EE3_USERNAME", "EXPO_PUBLIC_EE3_USERNAME", "NEXT_PUBLIC_EE3_USERNAME"]);
  const envPassword = getEnvValue(["EE3_PASSWORD", "PSTREAM_EE3_PASSWORD", "EXPO_PUBLIC_EE3_PASSWORD", "NEXT_PUBLIC_EE3_PASSWORD"]);
  const username = envUsername ?? "_sf_";
  const password = envPassword ?? "defonotscraping";
  async function fetchMovie(ctx, ee3Auth) {
    const authResp = await ctx.proxiedFetcher.full(
      `${apiBaseUrl}/api/collections/users/auth-with-password?expand=lists_liked`,
      {
        method: "POST",
        headers: {
          Origin: "https://ee3.me",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          identity: username,
          password: ee3Auth
        })
      }
    );
    if (authResp.statusCode !== 200) {
      throw new Error(`Auth failed with status: ${authResp.statusCode}: ${JSON.stringify(authResp.body)}`);
    }
    const jsonResponse = authResp.body;
    if (!(jsonResponse == null ? void 0 : jsonResponse.token)) {
      throw new Error(`No token in auth response: ${JSON.stringify(jsonResponse)}`);
    }
    const token = jsonResponse.token;
    ctx.progress(20);
    const movieUrl = `${apiBaseUrl}/api/collections/movies/records?page=1&perPage=48&filter=tmdb_data.id%20~%20${ctx.media.tmdbId}`;
    const movieResp = await ctx.proxiedFetcher.full(movieUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: "https://ee3.me"
      }
    });
    if (movieResp.statusCode !== 200) {
      throw new Error(`Movie lookup failed with status: ${movieResp.statusCode}: ${JSON.stringify(movieResp.body)}`);
    }
    const movieJsonResponse = movieResp.body;
    if (!(movieJsonResponse == null ? void 0 : movieJsonResponse.items) || movieJsonResponse.items.length === 0) {
      throw new NotFoundError(`No items found for TMDB ID ${ctx.media.tmdbId}: ${JSON.stringify(movieJsonResponse)}`);
    }
    if (!movieJsonResponse.items[0].video) {
      throw new NotFoundError(`No video field in first item: ${JSON.stringify(movieJsonResponse.items[0])}`);
    }
    const movieId = movieJsonResponse.items[0].video;
    ctx.progress(40);
    const keyResp = await ctx.proxiedFetcher.full(`${apiBaseUrl}/video/${movieId}/key`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: "https://ee3.me"
      }
    });
    if (keyResp.statusCode !== 200) {
      throw new Error(`Key fetch failed with status: ${keyResp.statusCode}: ${JSON.stringify(keyResp.body)}`);
    }
    const keyJsonResponse = keyResp.body;
    if (!(keyJsonResponse == null ? void 0 : keyJsonResponse.key)) {
      throw new Error(`No key in response: ${JSON.stringify(keyJsonResponse)}`);
    }
    ctx.progress(60);
    return `${movieId}?k=${keyJsonResponse.key}`;
  }
  async function comboScraper$r(ctx) {
    const movData = await fetchMovie(ctx, password);
    if (!movData) {
      throw new NotFoundError("No watchable item found");
    }
    ctx.progress(80);
    const videoUrl = `${apiBaseUrl}/video/${movData}`;
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          type: "file",
          qualities: {
            unknown: {
              type: "mp4",
              url: videoUrl
            }
          },
          headers: {
            Origin: "https://ee3.me"
          },
          flags: [],
          captions: []
        }
      ]
    };
  }
  const ee3Scraper = makeSourcerer({
    id: "ee3",
    name: "EE3",
    rank: 188,
    disabled: true,
    flags: [],
    scrapeMovie: comboScraper$r
  });
  function normalizeTitle$3(title) {
    let titleTrimmed = title.trim().toLowerCase();
    if (titleTrimmed !== "the movie" && titleTrimmed.endsWith("the movie")) {
      titleTrimmed = titleTrimmed.replace("the movie", "");
    }
    if (titleTrimmed !== "the series" && titleTrimmed.endsWith("the series")) {
      titleTrimmed = titleTrimmed.replace("the series", "");
    }
    return titleTrimmed.replace(/['":]/g, "").replace(/[^a-zA-Z0-9]+/g, "_");
  }
  function compareTitle(a, b) {
    return normalizeTitle$3(a) === normalizeTitle$3(b);
  }
  function compareMedia(media, title, releaseYear) {
    const isSameYear = releaseYear === void 0 ? true : media.releaseYear === releaseYear;
    return compareTitle(media.title, title) && isSameYear;
  }
  function getValidQualityFromString(quality) {
    switch (quality.toLowerCase().replace("p", "")) {
      case "360":
        return "360";
      case "480":
        return "480";
      case "720":
        return "720";
      case "1080":
        return "1080";
      case "2160":
        return "4k";
      case "4k":
        return "4k";
      default:
        return "unknown";
    }
  }
  const baseUrl$l = "https://fsharetv.co";
  async function comboScraper$q(ctx) {
    var _a2, _b2;
    const searchPage = await ctx.proxiedFetcher("/search", {
      baseUrl: baseUrl$l,
      query: {
        q: ctx.media.title
      }
    });
    const search$ = cheerio.load(searchPage);
    const searchResults = [];
    search$(".movie-item").each((_, element) => {
      var _a3;
      const [, title, year] = ((_a3 = search$(element).find("b").text()) == null ? void 0 : _a3.match(/^(.*?)\s*(?:\(?\s*(\d{4})(?:\s*-\s*\d{0,4})?\s*\)?)?\s*$/)) || [];
      const url = search$(element).find("a").attr("href");
      if (!title || !url) return;
      searchResults.push({ title, year: Number(year) ?? void 0, url });
    });
    const watchPageUrl = (_a2 = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))) == null ? void 0 : _a2.url;
    if (!watchPageUrl) throw new NotFoundError("No watchable item found");
    ctx.progress(50);
    const watchPage = await ctx.proxiedFetcher(watchPageUrl.replace("/movie", "/w"), { baseUrl: baseUrl$l });
    const fileId = (_b2 = watchPage.match(/Movie\.setSource\('([^']*)'/)) == null ? void 0 : _b2[1];
    if (!fileId) throw new Error("File ID not found");
    const apiRes = await ctx.proxiedFetcher(
      `/api/file/${fileId}/source`,
      {
        baseUrl: baseUrl$l,
        query: {
          type: "watch"
        }
      }
    );
    if (!apiRes.data.file.sources.length) throw new Error("No sources found");
    const mediaBase = new URL((await ctx.proxiedFetcher.full(apiRes.data.file.sources[0].src, { baseUrl: baseUrl$l })).finalUrl).origin;
    const qualities = apiRes.data.file.sources.reduce(
      (acc, source) => {
        const quality = typeof source.quality === "number" ? source.quality.toString() : source.quality;
        const validQuality = getValidQualityFromString(quality);
        acc[validQuality] = {
          type: "mp4",
          url: `${mediaBase}${source.src.replace("/api", "")}`
        };
        return acc;
      },
      {}
    );
    ctx.progress(90);
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          type: "file",
          flags: [],
          headers: {
            referer: "https://fsharetv.co"
          },
          qualities,
          captions: []
        }
      ]
    };
  }
  const fsharetvScraper = makeSourcerer({
    id: "fsharetv",
    name: "FshareTV",
    rank: 201,
    flags: [],
    scrapeMovie: comboScraper$q
  });
  const ORIGIN_HOST = "https://www3.fsonline.app";
  const MOVIE_PAGE_URL = "https://www3.fsonline.app/film/";
  const SHOW_PAGE_URL = "https://www3.fsonline.app/episoade/{{MOVIE}}-sezonul-{{SEASON}}-episodul-{{EPISODE}}/";
  const EMBED_URL = "https://www3.fsonline.app/wp-admin/admin-ajax.php";
  function throwOnResponse(response) {
    if (response.statusCode >= 400) {
      throw new Error(`Response does not indicate success: ${response.statusCode}`);
    }
  }
  function getMoviePageURL(name, season, episode) {
    const n = name.trim().normalize("NFD").toLowerCase().replace(/[^a-zA-Z0-9. ]+/g, "").replace(".", " ").split(" ").join("-");
    if (season && episode) {
      return SHOW_PAGE_URL.replace("{{MOVIE}}", n).replace("{{SEASON}}", `${season}`).replace("{{EPISODE}}", `${episode}`);
    }
    return `${MOVIE_PAGE_URL}${n}/`;
  }
  async function fetchIFrame(ctx, url) {
    const response = await ctx.proxiedFetcher.full(url, {
      headers: {
        Referer: ORIGIN_HOST,
        Origin: ORIGIN_HOST,
        "sec-fetch-dest": "iframe",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "cross-site"
      }
    });
    throwOnResponse(response);
    return response;
  }
  const LOG_PREFIX$1 = `[Doodstream]`;
  const STREAM_REQ_PATERN = /\$\.get\('(\/pass_md5\/.+?)'/;
  const TOKEN_PARAMS_PATERN = /\+ "\?(token=.+?)"/;
  function generateStreamKey() {
    const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let o = 0; o < 10; o++) {
      result += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    }
    return result;
  }
  function extractStreamInfo($) {
    let streamReq;
    let tokenParams;
    $("script").each((_, script) => {
      var _a2, _b2;
      if (streamReq && tokenParams) {
        return;
      }
      const text = $(script).text().trim();
      if (!streamReq) {
        streamReq = (_a2 = text.match(STREAM_REQ_PATERN)) == null ? void 0 : _a2[1];
      }
      if (!tokenParams) {
        tokenParams = (_b2 = text.match(TOKEN_PARAMS_PATERN)) == null ? void 0 : _b2[1];
      }
    });
    tokenParams = `${generateStreamKey()}?${tokenParams}${Date.now()}`;
    return [streamReq, tokenParams];
  }
  async function getStream$3(ctx, url) {
    let $;
    let streamHost;
    let reqReferer;
    try {
      const response = await fetchIFrame(ctx, url);
      if (!response) {
        return void 0;
      }
      $ = cheerio__namespace.load(response.body);
      streamHost = new URL(response.finalUrl).hostname;
      reqReferer = response.finalUrl;
    } catch (error) {
      console.error(LOG_PREFIX$1, "Failed to fetch iframe", error);
      return void 0;
    }
    const [streamReq, tokenParams] = extractStreamInfo($);
    if (!streamReq || !tokenParams) {
      console.error(LOG_PREFIX$1, "Couldn't find stream info", streamReq, tokenParams);
      return void 0;
    }
    let streamURL;
    try {
      const response = await ctx.proxiedFetcher.full(`https://${streamHost}${streamReq}`, {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          Referer: reqReferer,
          Origin: ORIGIN_HOST
        }
      });
      throwOnResponse(response);
      streamURL = await response.body + tokenParams;
    } catch (error) {
      console.error(LOG_PREFIX$1, "Failed to request stream URL", error);
      return void 0;
    }
    return [streamURL, streamHost];
  }
  async function scrapeDoodstreamEmbed(ctx) {
    let streamURL;
    let streamHost;
    try {
      const stream = await getStream$3(ctx, ctx.url);
      if (!stream || !stream[0]) {
        return {
          stream: []
        };
      }
      [streamURL, streamHost] = stream;
    } catch (error) {
      console.warn(LOG_PREFIX$1, "Failed to get stream", error);
      throw error;
    }
    return {
      stream: [
        {
          type: "file",
          id: "primary",
          flags: [flags.CORS_ALLOWED],
          captions: [],
          qualities: {
            unknown: {
              type: "mp4",
              url: streamURL
            }
          },
          headers: {
            Referer: `https://${streamHost}/`,
            Origin: ORIGIN_HOST
          }
        }
      ]
    };
  }
  const BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    pragma: "no-cache"
  };
  const LOG_PREFIX = "[FSOnline]";
  function normalizeText(input) {
    return input.trim().normalize("NFD").toLowerCase().replace(/[^a-zA-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  async function searchMoviePageUrl(ctx, title, year) {
    const query = year ? `${title} ${year}` : title;
    let $;
    try {
      const response = await ctx.proxiedFetcher.full(
        `${ORIGIN_HOST}/?s=${encodeURIComponent(query)}`,
        {
          headers: {
            Origin: ORIGIN_HOST,
            Referer: ORIGIN_HOST,
            ...BROWSER_HEADERS
          }
        }
      );
      throwOnResponse(response);
      $ = cheerio__namespace.load(await response.body);
    } catch (error) {
      console.warn(LOG_PREFIX, "Search request failed", query, error);
      return void 0;
    }
    const wantTitle = normalizeText(title);
    const wantYear = year ? `${year}` : void 0;
    const candidates = [];
    $("article.item.movies").each((_, el) => {
      const url = $(el).find('a[href*="/film/"]').attr("href");
      const titleText = $(el).find("h3").text().trim();
      if (!url) return;
      if (!url.startsWith(ORIGIN_HOST)) return;
      candidates.push({ url, titleText });
    });
    if (candidates.length < 1) {
      $('a[href*="/film/"]').each((_, el) => {
        const url = $(el).attr("href");
        if (!url) return;
        if (!url.startsWith(ORIGIN_HOST)) return;
        candidates.push({ url, titleText: $(el).text().trim() });
      });
    }
    const seen = /* @__PURE__ */ new Set();
    const uniqueCandidates = candidates.filter((c) => {
      if (seen.has(c.url)) return false;
      seen.add(c.url);
      return true;
    });
    let best;
    for (const c of uniqueCandidates) {
      const normalizedCandidateTitle = normalizeText(c.titleText);
      let score = 0;
      if (wantYear && (c.url.includes(`-${wantYear}/`) || normalizedCandidateTitle.includes(wantYear))) score += 50;
      if (normalizedCandidateTitle.includes(wantTitle)) score += 25;
      const wantWords = wantTitle.split(" ").filter(Boolean);
      const haveWords = new Set(normalizedCandidateTitle.split(" ").filter(Boolean));
      for (const w of wantWords) {
        if (haveWords.has(w)) score += 2;
      }
      if (!best || score > best.score) best = { url: c.url, score };
    }
    return best == null ? void 0 : best.url;
  }
  async function getMovieID(ctx, url, opts) {
    let $;
    try {
      const response = await ctx.proxiedFetcher.full(url, {
        headers: {
          Origin: ORIGIN_HOST,
          Referer: ORIGIN_HOST,
          ...BROWSER_HEADERS
        }
      });
      throwOnResponse(response);
      $ = cheerio__namespace.load(await response.body);
    } catch (error) {
      if (error instanceof Error && error.message.includes("404")) {
        if (!(opts == null ? void 0 : opts.silentNotFound)) {
          console.warn(LOG_PREFIX, "Movie page returned 404", url);
        }
        return void 0;
      }
      console.error(LOG_PREFIX, "Failed to fetch movie page", url, error);
      return void 0;
    }
    const movieID = $("#show_player_lazy").attr("movie-id");
    if (!movieID) {
      console.error(LOG_PREFIX, "Could not find movie ID", url);
      return void 0;
    }
    return movieID;
  }
  async function getMovieSources(ctx, id, refererHeader) {
    const sources = /* @__PURE__ */ new Map();
    let $;
    try {
      const response = await ctx.proxiedFetcher.full(EMBED_URL, {
        method: "POST",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Referer: refererHeader,
          Origin: ORIGIN_HOST,
          ...BROWSER_HEADERS
        },
        body: `action=lazy_player&movieID=${id}`
      });
      throwOnResponse(response);
      $ = cheerio__namespace.load(await response.body);
    } catch (error) {
      console.error(LOG_PREFIX, "Could not fetch source index", error);
      return sources;
    }
    $("li.dooplay_player_option").each((_, element) => {
      const name = $(element).find("span").text().trim();
      const url = $(element).attr("data-vs");
      if (!url) {
        console.warn(LOG_PREFIX, "Skipping invalid source", name);
        return;
      }
      sources.set(name, url);
    });
    return sources;
  }
  function addEmbedFromSources(name, sources, embeds) {
    const url = sources.get(name);
    if (!url) {
      return;
    }
    embeds.push({
      embedId: `fsonline-${name.toLowerCase()}`,
      url
    });
  }
  async function comboScraper$p(ctx) {
    const movieName = await fetchTMDBName(ctx);
    let moviePageURL = getMoviePageURL(
      ctx.media.type === "movie" ? `${movieName} ${ctx.media.releaseYear}` : movieName,
      ctx.media.type === "show" ? ctx.media.season.number : void 0,
      ctx.media.type === "show" ? ctx.media.episode.number : void 0
    );
    let movieID = await getMovieID(ctx, moviePageURL, { silentNotFound: true });
    if (!movieID && ctx.media.type === "movie") {
      const foundUrl = await searchMoviePageUrl(ctx, movieName, ctx.media.releaseYear);
      if (foundUrl) {
        moviePageURL = foundUrl;
        movieID = await getMovieID(ctx, moviePageURL);
      } else {
        console.warn(LOG_PREFIX, "No matching movie page found via search", movieName, ctx.media.releaseYear);
      }
    }
    if (!movieID) {
      return {
        embeds: [],
        stream: []
      };
    }
    const embeds = [];
    const sources = await getMovieSources(ctx, movieID, moviePageURL);
    addEmbedFromSources("Filemoon", sources, embeds);
    addEmbedFromSources("Doodstream", sources, embeds);
    if (embeds.length < 1) {
      throw new Error("No valid sources were found");
    }
    return {
      embeds
    };
  }
  const fsOnlineScraper = makeSourcerer({
    id: "fsonline",
    name: "FSOnline",
    rank: 140,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$p,
    scrapeShow: comboScraper$p
  });
  const fsOnlineEmbeds = [
    makeEmbed({
      id: "fsonline-doodstream",
      name: "Doodstream",
      rank: 140,
      scrape: scrapeDoodstreamEmbed,
      flags: [flags.CORS_ALLOWED]
    })
    // makeEmbed({
    //   id: 'fsonline-filemoon',
    //   name: 'Filemoon',
    //   rank: 140,
    //   scrape: scrapeFilemoonEmbed,
    //   flags: [flags.CORS_ALLOWED],
    // }),
  ];
  const BASE_URL = "https://isut.streamflix.one";
  async function comboScraper$o(ctx) {
    const embedPage = await ctx.fetcher(
      `${BASE_URL}/api/source/${ctx.media.type === "movie" ? `${ctx.media.tmdbId}` : `${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`}`
    );
    const sources = embedPage.sources;
    if (!sources || sources.length === 0) throw new NotFoundError("No sources found");
    const file = sources[0].file;
    if (!file) throw new NotFoundError("No file URL found");
    ctx.progress(90);
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          playlist: file,
          type: "hls",
          flags: [flags.CORS_ALLOWED],
          captions: []
        }
      ]
    };
  }
  const insertunitScraper = makeSourcerer({
    id: "insertunit",
    name: "Insertunit",
    rank: 12,
    disabled: true,
    flags: [flags.CORS_ALLOWED, flags.IP_LOCKED],
    scrapeMovie: comboScraper$o,
    scrapeShow: comboScraper$o
  });
  const baseUrl$k = "https://mp4hydra.org/";
  async function comboScraper$n(ctx) {
    var _a2;
    const searchPage = await ctx.proxiedFetcher("/search", {
      baseUrl: baseUrl$k,
      query: {
        q: ctx.media.title
      }
    });
    ctx.progress(40);
    const $search = cheerio.load(searchPage);
    const searchResults = [];
    $search(".search-details").each((_, element) => {
      var _a3;
      const [, title, year] = $search(element).find("a").first().text().trim().match(/^(.*?)\s*(?:\(?\s*(\d{4})(?:\s*-\s*\d{0,4})?\s*\)?)?\s*$/) || [];
      const url = (_a3 = $search(element).find("a").attr("href")) == null ? void 0 : _a3.split("/")[4];
      if (!title || !url) return;
      searchResults.push({ title, year: year ? parseInt(year, 10) : void 0, url });
    });
    const s = (_a2 = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))) == null ? void 0 : _a2.url;
    if (!s) throw new NotFoundError("No watchable item found");
    ctx.progress(60);
    const data = await ctx.proxiedFetcher("/info2?v=8", {
      method: "POST",
      body: new URLSearchParams({ z: JSON.stringify([{ s, t: "movie" }]) }),
      baseUrl: baseUrl$k
    });
    if (!data.playlist[0].src || !data.servers) throw new NotFoundError("No watchable item found");
    ctx.progress(80);
    const embeds = [];
    [
      data.servers[data.servers.auto],
      ...Object.values(data.servers).filter((x) => x !== data.servers[data.servers.auto] && x !== data.servers.auto)
    ].forEach(
      (server, _) => embeds.push({ embedId: `mp4hydra-${_ + 1}`, url: `${server}${data.playlist[0].src}|${data.playlist[0].label}` })
    );
    ctx.progress(90);
    return {
      embeds
    };
  }
  const mp4hydraScraper = makeSourcerer({
    id: "mp4hydra",
    name: "Mp4Hydra",
    rank: 4,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$n,
    scrapeShow: comboScraper$n
  });
  const baseUrl$j = "https://mbp.pirxcy.dev";
  function buildQualitiesFromStreams(data) {
    const streams = data.list.reduce((acc, stream) => {
      const { path, quality, format } = stream;
      const realQuality = stream.real_quality;
      if (format !== "mp4") return acc;
      let qualityKey;
      if (quality === "4K" || realQuality === "4K") {
        qualityKey = 2160;
      } else {
        const qualityStr = quality.replace("p", "");
        qualityKey = parseInt(qualityStr, 10);
      }
      if (Number.isNaN(qualityKey) || acc[qualityKey]) return acc;
      acc[qualityKey] = path;
      return acc;
    }, {});
    const filteredStreams = Object.entries(streams).reduce((acc, [quality, url]) => {
      acc[quality] = url;
      return acc;
    }, {});
    return {
      ...filteredStreams[2160] && {
        "4k": {
          type: "mp4",
          url: filteredStreams[2160]
        }
      },
      ...filteredStreams[1080] && {
        1080: {
          type: "mp4",
          url: filteredStreams[1080]
        }
      },
      ...filteredStreams[720] && {
        720: {
          type: "mp4",
          url: filteredStreams[720]
        }
      },
      ...filteredStreams[480] && {
        480: {
          type: "mp4",
          url: filteredStreams[480]
        }
      },
      ...filteredStreams[360] && {
        360: {
          type: "mp4",
          url: filteredStreams[360]
        }
      },
      ...filteredStreams.unknown && {
        unknown: {
          type: "mp4",
          url: filteredStreams.unknown
        }
      }
    };
  }
  async function findMediaByTMDBId(ctx, tmdbId, title, type, year) {
    const searchUrl = `${baseUrl$j}/search?q=${encodeURIComponent(title)}&type=${type}${year ? `&year=${year}` : ""}`;
    const searchRes = await ctx.proxiedFetcher(searchUrl);
    if (!searchRes.data || searchRes.data.length === 0) {
      throw new NotFoundError("No results found in search");
    }
    for (const result of searchRes.data) {
      const detailUrl = `${baseUrl$j}/details/${type}/${result.id}`;
      const detailRes = await ctx.proxiedFetcher(detailUrl);
      if (detailRes.data && detailRes.data.tmdb_id.toString() === tmdbId) {
        return result.id;
      }
    }
    throw new NotFoundError("Could not find matching media item for TMDB ID");
  }
  async function scrapeMovie$1(ctx) {
    var _a2;
    const tmdbId = ctx.media.tmdbId;
    const title = ctx.media.title;
    const year = (_a2 = ctx.media.releaseYear) == null ? void 0 : _a2.toString();
    if (!tmdbId || !title) {
      throw new NotFoundError("Missing required media information");
    }
    const mediaId = await findMediaByTMDBId(ctx, tmdbId, title, "movie", year);
    const streamUrl = `${baseUrl$j}/movie/${mediaId}`;
    const streamData = await ctx.proxiedFetcher(streamUrl);
    if (!streamData.data || !streamData.data.list) {
      throw new NotFoundError("No streams found for this movie");
    }
    const qualities = buildQualitiesFromStreams(streamData.data);
    return {
      stream: [
        {
          id: "pirxcy",
          type: "file",
          qualities,
          flags: [flags.CORS_ALLOWED],
          captions: []
        }
      ],
      embeds: []
    };
  }
  async function scrapeShow(ctx) {
    var _a2;
    const tmdbId = ctx.media.tmdbId;
    const title = ctx.media.title;
    const year = (_a2 = ctx.media.releaseYear) == null ? void 0 : _a2.toString();
    const season = ctx.media.season.number;
    const episode = ctx.media.episode.number;
    if (!tmdbId || !title || !season || !episode) {
      throw new NotFoundError("Missing required media information");
    }
    const mediaId = await findMediaByTMDBId(ctx, tmdbId, title, "tv", year);
    const streamUrl = `${baseUrl$j}/tv/${mediaId}/${season}/${episode}`;
    const streamData = await ctx.proxiedFetcher(streamUrl);
    if (!streamData.data || !streamData.data.list) {
      throw new NotFoundError("No streams found for this episode");
    }
    const qualities = buildQualitiesFromStreams(streamData.data);
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          type: "file",
          qualities,
          flags: [flags.CORS_ALLOWED],
          captions: []
        }
      ]
    };
  }
  const pirxcyScraper = makeSourcerer({
    id: "pirxcy",
    name: "Pirxcy",
    rank: 290,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: scrapeMovie$1,
    scrapeShow
  });
  const baseUrl$i = "https://tugaflix.love/";
  function parseSearch(page) {
    const results = [];
    const $ = cheerio.load(page);
    $(".items .poster").each((_, element) => {
      var _a2;
      const $link = $(element).find("a");
      const url = $link.attr("href");
      const [, title, year] = ((_a2 = $link.attr("title")) == null ? void 0 : _a2.match(/^(.*?)\s*(?:\((\d{4})\))?\s*$/)) || [];
      if (!title || !url) return;
      results.push({ title, year: year ? parseInt(year, 10) : void 0, url });
    });
    return results;
  }
  const tugaflixScraper = makeSourcerer({
    id: "tugaflix",
    name: "Tugaflix",
    rank: 169,
    flags: [flags.CORS_ALLOWED],
    // No longer IP locked
    scrapeMovie: async (ctx) => {
      var _a2;
      const searchResults = parseSearch(
        await ctx.proxiedFetcher("/filmes/", {
          baseUrl: baseUrl$i,
          query: {
            s: ctx.media.title
          }
        })
      );
      if (searchResults.length === 0) throw new NotFoundError("No watchable item found");
      const url = (_a2 = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))) == null ? void 0 : _a2.url;
      if (!url) throw new NotFoundError("No watchable item found");
      ctx.progress(50);
      const videoPage = await ctx.proxiedFetcher(url, {
        method: "POST",
        body: new URLSearchParams({ play: "" })
      });
      const $ = cheerio.load(videoPage);
      const embeds = [];
      for (const element of $(".play a")) {
        const embedUrl = $(element).attr("href");
        if (!embedUrl) continue;
        const embedPage = await ctx.proxiedFetcher.full(
          embedUrl.startsWith("https://") ? embedUrl : `https://${embedUrl}`
        );
        const finalUrl = cheerio.load(embedPage.body)('a:contains("Download Filme")').attr("href");
        if (!finalUrl) continue;
        if (finalUrl.includes("streamtape")) {
          embeds.push({
            embedId: "streamtape",
            url: finalUrl
          });
        } else if (finalUrl.includes("dood")) {
          embeds.push({
            embedId: "dood",
            url: finalUrl
          });
        }
      }
      ctx.progress(90);
      return {
        embeds
      };
    },
    scrapeShow: async (ctx) => {
      var _a2;
      const searchResults = parseSearch(
        await ctx.proxiedFetcher("/series/", {
          baseUrl: baseUrl$i,
          query: {
            s: ctx.media.title
          }
        })
      );
      if (searchResults.length === 0) throw new NotFoundError("No watchable item found");
      const url = (_a2 = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))) == null ? void 0 : _a2.url;
      if (!url) throw new NotFoundError("No watchable item found");
      ctx.progress(50);
      const s = ctx.media.season.number < 10 ? `0${ctx.media.season.number}` : ctx.media.season.number.toString();
      const e = ctx.media.episode.number < 10 ? `0${ctx.media.episode.number}` : ctx.media.episode.number.toString();
      const videoPage = await ctx.proxiedFetcher(url, {
        method: "POST",
        body: new URLSearchParams({ [`S${s}E${e}`]: "" })
      });
      const embedUrl = cheerio.load(videoPage)('iframe[name="player"]').attr("src");
      if (!embedUrl) throw new Error("Failed to find iframe");
      const playerPage = await ctx.proxiedFetcher(embedUrl.startsWith("https:") ? embedUrl : `https:${embedUrl}`, {
        method: "POST",
        body: new URLSearchParams({ submit: "" })
      });
      const embeds = [];
      const finalUrl = cheerio.load(playerPage)('a:contains("Download Episodio")').attr("href");
      if (finalUrl == null ? void 0 : finalUrl.includes("streamtape")) {
        embeds.push({
          embedId: "streamtape",
          url: finalUrl
        });
      } else if (finalUrl == null ? void 0 : finalUrl.includes("dood")) {
        embeds.push({
          embedId: "dood",
          url: finalUrl
        });
      }
      ctx.progress(90);
      return {
        embeds
      };
    }
  });
  const baseUrl$h = "https://api2.vidsrc.vip";
  function digitToLetterMap(digit) {
    const map = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    return map[parseInt(digit, 10)];
  }
  function encodeTmdbId(tmdb, type, season, episode) {
    let raw;
    if (type === "show" && season && episode) {
      raw = `${tmdb}-${season}-${episode}`;
    } else {
      raw = tmdb.split("").map(digitToLetterMap).join("");
    }
    const reversed = raw.split("").reverse().join("");
    return btoa(btoa(reversed));
  }
  async function comboScraper$m(ctx) {
    const apiType = ctx.media.type === "show" ? "tv" : "movie";
    const encodedId = encodeTmdbId(
      ctx.media.tmdbId,
      ctx.media.type,
      ctx.media.type === "show" ? ctx.media.season.number : void 0,
      ctx.media.type === "show" ? ctx.media.episode.number : void 0
    );
    const url = `${baseUrl$h}/${apiType}/${encodedId}`;
    const data = await ctx.proxiedFetcher(url);
    if (!data || !data.source1) throw new NotFoundError("No sources found");
    const embeds = [];
    const embedIds = ["vidsrc-comet", "vidsrc-pulsar", "vidsrc-nova"];
    let sourceIndex = 0;
    for (let i2 = 1; data[`source${i2}`]; i2++) {
      const source = data[`source${i2}`];
      if (source == null ? void 0 : source.url) {
        embeds.push({
          embedId: embedIds[sourceIndex % embedIds.length],
          url: source.url
        });
        sourceIndex++;
      }
    }
    if (embeds.length === 0) throw new NotFoundError("No embeds found");
    return {
      embeds
    };
  }
  const vidsrcvipScraper = makeSourcerer({
    id: "vidsrcvip",
    name: "VidSrc.vip",
    rank: 150,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$m,
    scrapeShow: comboScraper$m
  });
  const zoeBase = "https://zoechip.cc";
  function createSlug(title) {
    return title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
  }
  async function extractFileFromFilemoon(ctx, filemoonUrl) {
    const headers2 = {
      Referer: zoeBase,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    };
    const redirectResponse = await ctx.proxiedFetcher.full(filemoonUrl, {
      method: "HEAD",
      headers: headers2
    });
    const redirectUrl = redirectResponse.finalUrl;
    if (!redirectUrl) {
      return null;
    }
    const redirectHtml = await ctx.proxiedFetcher(redirectUrl, {
      headers: headers2
    });
    const redirectCheerio = cheerio.load(redirectHtml);
    const iframeUrl = redirectCheerio("iframe").attr("src");
    if (!iframeUrl) {
      throw new NotFoundError("No iframe URL found");
    }
    const iframeHtml = await ctx.proxiedFetcher(iframeUrl, {
      headers: headers2
    });
    const evalMatch = iframeHtml.match(/eval\(function\(p,a,c,k,e,.*\)\)/i);
    if (!evalMatch) {
      throw new NotFoundError("No packed JavaScript found");
    }
    const unpacked = unpacker.unpack(evalMatch[0]);
    const fileMatch = unpacked.match(/file\s*:\s*"([^"]+)"/i);
    if (!fileMatch) {
      throw new NotFoundError("No file URL found in unpacked JavaScript");
    }
    const fileUrl = fileMatch[1];
    return fileUrl;
  }
  async function comboScraper$l(ctx) {
    const headers2 = {
      Referer: zoeBase,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    };
    let url;
    let movieId;
    if (ctx.media.type === "movie") {
      const slug = createSlug(ctx.media.title);
      url = `${zoeBase}/film/${slug}-${ctx.media.releaseYear}`;
    } else {
      const slug = createSlug(ctx.media.title);
      url = `${zoeBase}/episode/${slug}-season-${ctx.media.season.number}-episode-${ctx.media.episode.number}`;
    }
    ctx.progress(20);
    const html = await ctx.proxiedFetcher(url, { headers: headers2 });
    const $ = cheerio.load(html);
    movieId = $("div#show_player_ajax").attr("movie-id");
    if (!movieId) {
      const altId = $("[data-movie-id]").attr("data-movie-id") || $("[movie-id]").attr("movie-id") || $(".player-wrapper").attr("data-id");
      if (altId) {
        movieId = altId;
      } else {
        throw new NotFoundError(`No content found for ${ctx.media.type === "movie" ? "movie" : "episode"}`);
      }
    }
    ctx.progress(40);
    const ajaxUrl = `${zoeBase}/wp-admin/admin-ajax.php`;
    const ajaxHeaders = {
      ...headers2,
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: url
    };
    const body = new URLSearchParams({
      action: "lazy_player",
      movieID: movieId
    });
    const ajaxHtml = await ctx.proxiedFetcher(ajaxUrl, {
      method: "POST",
      headers: ajaxHeaders,
      body: body.toString()
    });
    const $ajax = cheerio.load(ajaxHtml);
    const filemoonUrl = $ajax("ul.nav a:contains(Filemoon)").attr("data-server");
    if (!filemoonUrl) {
      const allServers = $ajax("ul.nav a").map((_, el) => ({
        name: $ajax(el).text().trim(),
        url: $ajax(el).attr("data-server")
      })).get();
      if (allServers.length === 0) {
        throw new NotFoundError("No streaming servers found");
      }
      throw new NotFoundError("Filemoon server not available");
    }
    ctx.progress(60);
    const fileUrl = await extractFileFromFilemoon(ctx, filemoonUrl);
    if (!fileUrl) {
      throw new NotFoundError("Failed to extract file URL from streaming server");
    }
    ctx.progress(90);
    return {
      stream: [
        {
          id: "primary",
          type: "hls",
          playlist: fileUrl,
          flags: [flags.CORS_ALLOWED],
          captions: []
        }
      ],
      embeds: []
    };
  }
  const zoechipScraper = makeSourcerer({
    id: "zoechip",
    name: "ZoeChip",
    rank: 171,
    disabled: false,
    flags: [],
    scrapeMovie: comboScraper$l,
    scrapeShow: comboScraper$l
  });
  const ANIMETSU_SERVERS = ["pahe", "zoro", "zaza", "meg", "bato"];
  const baseUrl$g = "https://backend.animetsu.to";
  const headers$4 = {
    referer: "https://animetsu.to/",
    origin: "https://backend.animetsu.to",
    accept: "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
  };
  function makeAnimetsuEmbed(id, rank = 100) {
    return makeEmbed({
      id: `animetsu-${id}`,
      name: `Animetsu ${id.charAt(0).toUpperCase() + id.slice(1)}`,
      rank,
      flags: [],
      async scrape(ctx) {
        var _a2;
        const serverName = id;
        const query = JSON.parse(ctx.url);
        const { type, anilistId, episode } = query;
        if (type !== "movie" && type !== "show") {
          throw new NotFoundError("Unsupported media type");
        }
        const res = await ctx.proxiedFetcher(`/api/anime/tiddies`, {
          baseUrl: baseUrl$g,
          headers: headers$4,
          query: {
            server: serverName,
            id: String(anilistId),
            num: String(episode ?? 1),
            subType: "dub"
          }
        });
        console.log("Animetsu API Response:", JSON.stringify(res, null, 2));
        const source = (_a2 = res == null ? void 0 : res.sources) == null ? void 0 : _a2[0];
        if (!(source == null ? void 0 : source.url)) throw new NotFoundError("No source URL found");
        const streamUrl = source.url;
        const sourceType = source.type;
        const sourceQuality = source.quality;
        let streamHeaders = { ...headers$4 };
        if (streamUrl.includes("animetsu.cc")) {
          const { referer: referer2, origin: origin2, ...restHeaders } = streamHeaders;
          streamHeaders = {
            ...restHeaders,
            origin: "https://backend.animetsu.cc",
            referer: "https://backend.animetsu.cc/"
          };
        }
        ctx.progress(100);
        if (sourceType === "mp4") {
          let qualityKey = "unknown";
          if (sourceQuality) {
            const qualityMatch = sourceQuality.match(/(\d+)p?/);
            if (qualityMatch) {
              qualityKey = parseInt(qualityMatch[1], 10);
            }
          }
          return {
            stream: [
              {
                id: "primary",
                captions: [],
                qualities: {
                  [qualityKey]: {
                    type: "mp4",
                    url: streamUrl
                  }
                },
                type: "file",
                headers: streamHeaders,
                flags: []
              }
            ]
          };
        }
        return {
          stream: [
            {
              id: "primary",
              type: "hls",
              playlist: streamUrl,
              headers: streamHeaders,
              flags: [],
              captions: []
            }
          ]
        };
      }
    });
  }
  const AnimetsuEmbeds = ANIMETSU_SERVERS.map((server, i2) => makeAnimetsuEmbed(server, 300 - i2));
  const providers$5 = [
    {
      id: "autoembed-english",
      rank: 10
    },
    {
      id: "autoembed-hindi",
      rank: 9,
      disabled: true
    },
    {
      id: "autoembed-tamil",
      rank: 8,
      disabled: true
    },
    {
      id: "autoembed-telugu",
      rank: 7,
      disabled: true
    },
    {
      id: "autoembed-bengali",
      rank: 6,
      disabled: true
    }
  ];
  function embed$4(provider) {
    return makeEmbed({
      id: provider.id,
      name: provider.id.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" "),
      disabled: provider.disabled,
      rank: provider.rank,
      flags: [flags.CORS_ALLOWED],
      async scrape(ctx) {
        return {
          stream: [
            {
              id: "primary",
              type: "hls",
              playlist: ctx.url,
              flags: [flags.CORS_ALLOWED],
              captions: []
            }
          ]
        };
      }
    });
  }
  const [
    autoembedEnglishScraper,
    autoembedHindiScraper,
    autoembedBengaliScraper,
    autoembedTamilScraper,
    autoembedTeluguScraper
  ] = providers$5.map(embed$4);
  const CINEMAOS_API = atob("aHR0cHM6Ly9jaW5lbWFvcy12My52ZXJjZWwuYXBwL2FwaS9uZW8vYmFja2VuZGZldGNo");
  function makeCinemaOSEmbed(server, rank) {
    return makeEmbed({
      id: `cinemaos-${server}`,
      name: `${server.charAt(0).toUpperCase() + server.slice(1)}`,
      rank,
      flags: [flags.CORS_ALLOWED],
      disabled: true,
      async scrape(ctx) {
        var _a2;
        const query = JSON.parse(ctx.url);
        const { tmdbId, type, season, episode } = query;
        let url = `${CINEMAOS_API}?requestID=${type === "show" ? "tvVideoProvider" : "movieVideoProvider"}&id=${tmdbId}&service=${server}`;
        if (type === "show") {
          url += `&season=${season}&episode=${episode}`;
        }
        const res = await ctx.proxiedFetcher(url);
        const data = typeof res === "string" ? JSON.parse(res) : res;
        const sources = (_a2 = data == null ? void 0 : data.data) == null ? void 0 : _a2.sources;
        if (!sources || !Array.isArray(sources) || sources.length === 0) {
          throw new NotFoundError("No sources found");
        }
        ctx.progress(80);
        if (sources.length === 1) {
          return {
            stream: [
              {
                id: "primary",
                type: "hls",
                playlist: sources[0].url,
                flags: [flags.CORS_ALLOWED],
                captions: []
              }
            ]
          };
        }
        const qualityMap = {};
        for (const src of sources) {
          const quality = (src.quality || src.source || "unknown").toString();
          let qualityKey;
          if (quality === "4K") {
            qualityKey = 2160;
          } else {
            qualityKey = parseInt(quality.replace("P", ""), 10);
          }
          if (Number.isNaN(qualityKey) || qualityMap[qualityKey]) continue;
          qualityMap[qualityKey] = {
            type: "mp4",
            url: src.url
          };
        }
        return {
          stream: [
            {
              id: "primary",
              type: "file",
              flags: [flags.CORS_ALLOWED],
              qualities: qualityMap,
              captions: []
            }
          ]
        };
      }
    });
  }
  const CINEMAOS_SERVERS = [
    //   'flowcast',
    "shadow",
    "asiacloud",
    //   'hindicast',
    //   'anime',
    //   'animez',
    //   'guard',
    //   'hq',
    //   'ninja',
    //   'alpha',
    //   'kaze',
    //   'zenith',
    //   'cast',
    //   'ghost',
    //   'halo',
    //   'kinoecho',
    //   'ee3',
    //   'volt',
    //   'putafilme',
    "ophim"
    //   'kage',
  ];
  const cinemaosEmbeds = CINEMAOS_SERVERS.map((server, i2) => makeCinemaOSEmbed(server, 300 - i2));
  function makeCinemaOSHexaEmbed(id, rank = 100) {
    return makeEmbed({
      id: `cinemaos-hexa-${id}`,
      name: `Hexa ${id.charAt(0).toUpperCase() + id.slice(1)}`,
      disabled: true,
      rank,
      flags: [flags.CORS_ALLOWED],
      async scrape(ctx) {
        const query = JSON.parse(ctx.url);
        const directUrl = query.directUrl;
        if (!directUrl) {
          throw new NotFoundError("No directUrl provided for Hexa embed");
        }
        const headers2 = {
          referer: "https://megacloud.store/",
          origin: "https://megacloud.store"
        };
        return {
          stream: [
            {
              id: "primary",
              type: "hls",
              playlist: createM3U8ProxyUrl(directUrl, ctx.features, headers2),
              headers: headers2,
              flags: [flags.CORS_ALLOWED],
              captions: []
            }
          ]
        };
      }
    });
  }
  const HEXA_SERVERS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india"];
  HEXA_SERVERS.map((server, i2) => makeCinemaOSHexaEmbed(server, 315 - i2));
  function customAtob(input) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    const str = input.replace(/=+$/, "");
    let output = "";
    if (str.length % 4 === 1) {
      throw new Error("The string to be decoded is not correctly encoded.");
    }
    for (let bc = 0, bs = 0, i2 = 0; i2 < str.length; i2++) {
      const buffer2 = str.charAt(i2);
      const charIndex = chars.indexOf(buffer2);
      if (charIndex === -1) continue;
      bs = bc % 4 ? bs * 64 + charIndex : charIndex;
      if (bc++ % 4) {
        output += String.fromCharCode(255 & bs >> (-2 * bc & 6));
      }
    }
    return output;
  }
  function decodeCloseload(valueParts) {
    const value = valueParts.join("");
    let result = value;
    result = atob(result);
    result = result.replace(/[a-zA-Z]/g, function rot13Transform(c) {
      const charCode = c.charCodeAt(0);
      const newCharCode = charCode + 13;
      const maxCode = c <= "Z" ? 90 : 122;
      return String.fromCharCode(newCharCode <= maxCode ? newCharCode : newCharCode - 26);
    });
    result = result.split("").reverse().join("");
    let unmix = "";
    for (let i2 = 0; i2 < result.length; i2++) {
      let charCode = result.charCodeAt(i2);
      charCode = (charCode - 399756995 % (i2 + 5) + 256) % 256;
      unmix += String.fromCharCode(charCode);
    }
    return unmix;
  }
  const referer$1 = "https://ridomovies.tv/";
  const closeLoadScraper = makeEmbed({
    id: "closeload",
    name: "CloseLoad",
    rank: 106,
    flags: [flags.IP_LOCKED],
    disabled: true,
    async scrape(ctx) {
      const baseUrl2 = new URL(ctx.url).origin;
      const iframeRes = await ctx.proxiedFetcher(ctx.url, {
        headers: { referer: referer$1 }
      });
      const iframeRes$ = cheerio.load(iframeRes);
      const captions = iframeRes$("track").map((_, el) => {
        const track = iframeRes$(el);
        const url2 = `${baseUrl2}${track.attr("src")}`;
        const label = track.attr("label") ?? "";
        const language = labelToLanguageCode(label);
        const captionType = getCaptionTypeFromUrl(url2);
        if (!language || !captionType) return null;
        return {
          id: url2,
          language,
          hasCorsRestrictions: true,
          type: captionType,
          url: url2
        };
      }).get().filter((x) => x !== null);
      const evalCode = iframeRes$("script").filter((_, el) => {
        var _a2;
        const script = iframeRes$(el);
        return (script.attr("type") === "text/javascript" && ((_a2 = script.html()) == null ? void 0 : _a2.includes("p,a,c,k,e,d"))) ?? false;
      }).html();
      if (!evalCode) throw new Error("Couldn't find eval code");
      const decoded = unpacker.unpack(evalCode);
      let base64EncodedUrl;
      const functionCallMatch = decoded.match(/dc_\w+\(\[([^\]]+)\]\)/);
      if (functionCallMatch) {
        const arrayContent = functionCallMatch[1];
        const stringMatches = arrayContent.match(/"([^"]+)"/g);
        if (stringMatches) {
          const valueParts = stringMatches.map((s) => s.slice(1, -1));
          try {
            const decodedUrl = decodeCloseload(valueParts);
            if (decodedUrl.startsWith("http://") || decodedUrl.startsWith("https://")) {
              base64EncodedUrl = decodedUrl;
            }
          } catch (error) {
          }
        }
      }
      if (!base64EncodedUrl) {
        const patterns = [/var\s+(\w+)\s*=\s*"([^"]+)";/g, /(\w+)\s*=\s*"([^"]+)"/g, /"([A-Za-z0-9+/=]+)"/g];
        for (const pattern of patterns) {
          const match = pattern.exec(decoded);
          if (match) {
            const potentialUrl = match[2] || match[1];
            if (/^[A-Za-z0-9+/]*={0,2}$/.test(potentialUrl) && potentialUrl.length > 10) {
              base64EncodedUrl = potentialUrl;
              break;
            }
          }
        }
      }
      if (!base64EncodedUrl) throw new NotFoundError("Unable to find source url");
      let url;
      if (base64EncodedUrl.startsWith("http://") || base64EncodedUrl.startsWith("https://")) {
        url = base64EncodedUrl;
      } else {
        const isValidBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(base64EncodedUrl);
        if (!isValidBase64) {
          throw new NotFoundError("Invalid base64 encoding found in source url");
        }
        let decodedString;
        try {
          decodedString = atob(base64EncodedUrl);
        } catch (error) {
          try {
            decodedString = customAtob(base64EncodedUrl);
          } catch (customError) {
            throw new NotFoundError(`Failed to decode base64 source url: ${base64EncodedUrl.substring(0, 50)}...`);
          }
        }
        const urlMatch = decodedString.match(/(https?:\/\/[^\s"']+)/);
        if (urlMatch) {
          url = urlMatch[1];
        } else if (decodedString.startsWith("http://") || decodedString.startsWith("https://")) {
          url = decodedString;
        } else {
          throw new NotFoundError(`Decoded string is not a valid URL: ${decodedString.substring(0, 100)}...`);
        }
      }
      return {
        stream: [
          {
            id: "primary",
            type: "hls",
            playlist: url,
            captions,
            flags: [flags.IP_LOCKED],
            headers: {
              Referer: "https://closeload.top/",
              Origin: "https://closeload.top"
            }
          }
        ]
      };
    }
  });
  const tracksRegex = /\{file:"([^"]+)",kind:"thumbnails"\}/g;
  function extractUrlFromPacked$1(html, patterns) {
    const $ = cheerio.load(html);
    const packedScript = $("script").filter((_, el) => {
      const htmlContent = $(el).html();
      return htmlContent != null && htmlContent.includes("eval(function(p,a,c,k,e,d)");
    }).first().html();
    if (!packedScript) throw new NotFoundError("Packed script not found");
    try {
      const unpacked = unpacker.unpack(packedScript);
      for (const pattern of patterns) {
        const match = unpacked.match(pattern);
        if (match == null ? void 0 : match[1]) {
          return match[1];
        }
      }
    } catch (error) {
      console.warn("Unpacking failed, trying fallback patterns");
    }
    throw new NotFoundError("Failed to find file URL in packed code");
  }
  function extractThumbnailTrack(html) {
    const $ = cheerio.load(html);
    const packedScript = $("script").filter((_, el) => {
      const htmlContent = $(el).html();
      return htmlContent != null && htmlContent.includes("eval(function(p,a,c,k,e,d)");
    }).first().html();
    if (!packedScript) return null;
    try {
      const unpacked = unpacker.unpack(packedScript);
      const thumbnailMatch = tracksRegex.exec(unpacked);
      return (thumbnailMatch == null ? void 0 : thumbnailMatch[1]) || null;
    } catch (error) {
      return null;
    }
  }
  const droploadScraper = makeEmbed({
    id: "dropload",
    name: "Dropload",
    rank: 120,
    flags: [flags.CORS_ALLOWED],
    scrape: async (ctx) => {
      const headers2 = {
        referer: ctx.url
      };
      const html = await ctx.proxiedFetcher(ctx.url, {
        headers: headers2
      });
      if (html.includes("File Not Found") || html.includes("Pending in queue")) {
        throw new NotFoundError();
      }
      const playlistUrl = extractUrlFromPacked$1(html, [/sources:\[{file:"(.*?)"/]);
      const mainPageUrl = new URL(ctx.url);
      const thumbnailTrack = extractThumbnailTrack(html);
      return {
        stream: [
          {
            id: "primary",
            type: "hls",
            playlist: playlistUrl,
            flags: [flags.CORS_ALLOWED],
            captions: [],
            ...thumbnailTrack && {
              thumbnailTrack: {
                type: "vtt",
                url: mainPageUrl.origin + thumbnailTrack
              }
            }
          }
        ]
      };
    }
  });
  const filelionsScraper = makeEmbed({
    id: "filelions",
    name: "Filelions",
    rank: 115,
    flags: [],
    async scrape(ctx) {
      const html = await ctx.proxiedFetcher(ctx.url, {
        headers: {
          Referer: "https://primesrc.me/"
        }
      });
      const $ = cheerio.load(html);
      const packedScript = $("script").filter((_, el) => {
        const htmlContent = $(el).html();
        return htmlContent != null && htmlContent.includes("eval(function(p,a,c,k,e,d)");
      }).first().html();
      if (!packedScript) throw new NotFoundError("Packed script not found");
      const evalMatch = packedScript.match(/eval\((.*)\)/);
      if (!evalMatch) throw new NotFoundError("Eval code not found");
      const unpacked = unpacker.unpack(evalMatch[1]);
      const linksMatch = unpacked.match(/var links=(\{.*?\})/);
      if (!linksMatch) throw new NotFoundError("Links object not found");
      const links = JSON.parse(linksMatch[1]);
      Object.keys(links).forEach((key) => {
        if (links[key].startsWith("/stream/")) {
          links[key] = `https://dinisglows.com${links[key]}`;
        }
      });
      const streamUrl = links.hls4 || Object.values(links)[0];
      if (!streamUrl) throw new NotFoundError("No stream URL found");
      return {
        stream: [
          {
            id: "primary",
            type: "hls",
            playlist: streamUrl,
            headers: {
              Referer: "https://primesrc.me/"
            },
            flags: [],
            captions: []
          }
        ]
      };
    }
  });
  const providers$4 = [
    {
      id: "mp4hydra-1",
      name: "MP4Hydra Server 1",
      rank: 36
    },
    {
      id: "mp4hydra-2",
      name: "MP4Hydra Server 2",
      rank: 35,
      disabled: true
    }
  ];
  function embed$3(provider) {
    return makeEmbed({
      id: provider.id,
      name: provider.name,
      disabled: true,
      rank: provider.rank,
      flags: [flags.CORS_ALLOWED],
      async scrape(ctx) {
        const [url, quality] = ctx.url.split("|");
        return {
          stream: [
            {
              id: "primary",
              type: "file",
              qualities: {
                [getValidQualityFromString(quality || "")]: { url, type: "mp4" }
              },
              flags: [flags.CORS_ALLOWED],
              captions: []
            }
          ]
        };
      }
    });
  }
  const [mp4hydraServer1Scraper, mp4hydraServer2Scraper] = providers$4.map(embed$3);
  const myanimedubScraper = makeEmbed({
    id: "myanimedub",
    name: "MyAnime (Dub)",
    rank: 205,
    flags: [flags.CORS_ALLOWED],
    async scrape(ctx) {
      var _a2, _b2, _c2;
      const streamData = await ctx.proxiedFetcher(
        `https://anime.aether.mom/api/stream?id=${ctx.url}&server=HD-2&type=dub`
      );
      if (!((_b2 = (_a2 = streamData.results.streamingLink) == null ? void 0 : _a2.link) == null ? void 0 : _b2.file)) {
        throw new NotFoundError("No watchable sources found");
      }
      const getValidTimestamp = (timestamp) => {
        if (!timestamp || typeof timestamp !== "object") return null;
        const start = parseInt(timestamp.start, 10);
        const end = parseInt(timestamp.end, 10);
        if (Number.isNaN(start) || Number.isNaN(end) || start <= 0 || end <= 0 || start >= end) return null;
        return { start, end };
      };
      const intro = getValidTimestamp(streamData.results.streamingLink.intro);
      const outro = getValidTimestamp(streamData.results.streamingLink.outro);
      return {
        stream: [
          {
            id: "dub",
            type: "hls",
            playlist: createM3U8ProxyUrl(streamData.results.streamingLink.link.file, ctx.features, {
              Referer: "https://rapid-cloud.co/"
            }),
            headers: {
              Referer: "https://rapid-cloud.co/"
            },
            flags: [flags.CORS_ALLOWED],
            captions: ((_c2 = streamData.results.streamingLink.tracks) == null ? void 0 : _c2.map((track) => {
              const lang = labelToLanguageCode(track.label);
              const type = getCaptionTypeFromUrl(track.file);
              if (!lang || !type) return null;
              return {
                id: track.file,
                url: track.file,
                language: lang,
                type,
                hasCorsRestrictions: true
              };
            }).filter((x) => x)) ?? [],
            intro,
            outro
          }
        ]
      };
    }
  });
  const myanimesubScraper = makeEmbed({
    id: "myanimesub",
    name: "MyAnime (Sub)",
    rank: 204,
    flags: [flags.CORS_ALLOWED],
    async scrape(ctx) {
      var _a2, _b2, _c2;
      const streamData = await ctx.proxiedFetcher(
        `https://anime.aether.mom/api/stream?id=${ctx.url}&server=HD-2&type=sub`
      );
      if (!((_b2 = (_a2 = streamData.results.streamingLink) == null ? void 0 : _a2.link) == null ? void 0 : _b2.file)) {
        throw new NotFoundError("No watchable sources found");
      }
      const getValidTimestamp = (timestamp) => {
        if (!timestamp || typeof timestamp !== "object") return null;
        const start = parseInt(timestamp.start, 10);
        const end = parseInt(timestamp.end, 10);
        if (Number.isNaN(start) || Number.isNaN(end) || start <= 0 || end <= 0 || start >= end) return null;
        return { start, end };
      };
      const intro = getValidTimestamp(streamData.results.streamingLink.intro);
      const outro = getValidTimestamp(streamData.results.streamingLink.outro);
      return {
        stream: [
          {
            id: "sub",
            type: "hls",
            playlist: createM3U8ProxyUrl(streamData.results.streamingLink.link.file, ctx.features, {
              Referer: "https://rapid-cloud.co/"
            }),
            headers: {
              Referer: "https://rapid-cloud.co/"
            },
            flags: [flags.CORS_ALLOWED],
            captions: ((_c2 = streamData.results.streamingLink.tracks) == null ? void 0 : _c2.map((track) => {
              const lang = labelToLanguageCode(track.label);
              const type = getCaptionTypeFromUrl(track.file);
              if (!lang || !type) return null;
              return {
                id: track.file,
                url: track.file,
                language: lang,
                type,
                hasCorsRestrictions: true
              };
            }).filter((x) => x)) ?? [],
            intro,
            outro
          }
        ]
      };
    }
  });
  const referer = "https://ridomovies.tv/";
  const playlistHeaders = {
    referer: "https://ridoo.net/",
    origin: "https://ridoo.net"
  };
  const ridooScraper = makeEmbed({
    id: "ridoo",
    name: "Ridoo",
    rank: 121,
    flags: [flags.CORS_ALLOWED],
    async scrape(ctx) {
      var _a2;
      const res = await ctx.proxiedFetcher(ctx.url, {
        headers: {
          referer
        }
      });
      const regexPattern = /file:"([^"]+)"/g;
      const url = (_a2 = regexPattern.exec(res)) == null ? void 0 : _a2[1];
      if (!url) throw new NotFoundError("Unable to find source url");
      return {
        stream: [
          {
            id: "primary",
            type: "hls",
            playlist: url,
            headers: playlistHeaders,
            captions: [],
            flags: [flags.CORS_ALLOWED]
          }
        ]
      };
    }
  });
  const providers$3 = [
    {
      id: "streamtape",
      name: "Streamtape",
      rank: 160
    },
    {
      id: "streamtape-latino",
      name: "Streamtape (Latino)",
      rank: 159
    }
  ];
  function embed$2(provider) {
    return makeEmbed({
      id: provider.id,
      name: provider.name,
      rank: provider.rank,
      flags: [flags.CORS_ALLOWED],
      // No longer IP locked
      async scrape(ctx) {
        var _a2;
        const embedHtml = await ctx.proxiedFetcher(ctx.url);
        const match = embedHtml.match(/robotlink'\).innerHTML = (.*)'/);
        if (!match) throw new Error("No match found");
        const [fh, sh] = ((_a2 = match == null ? void 0 : match[1]) == null ? void 0 : _a2.split("+ ('")) ?? [];
        if (!fh || !sh) throw new Error("No match found");
        const url = `https:${fh == null ? void 0 : fh.replace(/'/g, "").trim()}${sh == null ? void 0 : sh.substring(3).trim()}`;
        return {
          stream: [
            {
              id: "primary",
              type: "file",
              flags: [flags.CORS_ALLOWED],
              // No longer IP locked
              captions: [],
              qualities: {
                unknown: {
                  type: "mp4",
                  url
                }
              },
              preferredHeaders: {
                Referer: "https://streamtape.com"
              }
            }
          ]
        };
      }
    });
  }
  const [streamtapeScraper, streamtapeLatinoScraper] = providers$3.map(embed$2);
  const packedRegex = /(eval\(function\(p,a,c,k,e,d\).*\)\)\))/;
  const linkRegex = /src:"(https:\/\/[^"]+)"/;
  const streamvidScraper = makeEmbed({
    id: "streamvid",
    name: "Streamvid",
    rank: 215,
    flags: [flags.CORS_ALLOWED],
    async scrape(ctx) {
      const streamRes = await ctx.proxiedFetcher(ctx.url);
      const packed = streamRes.match(packedRegex);
      if (!packed) throw new Error("streamvid packed not found");
      const unpacked = unpacker__namespace.unpack(packed[1]);
      const link = unpacked.match(linkRegex);
      if (!link) throw new Error("streamvid link not found");
      return {
        stream: [
          {
            type: "hls",
            id: "primary",
            playlist: link[1],
            flags: [flags.CORS_ALLOWED],
            captions: []
          }
        ]
      };
    }
  });
  let Unbaser$1 = class Unbaser {
    constructor(base) {
      this.ALPHABET = {
        62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
        95: "' !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'"
      };
      this.dictionary = {};
      this.base = base;
      if (base > 36 && base < 62) {
        this.ALPHABET[base] = this.ALPHABET[base] || this.ALPHABET[62].substring(0, base);
      }
      if (base >= 2 && base <= 36) {
        this.unbase = (value) => parseInt(value, base);
      } else {
        try {
          [...this.ALPHABET[base]].forEach((cipher, index) => {
            this.dictionary[cipher] = index;
          });
        } catch {
          throw new Error("Unsupported base encoding.");
        }
        this.unbase = this._dictunbaser.bind(this);
      }
    }
    _dictunbaser(value) {
      let ret = 0;
      [...value].reverse().forEach((cipher, index) => {
        ret += this.base ** index * this.dictionary[cipher];
      });
      return ret;
    }
  };
  function _filterargs$1(code2) {
    const juicers = [
      /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\), *(\d+), *(.*)\)\)/,
      /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\)/
    ];
    for (const juicer of juicers) {
      const args = juicer.exec(code2);
      if (args) {
        try {
          return {
            payload: args[1],
            symtab: args[4].split("|"),
            radix: parseInt(args[2], 10),
            count: parseInt(args[3], 10)
          };
        } catch {
          throw new Error("Corrupted p.a.c.k.e.r. data.");
        }
      }
    }
    throw new Error("Could not make sense of p.a.c.k.e.r data (unexpected code structure)");
  }
  function _replacestrings(str) {
    return str;
  }
  function unpack$1(packedCode) {
    const { payload, symtab, radix, count } = _filterargs$1(packedCode);
    if (count !== symtab.length) {
      throw new Error("Malformed p.a.c.k.e.r. symtab.");
    }
    let unbase;
    try {
      unbase = new Unbaser$1(radix);
    } catch {
      throw new Error("Unknown p.a.c.k.e.r. encoding.");
    }
    const lookup2 = (match) => {
      const word = match;
      const word2 = radix === 1 ? symtab[parseInt(word, 10)] : symtab[unbase.unbase(word)];
      return word2 || word;
    };
    const replaced = payload.replace(/\b\w+\b/g, lookup2);
    return _replacestrings(replaced);
  }
  const providers$2 = [
    {
      id: "streamwish-japanese",
      name: "StreamWish (Japanese Sub Español)",
      rank: 171
    },
    {
      id: "streamwish-latino",
      name: "streamwish (latino)",
      rank: 170
    },
    {
      id: "streamwish-spanish",
      name: "streamwish (castellano)",
      rank: 169
    },
    {
      id: "streamwish-english",
      name: "streamwish (english)",
      rank: 168
    }
  ];
  function embed$1(provider) {
    return makeEmbed({
      id: provider.id,
      name: provider.name,
      rank: provider.rank,
      flags: [flags.CORS_ALLOWED],
      disabled: provider.disabled,
      async scrape(ctx) {
        const headers2 = {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Encoding": "*",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
        };
        const domains = [
          "hgplaycdn.com",
          "habetar.com",
          "yuguaab.com",
          "guxhag.com",
          "auvexiug.com",
          "xenolyzb.com"
        ];
        const urlPath = ctx.url.replace(/https?:\/\/[^/]+/, "");
        ctx.url = `https://${domains[Math.floor(Math.random() * domains.length)]}${urlPath}`;
        let html;
        try {
          html = await ctx.proxiedFetcher(ctx.url, { headers: headers2 });
        } catch (error) {
          console.error(`Error:`, {
            message: error instanceof Error ? error.message : "Unknown error",
            cause: error.cause || void 0,
            url: ctx.url
          });
          throw error;
        }
        const obfuscatedScript = html.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
        if (!obfuscatedScript) {
          return { stream: [], embeds: [{ embedId: provider.id, url: ctx.url }] };
        }
        let unpackedScript;
        try {
          unpackedScript = unpack$1(obfuscatedScript[1]);
        } catch {
          return { stream: [], embeds: [{ embedId: provider.id, url: ctx.url }] };
        }
        const hls2Match = unpackedScript.match(/"hls2"\s*:\s*"([^"]+)"/);
        if (!hls2Match) {
          return { stream: [], embeds: [{ embedId: provider.id, url: ctx.url }] };
        }
        let videoUrl = hls2Match[1];
        if (!/^https?:\/\//.test(videoUrl)) {
          videoUrl = `https://swiftplayers.com/${videoUrl.replace(/^\/+/, "")}`;
        }
        const videoHeaders = {
          Referer: ctx.url,
          Origin: ctx.url
        };
        return {
          stream: [
            {
              id: "primary",
              type: "hls",
              playlist: createM3U8ProxyUrl(videoUrl, ctx.features, videoHeaders),
              headers: videoHeaders,
              flags: [flags.CORS_ALLOWED],
              captions: []
            }
          ],
          embeds: []
        };
      }
    });
  }
  const [streamwishLatinoScraper, streamwishSpanishScraper, streamwishEnglishScraper, streamwishJapaneseScraper] = providers$2.map(embed$1);
  function extractUrlFromPacked(html, patterns) {
    const $ = cheerio.load(html);
    const packedScript = $("script").filter((_, el) => {
      const htmlContent = $(el).html();
      return htmlContent != null && htmlContent.includes("eval(function(p,a,c,k,e,d)");
    }).first().html();
    if (!packedScript) throw new NotFoundError("Packed script not found");
    try {
      const unpacked = unpacker.unpack(packedScript);
      for (const pattern of patterns) {
        const match = unpacked.match(pattern);
        if (match == null ? void 0 : match[1]) {
          return match[1];
        }
      }
    } catch (error) {
      console.warn("Unpacking failed, trying fallback patterns");
    }
    throw new NotFoundError("Failed to find file URL in packed code");
  }
  const supervideoScraper = makeEmbed({
    id: "supervideo",
    name: "SuperVideo",
    rank: 130,
    flags: [flags.CORS_ALLOWED],
    scrape: async (ctx) => {
      let url = ctx.url;
      url = url.replace("/e/", "/").replace("/k/", "/").replace("/embed-", "/");
      const headers2 = {
        referer: ctx.url
      };
      let html = await ctx.proxiedFetcher(url, {
        headers: headers2
      });
      if (html.includes("This video can be watched as embed only")) {
        const embedUrl = url.replace(/\/([^/]*)$/, "/e$1");
        html = await ctx.proxiedFetcher(embedUrl, {
          headers: { ...headers2, referer: embedUrl }
        });
      }
      if (/The file was deleted|The file expired|Video is processing/.test(html)) {
        throw new NotFoundError();
      }
      const m3u8Url = extractUrlFromPacked(html, [/sources:\[{file:"(.*?)"/]);
      return {
        stream: [
          {
            id: "primary",
            type: "hls",
            playlist: m3u8Url,
            flags: [flags.CORS_ALLOWED],
            captions: []
          }
        ]
      };
    }
  });
  const vidCloudScraper = makeEmbed({
    id: "vidcloud",
    name: "VidCloud",
    rank: 201,
    disabled: true,
    flags: [],
    async scrape(ctx) {
      const result = await upcloudScraper.scrape(ctx);
      return {
        stream: result.stream.map((s) => ({
          ...s,
          flags: []
        }))
      };
    }
  });
  class Unbaser {
    constructor(base) {
      this.ALPHABET = {
        62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
        95: " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~"
      };
      this.dictionary = {};
      this.base = base;
      if (base > 36 && base < 62) {
        this.ALPHABET[base] = this.ALPHABET[base] || this.ALPHABET[62].substring(0, base);
      }
      if (base >= 2 && base <= 36) {
        this.unbase = (value) => parseInt(value, base);
      } else {
        try {
          [...this.ALPHABET[base]].forEach((cipher, index) => {
            this.dictionary[cipher] = index;
          });
        } catch {
          throw new Error("Unsupported base encoding.");
        }
        this.unbase = this._dictunbaser.bind(this);
      }
    }
    _dictunbaser(value) {
      let ret = 0;
      [...value].reverse().forEach((cipher, index) => {
        ret += this.base ** index * this.dictionary[cipher];
      });
      return ret;
    }
  }
  function _filterargs(code2) {
    const juicers = [/}\s*\('(.*)',\s*(\d+|\[\]),\s*(\d+),\s*'(.*)'\.split\('\|'\)/];
    for (const juicer of juicers) {
      const args = juicer.exec(code2);
      if (args) {
        try {
          return {
            payload: args[1],
            radix: parseInt(args[2], 10),
            count: parseInt(args[3], 10),
            symtab: args[4].split("|")
          };
        } catch {
          throw new Error("Corrupted p.a.c.k.e.r. data.");
        }
      }
    }
    throw new Error("Could not make sense of p.a.c.k.e.r data (unexpected code structure)");
  }
  function unpack(packedCode) {
    const { payload, symtab, radix, count } = _filterargs(packedCode);
    if (count !== symtab.length) throw new Error("Malformed p.a.c.k.e.r. symtab.");
    let unbase;
    try {
      unbase = new Unbaser(radix);
    } catch {
      throw new Error("Unknown p.a.c.k.e.r. encoding.");
    }
    const lookup2 = (match) => {
      const word = match;
      const word2 = radix === 1 ? symtab[parseInt(word, 10)] : symtab[unbase.unbase(word)];
      return word2 || word;
    };
    return payload.replace(/\b\w+\b/g, lookup2);
  }
  const VIDHIDE_DOMAINS = ["https://vidhidepro.com", "https://vidhidefast.com", "https://dinisglows.com"];
  function buildOfficialUrl(originalUrl, officialDomain) {
    try {
      const u = new URL(originalUrl);
      return `${officialDomain}${u.pathname}${u.search}${u.hash}`;
    } catch {
      return originalUrl;
    }
  }
  async function fetchWithOfficialDomains(ctx, headers2) {
    for (const domain of VIDHIDE_DOMAINS) {
      const testUrl = buildOfficialUrl(ctx.url, domain);
      try {
        const html = await ctx.proxiedFetcher(testUrl, { headers: headers2 });
        if (html && html.includes("eval(function(p,a,c,k,e,d")) {
          return { html, usedUrl: testUrl };
        }
        if (html) {
          return { html, usedUrl: testUrl };
        }
      } catch (err) {
      }
    }
    throw new Error("Could not get valid HTML from any official domain");
  }
  const providers$1 = [
    {
      id: "vidhide-latino",
      name: "VidHide (Latino)",
      rank: 13
    },
    {
      id: "vidhide-spanish",
      name: "VidHide (Castellano)",
      rank: 14
    },
    {
      id: "vidhide-english",
      name: "VidHide (English)",
      rank: 15
    }
  ];
  function extractSubtitles(unpackedScript) {
    const subtitleRegex = /{file:"([^"]+)",label:"([^"]+)"}/g;
    const results = [];
    const matches = unpackedScript.matchAll(subtitleRegex);
    for (const match of matches) {
      results.push({ file: match[1], label: match[2] });
    }
    return results;
  }
  function makeVidhideScraper(provider) {
    return makeEmbed({
      id: provider.id,
      name: provider.name,
      rank: provider.rank,
      flags: [flags.IP_LOCKED],
      async scrape(ctx) {
        const headers2 = {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Encoding": "*",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "Mozilla/5.0"
        };
        const { html, usedUrl } = await fetchWithOfficialDomains(ctx, headers2);
        const obfuscatedScript = html.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
        if (!obfuscatedScript) {
          return { stream: [], embeds: [{ embedId: provider.id, url: ctx.url }] };
        }
        let unpackedScript;
        try {
          unpackedScript = unpack(obfuscatedScript[1]);
        } catch (e) {
          return { stream: [], embeds: [{ embedId: provider.id, url: ctx.url }] };
        }
        const m3u8Links = Array.from(unpackedScript.matchAll(/"(http[^"]*?\.m3u8[^"]*?)"/g)).map((m) => m[1]);
        const masterUrl = m3u8Links.find((url) => url.includes("master.m3u8"));
        if (!masterUrl) {
          return { stream: [], embeds: [{ embedId: provider.id, url: ctx.url }] };
        }
        let videoUrl = masterUrl;
        const subtitles = extractSubtitles(unpackedScript);
        try {
          const m3u8Content = await ctx.proxiedFetcher(videoUrl, {
            headers: { Referer: ctx.url }
          });
          const variants = Array.from(
            m3u8Content.matchAll(/#EXT-X-STREAM-INF:[^\n]+\n(?!iframe)([^\n]*master\.m3u8[^\n]*)/gi)
          );
          if (variants.length > 0) {
            const best = variants[0];
            const base = videoUrl.substring(0, videoUrl.lastIndexOf("/") + 1);
            videoUrl = base + best[1];
          }
        } catch (e) {
        }
        const directHeaders = {
          Referer: usedUrl,
          Origin: new URL(usedUrl).origin
        };
        return {
          stream: [
            {
              id: "primary",
              type: "hls",
              playlist: videoUrl,
              headers: directHeaders,
              flags: [flags.IP_LOCKED],
              captions: subtitles.map((s, idx) => {
                var _a2;
                const ext = (_a2 = s.file.split(".").pop()) == null ? void 0 : _a2.toLowerCase();
                const type = ext === "srt" ? "srt" : "vtt";
                return {
                  type,
                  id: `caption-${idx}`,
                  url: s.file,
                  hasCorsRestrictions: false,
                  language: s.label || "unknown"
                };
              })
            }
          ]
        };
      }
    });
  }
  const [vidhideLatinoScraper, vidhideSpanishScraper, vidhideEnglishScraper] = providers$1.map(makeVidhideScraper);
  const VIDIFY_SERVERS$1 = ["alfa", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliett"];
  const baseUrl$f = "api.vidify.top";
  const playerUrl = "https://player.vidify.top/";
  let cachedAuthHeader = null;
  let lastFetched = 0;
  async function getAuthHeader(ctx) {
    const now = Date.now();
    if (cachedAuthHeader && now - lastFetched < 1e3 * 60 * 60) {
      return cachedAuthHeader;
    }
    const playerPage = await ctx.proxiedFetcher(playerUrl, {
      headers: {
        Referer: playerUrl
      }
    });
    const jsFileRegex = /\/assets\/index-([a-zA-Z0-9-]+)\.js/;
    const jsFileMatch = playerPage.match(jsFileRegex);
    if (!jsFileMatch) {
      throw new Error("Could not find the JS file URL in the player page");
    }
    const jsFileUrl = new URL(jsFileMatch[0], playerUrl).href;
    const jsContent = await ctx.proxiedFetcher(jsFileUrl, {
      headers: {
        Referer: playerUrl
      }
    });
    const authRegex = /Authorization:"Bearer\s*([^"]+)"/;
    const authMatch = jsContent.match(authRegex);
    if (!authMatch || !authMatch[1]) {
      throw new Error("Could not extract the authorization header from the JS file");
    }
    cachedAuthHeader = `Bearer ${authMatch[1]}`;
    lastFetched = now;
    return cachedAuthHeader;
  }
  function makeVidifyEmbed(id, rank = 100) {
    const serverIndex = VIDIFY_SERVERS$1.indexOf(id) + 1;
    return makeEmbed({
      id: `vidify-${id}`,
      name: `${id.charAt(0).toUpperCase() + id.slice(1)}`,
      rank,
      disabled: true,
      flags: [],
      async scrape(ctx) {
        const query = JSON.parse(ctx.url);
        const { type, tmdbId, season, episode } = query;
        let url = `https://${baseUrl$f}/`;
        if (type === "movie") {
          url += `/movie/${tmdbId}?sr=${serverIndex}`;
        } else if (type === "show") {
          url += `/tv/${tmdbId}/season/${season}/episode/${episode}?sr=${serverIndex}`;
        } else {
          throw new NotFoundError("Unsupported media type");
        }
        const authHeader = await getAuthHeader(ctx);
        const headers2 = {
          referer: "https://player.vidify.top/",
          origin: "https://player.vidify.top",
          Authorization: authHeader,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        };
        const res = await ctx.proxiedFetcher(url, { headers: headers2 });
        console.log(res);
        const playlistUrl = res.m3u8 ?? res.url;
        if (Array.isArray(res.result) && res.result.length > 0) {
          const qualities = {};
          res.result.forEach((r) => {
            if (r.url.includes(".mp4")) {
              qualities[`${r.resolution}p`] = { type: "mp4", url: decodeURIComponent(r.url) };
            }
          });
          if (Object.keys(qualities).length === 0) {
            throw new NotFoundError("No MP4 streams found");
          }
          console.log(`Found MP4 streams: `, qualities);
          return {
            stream: [
              {
                id: "primary",
                type: "file",
                qualities,
                flags: [],
                captions: [],
                headers: {
                  Host: "proxy-worker.himanshu464121.workers.dev"
                  // seems to be their only mp4 proxy
                }
              }
            ]
          };
        }
        if (!playlistUrl) throw new NotFoundError("No playlist URL found");
        const streamHeaders = { ...headers2 };
        let playlist;
        if (playlistUrl.includes("proxyv1.vidify.top")) {
          console.log(`Found stream (proxyv1): `, playlistUrl, streamHeaders);
          streamHeaders.Host = "proxyv1.vidify.top";
          playlist = decodeURIComponent(playlistUrl);
        } else if (playlistUrl.includes("proxyv2.vidify.top")) {
          console.log(`Found stream (proxyv2): `, playlistUrl, streamHeaders);
          streamHeaders.Host = "proxyv2.vidify.top";
          playlist = decodeURIComponent(playlistUrl);
        } else {
          console.log(`Found normal stream: `, playlistUrl);
          playlist = createM3U8ProxyUrl(decodeURIComponent(playlistUrl), ctx.features, streamHeaders);
        }
        ctx.progress(100);
        return {
          stream: [
            {
              id: "primary",
              type: "hls",
              playlist,
              headers: streamHeaders,
              flags: [],
              captions: []
            }
          ]
        };
      }
    });
  }
  const vidifyEmbeds = VIDIFY_SERVERS$1.map((server, i2) => makeVidifyEmbed(server, 230 - i2));
  var buffer = {};
  var base64Js = {};
  base64Js.byteLength = byteLength;
  base64Js.toByteArray = toByteArray;
  base64Js.fromByteArray = fromByteArray;
  var lookup = [];
  var revLookup = [];
  var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
  var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (var i = 0, len = code.length; i < len; ++i) {
    lookup[i] = code[i];
    revLookup[code.charCodeAt(i)] = i;
  }
  revLookup["-".charCodeAt(0)] = 62;
  revLookup["_".charCodeAt(0)] = 63;
  function getLens(b64) {
    var len2 = b64.length;
    if (len2 % 4 > 0) {
      throw new Error("Invalid string. Length must be a multiple of 4");
    }
    var validLen = b64.indexOf("=");
    if (validLen === -1) validLen = len2;
    var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
    return [validLen, placeHoldersLen];
  }
  function byteLength(b64) {
    var lens = getLens(b64);
    var validLen = lens[0];
    var placeHoldersLen = lens[1];
    return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
  }
  function _byteLength(b64, validLen, placeHoldersLen) {
    return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
  }
  function toByteArray(b64) {
    var tmp;
    var lens = getLens(b64);
    var validLen = lens[0];
    var placeHoldersLen = lens[1];
    var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
    var curByte = 0;
    var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
    var i2;
    for (i2 = 0; i2 < len2; i2 += 4) {
      tmp = revLookup[b64.charCodeAt(i2)] << 18 | revLookup[b64.charCodeAt(i2 + 1)] << 12 | revLookup[b64.charCodeAt(i2 + 2)] << 6 | revLookup[b64.charCodeAt(i2 + 3)];
      arr[curByte++] = tmp >> 16 & 255;
      arr[curByte++] = tmp >> 8 & 255;
      arr[curByte++] = tmp & 255;
    }
    if (placeHoldersLen === 2) {
      tmp = revLookup[b64.charCodeAt(i2)] << 2 | revLookup[b64.charCodeAt(i2 + 1)] >> 4;
      arr[curByte++] = tmp & 255;
    }
    if (placeHoldersLen === 1) {
      tmp = revLookup[b64.charCodeAt(i2)] << 10 | revLookup[b64.charCodeAt(i2 + 1)] << 4 | revLookup[b64.charCodeAt(i2 + 2)] >> 2;
      arr[curByte++] = tmp >> 8 & 255;
      arr[curByte++] = tmp & 255;
    }
    return arr;
  }
  function tripletToBase64(num) {
    return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
  }
  function encodeChunk(uint8, start, end) {
    var tmp;
    var output = [];
    for (var i2 = start; i2 < end; i2 += 3) {
      tmp = (uint8[i2] << 16 & 16711680) + (uint8[i2 + 1] << 8 & 65280) + (uint8[i2 + 2] & 255);
      output.push(tripletToBase64(tmp));
    }
    return output.join("");
  }
  function fromByteArray(uint8) {
    var tmp;
    var len2 = uint8.length;
    var extraBytes = len2 % 3;
    var parts = [];
    var maxChunkLength = 16383;
    for (var i2 = 0, len22 = len2 - extraBytes; i2 < len22; i2 += maxChunkLength) {
      parts.push(encodeChunk(uint8, i2, i2 + maxChunkLength > len22 ? len22 : i2 + maxChunkLength));
    }
    if (extraBytes === 1) {
      tmp = uint8[len2 - 1];
      parts.push(
        lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
      );
    } else if (extraBytes === 2) {
      tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
      parts.push(
        lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
      );
    }
    return parts.join("");
  }
  var ieee754 = {};
  /*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */
  ieee754.read = function(buffer2, offset, isLE2, mLen, nBytes) {
    var e, m;
    var eLen = nBytes * 8 - mLen - 1;
    var eMax = (1 << eLen) - 1;
    var eBias = eMax >> 1;
    var nBits = -7;
    var i2 = isLE2 ? nBytes - 1 : 0;
    var d = isLE2 ? -1 : 1;
    var s = buffer2[offset + i2];
    i2 += d;
    e = s & (1 << -nBits) - 1;
    s >>= -nBits;
    nBits += eLen;
    for (; nBits > 0; e = e * 256 + buffer2[offset + i2], i2 += d, nBits -= 8) {
    }
    m = e & (1 << -nBits) - 1;
    e >>= -nBits;
    nBits += mLen;
    for (; nBits > 0; m = m * 256 + buffer2[offset + i2], i2 += d, nBits -= 8) {
    }
    if (e === 0) {
      e = 1 - eBias;
    } else if (e === eMax) {
      return m ? NaN : (s ? -1 : 1) * Infinity;
    } else {
      m = m + Math.pow(2, mLen);
      e = e - eBias;
    }
    return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
  };
  ieee754.write = function(buffer2, value, offset, isLE2, mLen, nBytes) {
    var e, m, c;
    var eLen = nBytes * 8 - mLen - 1;
    var eMax = (1 << eLen) - 1;
    var eBias = eMax >> 1;
    var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
    var i2 = isLE2 ? 0 : nBytes - 1;
    var d = isLE2 ? 1 : -1;
    var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
    value = Math.abs(value);
    if (isNaN(value) || value === Infinity) {
      m = isNaN(value) ? 1 : 0;
      e = eMax;
    } else {
      e = Math.floor(Math.log(value) / Math.LN2);
      if (value * (c = Math.pow(2, -e)) < 1) {
        e--;
        c *= 2;
      }
      if (e + eBias >= 1) {
        value += rt / c;
      } else {
        value += rt * Math.pow(2, 1 - eBias);
      }
      if (value * c >= 2) {
        e++;
        c /= 2;
      }
      if (e + eBias >= eMax) {
        m = 0;
        e = eMax;
      } else if (e + eBias >= 1) {
        m = (value * c - 1) * Math.pow(2, mLen);
        e = e + eBias;
      } else {
        m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
        e = 0;
      }
    }
    for (; mLen >= 8; buffer2[offset + i2] = m & 255, i2 += d, m /= 256, mLen -= 8) {
    }
    e = e << mLen | m;
    eLen += mLen;
    for (; eLen > 0; buffer2[offset + i2] = e & 255, i2 += d, e /= 256, eLen -= 8) {
    }
    buffer2[offset + i2 - d] |= s * 128;
  };
  /*!
   * The buffer module from node.js, for the browser.
   *
   * @author   Feross Aboukhadijeh <https://feross.org>
   * @license  MIT
   */
  (function(exports$1) {
    var base64 = base64Js;
    var ieee754$1 = ieee754;
    var customInspectSymbol = typeof Symbol === "function" && typeof Symbol["for"] === "function" ? Symbol["for"]("nodejs.util.inspect.custom") : null;
    exports$1.Buffer = Buffer2;
    exports$1.SlowBuffer = SlowBuffer;
    exports$1.INSPECT_MAX_BYTES = 50;
    var K_MAX_LENGTH = 2147483647;
    exports$1.kMaxLength = K_MAX_LENGTH;
    Buffer2.TYPED_ARRAY_SUPPORT = typedArraySupport();
    if (!Buffer2.TYPED_ARRAY_SUPPORT && typeof console !== "undefined" && typeof console.error === "function") {
      console.error(
        "This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support."
      );
    }
    function typedArraySupport() {
      try {
        var arr = new Uint8Array(1);
        var proto = { foo: function() {
          return 42;
        } };
        Object.setPrototypeOf(proto, Uint8Array.prototype);
        Object.setPrototypeOf(arr, proto);
        return arr.foo() === 42;
      } catch (e) {
        return false;
      }
    }
    Object.defineProperty(Buffer2.prototype, "parent", {
      enumerable: true,
      get: function() {
        if (!Buffer2.isBuffer(this)) return void 0;
        return this.buffer;
      }
    });
    Object.defineProperty(Buffer2.prototype, "offset", {
      enumerable: true,
      get: function() {
        if (!Buffer2.isBuffer(this)) return void 0;
        return this.byteOffset;
      }
    });
    function createBuffer(length) {
      if (length > K_MAX_LENGTH) {
        throw new RangeError('The value "' + length + '" is invalid for option "size"');
      }
      var buf = new Uint8Array(length);
      Object.setPrototypeOf(buf, Buffer2.prototype);
      return buf;
    }
    function Buffer2(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        if (typeof encodingOrOffset === "string") {
          throw new TypeError(
            'The "string" argument must be of type string. Received type number'
          );
        }
        return allocUnsafe(arg);
      }
      return from(arg, encodingOrOffset, length);
    }
    Buffer2.poolSize = 8192;
    function from(value, encodingOrOffset, length) {
      if (typeof value === "string") {
        return fromString(value, encodingOrOffset);
      }
      if (ArrayBuffer.isView(value)) {
        return fromArrayView(value);
      }
      if (value == null) {
        throw new TypeError(
          "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
        );
      }
      if (isInstance(value, ArrayBuffer) || value && isInstance(value.buffer, ArrayBuffer)) {
        return fromArrayBuffer(value, encodingOrOffset, length);
      }
      if (typeof SharedArrayBuffer !== "undefined" && (isInstance(value, SharedArrayBuffer) || value && isInstance(value.buffer, SharedArrayBuffer))) {
        return fromArrayBuffer(value, encodingOrOffset, length);
      }
      if (typeof value === "number") {
        throw new TypeError(
          'The "value" argument must not be of type number. Received type number'
        );
      }
      var valueOf = value.valueOf && value.valueOf();
      if (valueOf != null && valueOf !== value) {
        return Buffer2.from(valueOf, encodingOrOffset, length);
      }
      var b = fromObject(value);
      if (b) return b;
      if (typeof Symbol !== "undefined" && Symbol.toPrimitive != null && typeof value[Symbol.toPrimitive] === "function") {
        return Buffer2.from(
          value[Symbol.toPrimitive]("string"),
          encodingOrOffset,
          length
        );
      }
      throw new TypeError(
        "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
      );
    }
    Buffer2.from = function(value, encodingOrOffset, length) {
      return from(value, encodingOrOffset, length);
    };
    Object.setPrototypeOf(Buffer2.prototype, Uint8Array.prototype);
    Object.setPrototypeOf(Buffer2, Uint8Array);
    function assertSize(size) {
      if (typeof size !== "number") {
        throw new TypeError('"size" argument must be of type number');
      } else if (size < 0) {
        throw new RangeError('The value "' + size + '" is invalid for option "size"');
      }
    }
    function alloc(size, fill, encoding) {
      assertSize(size);
      if (size <= 0) {
        return createBuffer(size);
      }
      if (fill !== void 0) {
        return typeof encoding === "string" ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill);
      }
      return createBuffer(size);
    }
    Buffer2.alloc = function(size, fill, encoding) {
      return alloc(size, fill, encoding);
    };
    function allocUnsafe(size) {
      assertSize(size);
      return createBuffer(size < 0 ? 0 : checked(size) | 0);
    }
    Buffer2.allocUnsafe = function(size) {
      return allocUnsafe(size);
    };
    Buffer2.allocUnsafeSlow = function(size) {
      return allocUnsafe(size);
    };
    function fromString(string, encoding) {
      if (typeof encoding !== "string" || encoding === "") {
        encoding = "utf8";
      }
      if (!Buffer2.isEncoding(encoding)) {
        throw new TypeError("Unknown encoding: " + encoding);
      }
      var length = byteLength2(string, encoding) | 0;
      var buf = createBuffer(length);
      var actual = buf.write(string, encoding);
      if (actual !== length) {
        buf = buf.slice(0, actual);
      }
      return buf;
    }
    function fromArrayLike(array) {
      var length = array.length < 0 ? 0 : checked(array.length) | 0;
      var buf = createBuffer(length);
      for (var i2 = 0; i2 < length; i2 += 1) {
        buf[i2] = array[i2] & 255;
      }
      return buf;
    }
    function fromArrayView(arrayView) {
      if (isInstance(arrayView, Uint8Array)) {
        var copy = new Uint8Array(arrayView);
        return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength);
      }
      return fromArrayLike(arrayView);
    }
    function fromArrayBuffer(array, byteOffset, length) {
      if (byteOffset < 0 || array.byteLength < byteOffset) {
        throw new RangeError('"offset" is outside of buffer bounds');
      }
      if (array.byteLength < byteOffset + (length || 0)) {
        throw new RangeError('"length" is outside of buffer bounds');
      }
      var buf;
      if (byteOffset === void 0 && length === void 0) {
        buf = new Uint8Array(array);
      } else if (length === void 0) {
        buf = new Uint8Array(array, byteOffset);
      } else {
        buf = new Uint8Array(array, byteOffset, length);
      }
      Object.setPrototypeOf(buf, Buffer2.prototype);
      return buf;
    }
    function fromObject(obj) {
      if (Buffer2.isBuffer(obj)) {
        var len2 = checked(obj.length) | 0;
        var buf = createBuffer(len2);
        if (buf.length === 0) {
          return buf;
        }
        obj.copy(buf, 0, 0, len2);
        return buf;
      }
      if (obj.length !== void 0) {
        if (typeof obj.length !== "number" || numberIsNaN(obj.length)) {
          return createBuffer(0);
        }
        return fromArrayLike(obj);
      }
      if (obj.type === "Buffer" && Array.isArray(obj.data)) {
        return fromArrayLike(obj.data);
      }
    }
    function checked(length) {
      if (length >= K_MAX_LENGTH) {
        throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + K_MAX_LENGTH.toString(16) + " bytes");
      }
      return length | 0;
    }
    function SlowBuffer(length) {
      if (+length != length) {
        length = 0;
      }
      return Buffer2.alloc(+length);
    }
    Buffer2.isBuffer = function isBuffer(b) {
      return b != null && b._isBuffer === true && b !== Buffer2.prototype;
    };
    Buffer2.compare = function compare(a, b) {
      if (isInstance(a, Uint8Array)) a = Buffer2.from(a, a.offset, a.byteLength);
      if (isInstance(b, Uint8Array)) b = Buffer2.from(b, b.offset, b.byteLength);
      if (!Buffer2.isBuffer(a) || !Buffer2.isBuffer(b)) {
        throw new TypeError(
          'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
        );
      }
      if (a === b) return 0;
      var x = a.length;
      var y = b.length;
      for (var i2 = 0, len2 = Math.min(x, y); i2 < len2; ++i2) {
        if (a[i2] !== b[i2]) {
          x = a[i2];
          y = b[i2];
          break;
        }
      }
      if (x < y) return -1;
      if (y < x) return 1;
      return 0;
    };
    Buffer2.isEncoding = function isEncoding(encoding) {
      switch (String(encoding).toLowerCase()) {
        case "hex":
        case "utf8":
        case "utf-8":
        case "ascii":
        case "latin1":
        case "binary":
        case "base64":
        case "ucs2":
        case "ucs-2":
        case "utf16le":
        case "utf-16le":
          return true;
        default:
          return false;
      }
    };
    Buffer2.concat = function concat(list, length) {
      if (!Array.isArray(list)) {
        throw new TypeError('"list" argument must be an Array of Buffers');
      }
      if (list.length === 0) {
        return Buffer2.alloc(0);
      }
      var i2;
      if (length === void 0) {
        length = 0;
        for (i2 = 0; i2 < list.length; ++i2) {
          length += list[i2].length;
        }
      }
      var buffer2 = Buffer2.allocUnsafe(length);
      var pos = 0;
      for (i2 = 0; i2 < list.length; ++i2) {
        var buf = list[i2];
        if (isInstance(buf, Uint8Array)) {
          if (pos + buf.length > buffer2.length) {
            Buffer2.from(buf).copy(buffer2, pos);
          } else {
            Uint8Array.prototype.set.call(
              buffer2,
              buf,
              pos
            );
          }
        } else if (!Buffer2.isBuffer(buf)) {
          throw new TypeError('"list" argument must be an Array of Buffers');
        } else {
          buf.copy(buffer2, pos);
        }
        pos += buf.length;
      }
      return buffer2;
    };
    function byteLength2(string, encoding) {
      if (Buffer2.isBuffer(string)) {
        return string.length;
      }
      if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
        return string.byteLength;
      }
      if (typeof string !== "string") {
        throw new TypeError(
          'The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' + typeof string
        );
      }
      var len2 = string.length;
      var mustMatch = arguments.length > 2 && arguments[2] === true;
      if (!mustMatch && len2 === 0) return 0;
      var loweredCase = false;
      for (; ; ) {
        switch (encoding) {
          case "ascii":
          case "latin1":
          case "binary":
            return len2;
          case "utf8":
          case "utf-8":
            return utf8ToBytes(string).length;
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return len2 * 2;
          case "hex":
            return len2 >>> 1;
          case "base64":
            return base64ToBytes(string).length;
          default:
            if (loweredCase) {
              return mustMatch ? -1 : utf8ToBytes(string).length;
            }
            encoding = ("" + encoding).toLowerCase();
            loweredCase = true;
        }
      }
    }
    Buffer2.byteLength = byteLength2;
    function slowToString(encoding, start, end) {
      var loweredCase = false;
      if (start === void 0 || start < 0) {
        start = 0;
      }
      if (start > this.length) {
        return "";
      }
      if (end === void 0 || end > this.length) {
        end = this.length;
      }
      if (end <= 0) {
        return "";
      }
      end >>>= 0;
      start >>>= 0;
      if (end <= start) {
        return "";
      }
      if (!encoding) encoding = "utf8";
      while (true) {
        switch (encoding) {
          case "hex":
            return hexSlice(this, start, end);
          case "utf8":
          case "utf-8":
            return utf8Slice(this, start, end);
          case "ascii":
            return asciiSlice(this, start, end);
          case "latin1":
          case "binary":
            return latin1Slice(this, start, end);
          case "base64":
            return base64Slice(this, start, end);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return utf16leSlice(this, start, end);
          default:
            if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
            encoding = (encoding + "").toLowerCase();
            loweredCase = true;
        }
      }
    }
    Buffer2.prototype._isBuffer = true;
    function swap(b, n, m) {
      var i2 = b[n];
      b[n] = b[m];
      b[m] = i2;
    }
    Buffer2.prototype.swap16 = function swap16() {
      var len2 = this.length;
      if (len2 % 2 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 16-bits");
      }
      for (var i2 = 0; i2 < len2; i2 += 2) {
        swap(this, i2, i2 + 1);
      }
      return this;
    };
    Buffer2.prototype.swap32 = function swap32() {
      var len2 = this.length;
      if (len2 % 4 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 32-bits");
      }
      for (var i2 = 0; i2 < len2; i2 += 4) {
        swap(this, i2, i2 + 3);
        swap(this, i2 + 1, i2 + 2);
      }
      return this;
    };
    Buffer2.prototype.swap64 = function swap64() {
      var len2 = this.length;
      if (len2 % 8 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 64-bits");
      }
      for (var i2 = 0; i2 < len2; i2 += 8) {
        swap(this, i2, i2 + 7);
        swap(this, i2 + 1, i2 + 6);
        swap(this, i2 + 2, i2 + 5);
        swap(this, i2 + 3, i2 + 4);
      }
      return this;
    };
    Buffer2.prototype.toString = function toString() {
      var length = this.length;
      if (length === 0) return "";
      if (arguments.length === 0) return utf8Slice(this, 0, length);
      return slowToString.apply(this, arguments);
    };
    Buffer2.prototype.toLocaleString = Buffer2.prototype.toString;
    Buffer2.prototype.equals = function equals(b) {
      if (!Buffer2.isBuffer(b)) throw new TypeError("Argument must be a Buffer");
      if (this === b) return true;
      return Buffer2.compare(this, b) === 0;
    };
    Buffer2.prototype.inspect = function inspect() {
      var str = "";
      var max = exports$1.INSPECT_MAX_BYTES;
      str = this.toString("hex", 0, max).replace(/(.{2})/g, "$1 ").trim();
      if (this.length > max) str += " ... ";
      return "<Buffer " + str + ">";
    };
    if (customInspectSymbol) {
      Buffer2.prototype[customInspectSymbol] = Buffer2.prototype.inspect;
    }
    Buffer2.prototype.compare = function compare(target, start, end, thisStart, thisEnd) {
      if (isInstance(target, Uint8Array)) {
        target = Buffer2.from(target, target.offset, target.byteLength);
      }
      if (!Buffer2.isBuffer(target)) {
        throw new TypeError(
          'The "target" argument must be one of type Buffer or Uint8Array. Received type ' + typeof target
        );
      }
      if (start === void 0) {
        start = 0;
      }
      if (end === void 0) {
        end = target ? target.length : 0;
      }
      if (thisStart === void 0) {
        thisStart = 0;
      }
      if (thisEnd === void 0) {
        thisEnd = this.length;
      }
      if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
        throw new RangeError("out of range index");
      }
      if (thisStart >= thisEnd && start >= end) {
        return 0;
      }
      if (thisStart >= thisEnd) {
        return -1;
      }
      if (start >= end) {
        return 1;
      }
      start >>>= 0;
      end >>>= 0;
      thisStart >>>= 0;
      thisEnd >>>= 0;
      if (this === target) return 0;
      var x = thisEnd - thisStart;
      var y = end - start;
      var len2 = Math.min(x, y);
      var thisCopy = this.slice(thisStart, thisEnd);
      var targetCopy = target.slice(start, end);
      for (var i2 = 0; i2 < len2; ++i2) {
        if (thisCopy[i2] !== targetCopy[i2]) {
          x = thisCopy[i2];
          y = targetCopy[i2];
          break;
        }
      }
      if (x < y) return -1;
      if (y < x) return 1;
      return 0;
    };
    function bidirectionalIndexOf(buffer2, val, byteOffset, encoding, dir) {
      if (buffer2.length === 0) return -1;
      if (typeof byteOffset === "string") {
        encoding = byteOffset;
        byteOffset = 0;
      } else if (byteOffset > 2147483647) {
        byteOffset = 2147483647;
      } else if (byteOffset < -2147483648) {
        byteOffset = -2147483648;
      }
      byteOffset = +byteOffset;
      if (numberIsNaN(byteOffset)) {
        byteOffset = dir ? 0 : buffer2.length - 1;
      }
      if (byteOffset < 0) byteOffset = buffer2.length + byteOffset;
      if (byteOffset >= buffer2.length) {
        if (dir) return -1;
        else byteOffset = buffer2.length - 1;
      } else if (byteOffset < 0) {
        if (dir) byteOffset = 0;
        else return -1;
      }
      if (typeof val === "string") {
        val = Buffer2.from(val, encoding);
      }
      if (Buffer2.isBuffer(val)) {
        if (val.length === 0) {
          return -1;
        }
        return arrayIndexOf(buffer2, val, byteOffset, encoding, dir);
      } else if (typeof val === "number") {
        val = val & 255;
        if (typeof Uint8Array.prototype.indexOf === "function") {
          if (dir) {
            return Uint8Array.prototype.indexOf.call(buffer2, val, byteOffset);
          } else {
            return Uint8Array.prototype.lastIndexOf.call(buffer2, val, byteOffset);
          }
        }
        return arrayIndexOf(buffer2, [val], byteOffset, encoding, dir);
      }
      throw new TypeError("val must be string, number or Buffer");
    }
    function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
      var indexSize = 1;
      var arrLength = arr.length;
      var valLength = val.length;
      if (encoding !== void 0) {
        encoding = String(encoding).toLowerCase();
        if (encoding === "ucs2" || encoding === "ucs-2" || encoding === "utf16le" || encoding === "utf-16le") {
          if (arr.length < 2 || val.length < 2) {
            return -1;
          }
          indexSize = 2;
          arrLength /= 2;
          valLength /= 2;
          byteOffset /= 2;
        }
      }
      function read(buf, i3) {
        if (indexSize === 1) {
          return buf[i3];
        } else {
          return buf.readUInt16BE(i3 * indexSize);
        }
      }
      var i2;
      if (dir) {
        var foundIndex = -1;
        for (i2 = byteOffset; i2 < arrLength; i2++) {
          if (read(arr, i2) === read(val, foundIndex === -1 ? 0 : i2 - foundIndex)) {
            if (foundIndex === -1) foundIndex = i2;
            if (i2 - foundIndex + 1 === valLength) return foundIndex * indexSize;
          } else {
            if (foundIndex !== -1) i2 -= i2 - foundIndex;
            foundIndex = -1;
          }
        }
      } else {
        if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
        for (i2 = byteOffset; i2 >= 0; i2--) {
          var found = true;
          for (var j = 0; j < valLength; j++) {
            if (read(arr, i2 + j) !== read(val, j)) {
              found = false;
              break;
            }
          }
          if (found) return i2;
        }
      }
      return -1;
    }
    Buffer2.prototype.includes = function includes(val, byteOffset, encoding) {
      return this.indexOf(val, byteOffset, encoding) !== -1;
    };
    Buffer2.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
      return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
    };
    Buffer2.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
      return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
    };
    function hexWrite(buf, string, offset, length) {
      offset = Number(offset) || 0;
      var remaining = buf.length - offset;
      if (!length) {
        length = remaining;
      } else {
        length = Number(length);
        if (length > remaining) {
          length = remaining;
        }
      }
      var strLen = string.length;
      if (length > strLen / 2) {
        length = strLen / 2;
      }
      for (var i2 = 0; i2 < length; ++i2) {
        var parsed = parseInt(string.substr(i2 * 2, 2), 16);
        if (numberIsNaN(parsed)) return i2;
        buf[offset + i2] = parsed;
      }
      return i2;
    }
    function utf8Write(buf, string, offset, length) {
      return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length);
    }
    function asciiWrite(buf, string, offset, length) {
      return blitBuffer(asciiToBytes(string), buf, offset, length);
    }
    function base64Write(buf, string, offset, length) {
      return blitBuffer(base64ToBytes(string), buf, offset, length);
    }
    function ucs2Write(buf, string, offset, length) {
      return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
    }
    Buffer2.prototype.write = function write(string, offset, length, encoding) {
      if (offset === void 0) {
        encoding = "utf8";
        length = this.length;
        offset = 0;
      } else if (length === void 0 && typeof offset === "string") {
        encoding = offset;
        length = this.length;
        offset = 0;
      } else if (isFinite(offset)) {
        offset = offset >>> 0;
        if (isFinite(length)) {
          length = length >>> 0;
          if (encoding === void 0) encoding = "utf8";
        } else {
          encoding = length;
          length = void 0;
        }
      } else {
        throw new Error(
          "Buffer.write(string, encoding, offset[, length]) is no longer supported"
        );
      }
      var remaining = this.length - offset;
      if (length === void 0 || length > remaining) length = remaining;
      if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
        throw new RangeError("Attempt to write outside buffer bounds");
      }
      if (!encoding) encoding = "utf8";
      var loweredCase = false;
      for (; ; ) {
        switch (encoding) {
          case "hex":
            return hexWrite(this, string, offset, length);
          case "utf8":
          case "utf-8":
            return utf8Write(this, string, offset, length);
          case "ascii":
          case "latin1":
          case "binary":
            return asciiWrite(this, string, offset, length);
          case "base64":
            return base64Write(this, string, offset, length);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return ucs2Write(this, string, offset, length);
          default:
            if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
            encoding = ("" + encoding).toLowerCase();
            loweredCase = true;
        }
      }
    };
    Buffer2.prototype.toJSON = function toJSON() {
      return {
        type: "Buffer",
        data: Array.prototype.slice.call(this._arr || this, 0)
      };
    };
    function base64Slice(buf, start, end) {
      if (start === 0 && end === buf.length) {
        return base64.fromByteArray(buf);
      } else {
        return base64.fromByteArray(buf.slice(start, end));
      }
    }
    function utf8Slice(buf, start, end) {
      end = Math.min(buf.length, end);
      var res = [];
      var i2 = start;
      while (i2 < end) {
        var firstByte = buf[i2];
        var codePoint = null;
        var bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
        if (i2 + bytesPerSequence <= end) {
          var secondByte, thirdByte, fourthByte, tempCodePoint;
          switch (bytesPerSequence) {
            case 1:
              if (firstByte < 128) {
                codePoint = firstByte;
              }
              break;
            case 2:
              secondByte = buf[i2 + 1];
              if ((secondByte & 192) === 128) {
                tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
                if (tempCodePoint > 127) {
                  codePoint = tempCodePoint;
                }
              }
              break;
            case 3:
              secondByte = buf[i2 + 1];
              thirdByte = buf[i2 + 2];
              if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
                tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
                if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
                  codePoint = tempCodePoint;
                }
              }
              break;
            case 4:
              secondByte = buf[i2 + 1];
              thirdByte = buf[i2 + 2];
              fourthByte = buf[i2 + 3];
              if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
                tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
                if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
                  codePoint = tempCodePoint;
                }
              }
          }
        }
        if (codePoint === null) {
          codePoint = 65533;
          bytesPerSequence = 1;
        } else if (codePoint > 65535) {
          codePoint -= 65536;
          res.push(codePoint >>> 10 & 1023 | 55296);
          codePoint = 56320 | codePoint & 1023;
        }
        res.push(codePoint);
        i2 += bytesPerSequence;
      }
      return decodeCodePointsArray(res);
    }
    var MAX_ARGUMENTS_LENGTH = 4096;
    function decodeCodePointsArray(codePoints) {
      var len2 = codePoints.length;
      if (len2 <= MAX_ARGUMENTS_LENGTH) {
        return String.fromCharCode.apply(String, codePoints);
      }
      var res = "";
      var i2 = 0;
      while (i2 < len2) {
        res += String.fromCharCode.apply(
          String,
          codePoints.slice(i2, i2 += MAX_ARGUMENTS_LENGTH)
        );
      }
      return res;
    }
    function asciiSlice(buf, start, end) {
      var ret = "";
      end = Math.min(buf.length, end);
      for (var i2 = start; i2 < end; ++i2) {
        ret += String.fromCharCode(buf[i2] & 127);
      }
      return ret;
    }
    function latin1Slice(buf, start, end) {
      var ret = "";
      end = Math.min(buf.length, end);
      for (var i2 = start; i2 < end; ++i2) {
        ret += String.fromCharCode(buf[i2]);
      }
      return ret;
    }
    function hexSlice(buf, start, end) {
      var len2 = buf.length;
      if (!start || start < 0) start = 0;
      if (!end || end < 0 || end > len2) end = len2;
      var out = "";
      for (var i2 = start; i2 < end; ++i2) {
        out += hexSliceLookupTable[buf[i2]];
      }
      return out;
    }
    function utf16leSlice(buf, start, end) {
      var bytes = buf.slice(start, end);
      var res = "";
      for (var i2 = 0; i2 < bytes.length - 1; i2 += 2) {
        res += String.fromCharCode(bytes[i2] + bytes[i2 + 1] * 256);
      }
      return res;
    }
    Buffer2.prototype.slice = function slice(start, end) {
      var len2 = this.length;
      start = ~~start;
      end = end === void 0 ? len2 : ~~end;
      if (start < 0) {
        start += len2;
        if (start < 0) start = 0;
      } else if (start > len2) {
        start = len2;
      }
      if (end < 0) {
        end += len2;
        if (end < 0) end = 0;
      } else if (end > len2) {
        end = len2;
      }
      if (end < start) end = start;
      var newBuf = this.subarray(start, end);
      Object.setPrototypeOf(newBuf, Buffer2.prototype);
      return newBuf;
    };
    function checkOffset(offset, ext, length) {
      if (offset % 1 !== 0 || offset < 0) throw new RangeError("offset is not uint");
      if (offset + ext > length) throw new RangeError("Trying to access beyond buffer length");
    }
    Buffer2.prototype.readUintLE = Buffer2.prototype.readUIntLE = function readUIntLE(offset, byteLength3, noAssert) {
      offset = offset >>> 0;
      byteLength3 = byteLength3 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength3, this.length);
      var val = this[offset];
      var mul3 = 1;
      var i2 = 0;
      while (++i2 < byteLength3 && (mul3 *= 256)) {
        val += this[offset + i2] * mul3;
      }
      return val;
    };
    Buffer2.prototype.readUintBE = Buffer2.prototype.readUIntBE = function readUIntBE(offset, byteLength3, noAssert) {
      offset = offset >>> 0;
      byteLength3 = byteLength3 >>> 0;
      if (!noAssert) {
        checkOffset(offset, byteLength3, this.length);
      }
      var val = this[offset + --byteLength3];
      var mul3 = 1;
      while (byteLength3 > 0 && (mul3 *= 256)) {
        val += this[offset + --byteLength3] * mul3;
      }
      return val;
    };
    Buffer2.prototype.readUint8 = Buffer2.prototype.readUInt8 = function readUInt8(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 1, this.length);
      return this[offset];
    };
    Buffer2.prototype.readUint16LE = Buffer2.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      return this[offset] | this[offset + 1] << 8;
    };
    Buffer2.prototype.readUint16BE = Buffer2.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      return this[offset] << 8 | this[offset + 1];
    };
    Buffer2.prototype.readUint32LE = Buffer2.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 16777216;
    };
    Buffer2.prototype.readUint32BE = Buffer2.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
    };
    Buffer2.prototype.readIntLE = function readIntLE(offset, byteLength3, noAssert) {
      offset = offset >>> 0;
      byteLength3 = byteLength3 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength3, this.length);
      var val = this[offset];
      var mul3 = 1;
      var i2 = 0;
      while (++i2 < byteLength3 && (mul3 *= 256)) {
        val += this[offset + i2] * mul3;
      }
      mul3 *= 128;
      if (val >= mul3) val -= Math.pow(2, 8 * byteLength3);
      return val;
    };
    Buffer2.prototype.readIntBE = function readIntBE(offset, byteLength3, noAssert) {
      offset = offset >>> 0;
      byteLength3 = byteLength3 >>> 0;
      if (!noAssert) checkOffset(offset, byteLength3, this.length);
      var i2 = byteLength3;
      var mul3 = 1;
      var val = this[offset + --i2];
      while (i2 > 0 && (mul3 *= 256)) {
        val += this[offset + --i2] * mul3;
      }
      mul3 *= 128;
      if (val >= mul3) val -= Math.pow(2, 8 * byteLength3);
      return val;
    };
    Buffer2.prototype.readInt8 = function readInt8(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 1, this.length);
      if (!(this[offset] & 128)) return this[offset];
      return (255 - this[offset] + 1) * -1;
    };
    Buffer2.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      var val = this[offset] | this[offset + 1] << 8;
      return val & 32768 ? val | 4294901760 : val;
    };
    Buffer2.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 2, this.length);
      var val = this[offset + 1] | this[offset] << 8;
      return val & 32768 ? val | 4294901760 : val;
    };
    Buffer2.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
    };
    Buffer2.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
    };
    Buffer2.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return ieee754$1.read(this, offset, true, 23, 4);
    };
    Buffer2.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 4, this.length);
      return ieee754$1.read(this, offset, false, 23, 4);
    };
    Buffer2.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 8, this.length);
      return ieee754$1.read(this, offset, true, 52, 8);
    };
    Buffer2.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
      offset = offset >>> 0;
      if (!noAssert) checkOffset(offset, 8, this.length);
      return ieee754$1.read(this, offset, false, 52, 8);
    };
    function checkInt(buf, value, offset, ext, max, min) {
      if (!Buffer2.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance');
      if (value > max || value < min) throw new RangeError('"value" argument is out of bounds');
      if (offset + ext > buf.length) throw new RangeError("Index out of range");
    }
    Buffer2.prototype.writeUintLE = Buffer2.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength3, noAssert) {
      value = +value;
      offset = offset >>> 0;
      byteLength3 = byteLength3 >>> 0;
      if (!noAssert) {
        var maxBytes = Math.pow(2, 8 * byteLength3) - 1;
        checkInt(this, value, offset, byteLength3, maxBytes, 0);
      }
      var mul3 = 1;
      var i2 = 0;
      this[offset] = value & 255;
      while (++i2 < byteLength3 && (mul3 *= 256)) {
        this[offset + i2] = value / mul3 & 255;
      }
      return offset + byteLength3;
    };
    Buffer2.prototype.writeUintBE = Buffer2.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength3, noAssert) {
      value = +value;
      offset = offset >>> 0;
      byteLength3 = byteLength3 >>> 0;
      if (!noAssert) {
        var maxBytes = Math.pow(2, 8 * byteLength3) - 1;
        checkInt(this, value, offset, byteLength3, maxBytes, 0);
      }
      var i2 = byteLength3 - 1;
      var mul3 = 1;
      this[offset + i2] = value & 255;
      while (--i2 >= 0 && (mul3 *= 256)) {
        this[offset + i2] = value / mul3 & 255;
      }
      return offset + byteLength3;
    };
    Buffer2.prototype.writeUint8 = Buffer2.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 1, 255, 0);
      this[offset] = value & 255;
      return offset + 1;
    };
    Buffer2.prototype.writeUint16LE = Buffer2.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      return offset + 2;
    };
    Buffer2.prototype.writeUint16BE = Buffer2.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
      this[offset] = value >>> 8;
      this[offset + 1] = value & 255;
      return offset + 2;
    };
    Buffer2.prototype.writeUint32LE = Buffer2.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
      this[offset + 3] = value >>> 24;
      this[offset + 2] = value >>> 16;
      this[offset + 1] = value >>> 8;
      this[offset] = value & 255;
      return offset + 4;
    };
    Buffer2.prototype.writeUint32BE = Buffer2.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
      this[offset] = value >>> 24;
      this[offset + 1] = value >>> 16;
      this[offset + 2] = value >>> 8;
      this[offset + 3] = value & 255;
      return offset + 4;
    };
    Buffer2.prototype.writeIntLE = function writeIntLE(value, offset, byteLength3, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        var limit = Math.pow(2, 8 * byteLength3 - 1);
        checkInt(this, value, offset, byteLength3, limit - 1, -limit);
      }
      var i2 = 0;
      var mul3 = 1;
      var sub = 0;
      this[offset] = value & 255;
      while (++i2 < byteLength3 && (mul3 *= 256)) {
        if (value < 0 && sub === 0 && this[offset + i2 - 1] !== 0) {
          sub = 1;
        }
        this[offset + i2] = (value / mul3 >> 0) - sub & 255;
      }
      return offset + byteLength3;
    };
    Buffer2.prototype.writeIntBE = function writeIntBE(value, offset, byteLength3, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        var limit = Math.pow(2, 8 * byteLength3 - 1);
        checkInt(this, value, offset, byteLength3, limit - 1, -limit);
      }
      var i2 = byteLength3 - 1;
      var mul3 = 1;
      var sub = 0;
      this[offset + i2] = value & 255;
      while (--i2 >= 0 && (mul3 *= 256)) {
        if (value < 0 && sub === 0 && this[offset + i2 + 1] !== 0) {
          sub = 1;
        }
        this[offset + i2] = (value / mul3 >> 0) - sub & 255;
      }
      return offset + byteLength3;
    };
    Buffer2.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 1, 127, -128);
      if (value < 0) value = 255 + value + 1;
      this[offset] = value & 255;
      return offset + 1;
    };
    Buffer2.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      return offset + 2;
    };
    Buffer2.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
      this[offset] = value >>> 8;
      this[offset + 1] = value & 255;
      return offset + 2;
    };
    Buffer2.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
      this[offset] = value & 255;
      this[offset + 1] = value >>> 8;
      this[offset + 2] = value >>> 16;
      this[offset + 3] = value >>> 24;
      return offset + 4;
    };
    Buffer2.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
      if (value < 0) value = 4294967295 + value + 1;
      this[offset] = value >>> 24;
      this[offset + 1] = value >>> 16;
      this[offset + 2] = value >>> 8;
      this[offset + 3] = value & 255;
      return offset + 4;
    };
    function checkIEEE754(buf, value, offset, ext, max, min) {
      if (offset + ext > buf.length) throw new RangeError("Index out of range");
      if (offset < 0) throw new RangeError("Index out of range");
    }
    function writeFloat(buf, value, offset, littleEndian, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        checkIEEE754(buf, value, offset, 4);
      }
      ieee754$1.write(buf, value, offset, littleEndian, 23, 4);
      return offset + 4;
    }
    Buffer2.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
      return writeFloat(this, value, offset, true, noAssert);
    };
    Buffer2.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
      return writeFloat(this, value, offset, false, noAssert);
    };
    function writeDouble(buf, value, offset, littleEndian, noAssert) {
      value = +value;
      offset = offset >>> 0;
      if (!noAssert) {
        checkIEEE754(buf, value, offset, 8);
      }
      ieee754$1.write(buf, value, offset, littleEndian, 52, 8);
      return offset + 8;
    }
    Buffer2.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
      return writeDouble(this, value, offset, true, noAssert);
    };
    Buffer2.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
      return writeDouble(this, value, offset, false, noAssert);
    };
    Buffer2.prototype.copy = function copy(target, targetStart, start, end) {
      if (!Buffer2.isBuffer(target)) throw new TypeError("argument should be a Buffer");
      if (!start) start = 0;
      if (!end && end !== 0) end = this.length;
      if (targetStart >= target.length) targetStart = target.length;
      if (!targetStart) targetStart = 0;
      if (end > 0 && end < start) end = start;
      if (end === start) return 0;
      if (target.length === 0 || this.length === 0) return 0;
      if (targetStart < 0) {
        throw new RangeError("targetStart out of bounds");
      }
      if (start < 0 || start >= this.length) throw new RangeError("Index out of range");
      if (end < 0) throw new RangeError("sourceEnd out of bounds");
      if (end > this.length) end = this.length;
      if (target.length - targetStart < end - start) {
        end = target.length - targetStart + start;
      }
      var len2 = end - start;
      if (this === target && typeof Uint8Array.prototype.copyWithin === "function") {
        this.copyWithin(targetStart, start, end);
      } else {
        Uint8Array.prototype.set.call(
          target,
          this.subarray(start, end),
          targetStart
        );
      }
      return len2;
    };
    Buffer2.prototype.fill = function fill(val, start, end, encoding) {
      if (typeof val === "string") {
        if (typeof start === "string") {
          encoding = start;
          start = 0;
          end = this.length;
        } else if (typeof end === "string") {
          encoding = end;
          end = this.length;
        }
        if (encoding !== void 0 && typeof encoding !== "string") {
          throw new TypeError("encoding must be a string");
        }
        if (typeof encoding === "string" && !Buffer2.isEncoding(encoding)) {
          throw new TypeError("Unknown encoding: " + encoding);
        }
        if (val.length === 1) {
          var code2 = val.charCodeAt(0);
          if (encoding === "utf8" && code2 < 128 || encoding === "latin1") {
            val = code2;
          }
        }
      } else if (typeof val === "number") {
        val = val & 255;
      } else if (typeof val === "boolean") {
        val = Number(val);
      }
      if (start < 0 || this.length < start || this.length < end) {
        throw new RangeError("Out of range index");
      }
      if (end <= start) {
        return this;
      }
      start = start >>> 0;
      end = end === void 0 ? this.length : end >>> 0;
      if (!val) val = 0;
      var i2;
      if (typeof val === "number") {
        for (i2 = start; i2 < end; ++i2) {
          this[i2] = val;
        }
      } else {
        var bytes = Buffer2.isBuffer(val) ? val : Buffer2.from(val, encoding);
        var len2 = bytes.length;
        if (len2 === 0) {
          throw new TypeError('The value "' + val + '" is invalid for argument "value"');
        }
        for (i2 = 0; i2 < end - start; ++i2) {
          this[i2 + start] = bytes[i2 % len2];
        }
      }
      return this;
    };
    var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;
    function base64clean(str) {
      str = str.split("=")[0];
      str = str.trim().replace(INVALID_BASE64_RE, "");
      if (str.length < 2) return "";
      while (str.length % 4 !== 0) {
        str = str + "=";
      }
      return str;
    }
    function utf8ToBytes(string, units) {
      units = units || Infinity;
      var codePoint;
      var length = string.length;
      var leadSurrogate = null;
      var bytes = [];
      for (var i2 = 0; i2 < length; ++i2) {
        codePoint = string.charCodeAt(i2);
        if (codePoint > 55295 && codePoint < 57344) {
          if (!leadSurrogate) {
            if (codePoint > 56319) {
              if ((units -= 3) > -1) bytes.push(239, 191, 189);
              continue;
            } else if (i2 + 1 === length) {
              if ((units -= 3) > -1) bytes.push(239, 191, 189);
              continue;
            }
            leadSurrogate = codePoint;
            continue;
          }
          if (codePoint < 56320) {
            if ((units -= 3) > -1) bytes.push(239, 191, 189);
            leadSurrogate = codePoint;
            continue;
          }
          codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536;
        } else if (leadSurrogate) {
          if ((units -= 3) > -1) bytes.push(239, 191, 189);
        }
        leadSurrogate = null;
        if (codePoint < 128) {
          if ((units -= 1) < 0) break;
          bytes.push(codePoint);
        } else if (codePoint < 2048) {
          if ((units -= 2) < 0) break;
          bytes.push(
            codePoint >> 6 | 192,
            codePoint & 63 | 128
          );
        } else if (codePoint < 65536) {
          if ((units -= 3) < 0) break;
          bytes.push(
            codePoint >> 12 | 224,
            codePoint >> 6 & 63 | 128,
            codePoint & 63 | 128
          );
        } else if (codePoint < 1114112) {
          if ((units -= 4) < 0) break;
          bytes.push(
            codePoint >> 18 | 240,
            codePoint >> 12 & 63 | 128,
            codePoint >> 6 & 63 | 128,
            codePoint & 63 | 128
          );
        } else {
          throw new Error("Invalid code point");
        }
      }
      return bytes;
    }
    function asciiToBytes(str) {
      var byteArray = [];
      for (var i2 = 0; i2 < str.length; ++i2) {
        byteArray.push(str.charCodeAt(i2) & 255);
      }
      return byteArray;
    }
    function utf16leToBytes(str, units) {
      var c, hi, lo;
      var byteArray = [];
      for (var i2 = 0; i2 < str.length; ++i2) {
        if ((units -= 2) < 0) break;
        c = str.charCodeAt(i2);
        hi = c >> 8;
        lo = c % 256;
        byteArray.push(lo);
        byteArray.push(hi);
      }
      return byteArray;
    }
    function base64ToBytes(str) {
      return base64.toByteArray(base64clean(str));
    }
    function blitBuffer(src, dst, offset, length) {
      for (var i2 = 0; i2 < length; ++i2) {
        if (i2 + offset >= dst.length || i2 >= src.length) break;
        dst[i2 + offset] = src[i2];
      }
      return i2;
    }
    function isInstance(obj, type) {
      return obj instanceof type || obj != null && obj.constructor != null && obj.constructor.name != null && obj.constructor.name === type.name;
    }
    function numberIsNaN(obj) {
      return obj !== obj;
    }
    var hexSliceLookupTable = function() {
      var alphabet = "0123456789abcdef";
      var table = new Array(256);
      for (var i2 = 0; i2 < 16; ++i2) {
        var i16 = i2 * 16;
        for (var j = 0; j < 16; ++j) {
          table[i16 + j] = alphabet[i2] + alphabet[j];
        }
      }
      return table;
    }();
  })(buffer);
  /*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) */
  function isBytes(a) {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
  }
  function abytes(value, length, title = "") {
    const bytes = isBytes(value);
    const len2 = value == null ? void 0 : value.length;
    const needsLen = length !== void 0;
    if (!bytes || needsLen && len2 !== length) {
      const prefix = title && `"${title}" `;
      const ofLen = needsLen ? ` of length ${length}` : "";
      const got = bytes ? `length=${len2}` : `type=${typeof value}`;
      throw new Error(prefix + "expected Uint8Array" + ofLen + ", got " + got);
    }
    return value;
  }
  function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
      throw new Error("Hash instance has been destroyed");
    if (checkFinished && instance.finished)
      throw new Error("Hash#digest() has already been called");
  }
  function aoutput(out, instance) {
    abytes(out, void 0, "output");
    const min = instance.outputLen;
    if (out.length < min) {
      throw new Error("digestInto() expects output buffer of length at least " + min);
    }
  }
  function u8(arr) {
    return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  function u32(arr) {
    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
  }
  function clean(...arrays) {
    for (let i2 = 0; i2 < arrays.length; i2++) {
      arrays[i2].fill(0);
    }
  }
  function createView(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  const isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
  function equalBytes(a, b) {
    if (a.length !== b.length)
      return false;
    let diff = 0;
    for (let i2 = 0; i2 < a.length; i2++)
      diff |= a[i2] ^ b[i2];
    return diff === 0;
  }
  const wrapCipher = /* @__NO_SIDE_EFFECTS__ */ (params, constructor) => {
    function wrappedCipher(key, ...args) {
      abytes(key, void 0, "key");
      if (!isLE)
        throw new Error("Non little-endian hardware is not yet supported");
      if (params.nonceLength !== void 0) {
        const nonce = args[0];
        abytes(nonce, params.varSizeNonce ? void 0 : params.nonceLength, "nonce");
      }
      const tagl = params.tagLength;
      if (tagl && args[1] !== void 0)
        abytes(args[1], void 0, "AAD");
      const cipher = constructor(key, ...args);
      const checkOutput = (fnLength, output) => {
        if (output !== void 0) {
          if (fnLength !== 2)
            throw new Error("cipher output not supported");
          abytes(output, void 0, "output");
        }
      };
      let called = false;
      const wrCipher = {
        encrypt(data, output) {
          if (called)
            throw new Error("cannot encrypt() twice with same key + nonce");
          called = true;
          abytes(data);
          checkOutput(cipher.encrypt.length, output);
          return cipher.encrypt(data, output);
        },
        decrypt(data, output) {
          abytes(data);
          if (tagl && data.length < tagl)
            throw new Error('"ciphertext" expected length bigger than tagLength=' + tagl);
          checkOutput(cipher.decrypt.length, output);
          return cipher.decrypt(data, output);
        }
      };
      return wrCipher;
    }
    Object.assign(wrappedCipher, params);
    return wrappedCipher;
  };
  function getOutput(expectedLength, out, onlyAligned = true) {
    if (out === void 0)
      return new Uint8Array(expectedLength);
    if (out.length !== expectedLength)
      throw new Error('"output" expected Uint8Array of length ' + expectedLength + ", got: " + out.length);
    if (onlyAligned && !isAligned32(out))
      throw new Error("invalid output, must be aligned");
    return out;
  }
  function u64Lengths(dataLength, aadLength, isLE2) {
    const num = new Uint8Array(16);
    const view = createView(num);
    view.setBigUint64(0, BigInt(aadLength), isLE2);
    view.setBigUint64(8, BigInt(dataLength), isLE2);
    return num;
  }
  function isAligned32(bytes) {
    return bytes.byteOffset % 4 === 0;
  }
  function copyBytes(bytes) {
    return Uint8Array.from(bytes);
  }
  const BLOCK_SIZE$1 = 16;
  const ZEROS16 = /* @__PURE__ */ new Uint8Array(16);
  const ZEROS32 = u32(ZEROS16);
  const POLY$1 = 225;
  const mul2$1 = (s0, s1, s2, s3) => {
    const hiBit = s3 & 1;
    return {
      s3: s2 << 31 | s3 >>> 1,
      s2: s1 << 31 | s2 >>> 1,
      s1: s0 << 31 | s1 >>> 1,
      s0: s0 >>> 1 ^ POLY$1 << 24 & -(hiBit & 1)
      // reduce % poly
    };
  };
  const swapLE = (n) => (n >>> 0 & 255) << 24 | (n >>> 8 & 255) << 16 | (n >>> 16 & 255) << 8 | n >>> 24 & 255 | 0;
  function _toGHASHKey(k) {
    k.reverse();
    const hiBit = k[15] & 1;
    let carry = 0;
    for (let i2 = 0; i2 < k.length; i2++) {
      const t = k[i2];
      k[i2] = t >>> 1 | carry;
      carry = (t & 1) << 7;
    }
    k[0] ^= -hiBit & 225;
    return k;
  }
  const estimateWindow = (bytes) => {
    if (bytes > 64 * 1024)
      return 8;
    if (bytes > 1024)
      return 4;
    return 2;
  };
  class GHASH {
    // We select bits per window adaptively based on expectedLength
    constructor(key, expectedLength) {
      __publicField(this, "blockLen", BLOCK_SIZE$1);
      __publicField(this, "outputLen", BLOCK_SIZE$1);
      __publicField(this, "s0", 0);
      __publicField(this, "s1", 0);
      __publicField(this, "s2", 0);
      __publicField(this, "s3", 0);
      __publicField(this, "finished", false);
      __publicField(this, "t");
      __publicField(this, "W");
      __publicField(this, "windowSize");
      abytes(key, 16, "key");
      key = copyBytes(key);
      const kView = createView(key);
      let k0 = kView.getUint32(0, false);
      let k1 = kView.getUint32(4, false);
      let k2 = kView.getUint32(8, false);
      let k3 = kView.getUint32(12, false);
      const doubles = [];
      for (let i2 = 0; i2 < 128; i2++) {
        doubles.push({ s0: swapLE(k0), s1: swapLE(k1), s2: swapLE(k2), s3: swapLE(k3) });
        ({ s0: k0, s1: k1, s2: k2, s3: k3 } = mul2$1(k0, k1, k2, k3));
      }
      const W = estimateWindow(expectedLength || 1024);
      if (![1, 2, 4, 8].includes(W))
        throw new Error("ghash: invalid window size, expected 2, 4 or 8");
      this.W = W;
      const bits = 128;
      const windows = bits / W;
      const windowSize = this.windowSize = 2 ** W;
      const items = [];
      for (let w = 0; w < windows; w++) {
        for (let byte = 0; byte < windowSize; byte++) {
          let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
          for (let j = 0; j < W; j++) {
            const bit = byte >>> W - j - 1 & 1;
            if (!bit)
              continue;
            const { s0: d0, s1: d1, s2: d2, s3: d3 } = doubles[W * w + j];
            s0 ^= d0, s1 ^= d1, s2 ^= d2, s3 ^= d3;
          }
          items.push({ s0, s1, s2, s3 });
        }
      }
      this.t = items;
    }
    _updateBlock(s0, s1, s2, s3) {
      s0 ^= this.s0, s1 ^= this.s1, s2 ^= this.s2, s3 ^= this.s3;
      const { W, t, windowSize } = this;
      let o0 = 0, o1 = 0, o2 = 0, o3 = 0;
      const mask = (1 << W) - 1;
      let w = 0;
      for (const num of [s0, s1, s2, s3]) {
        for (let bytePos = 0; bytePos < 4; bytePos++) {
          const byte = num >>> 8 * bytePos & 255;
          for (let bitPos = 8 / W - 1; bitPos >= 0; bitPos--) {
            const bit = byte >>> W * bitPos & mask;
            const { s0: e0, s1: e1, s2: e2, s3: e3 } = t[w * windowSize + bit];
            o0 ^= e0, o1 ^= e1, o2 ^= e2, o3 ^= e3;
            w += 1;
          }
        }
      }
      this.s0 = o0;
      this.s1 = o1;
      this.s2 = o2;
      this.s3 = o3;
    }
    update(data) {
      aexists(this);
      abytes(data);
      data = copyBytes(data);
      const b32 = u32(data);
      const blocks = Math.floor(data.length / BLOCK_SIZE$1);
      const left = data.length % BLOCK_SIZE$1;
      for (let i2 = 0; i2 < blocks; i2++) {
        this._updateBlock(b32[i2 * 4 + 0], b32[i2 * 4 + 1], b32[i2 * 4 + 2], b32[i2 * 4 + 3]);
      }
      if (left) {
        ZEROS16.set(data.subarray(blocks * BLOCK_SIZE$1));
        this._updateBlock(ZEROS32[0], ZEROS32[1], ZEROS32[2], ZEROS32[3]);
        clean(ZEROS32);
      }
      return this;
    }
    destroy() {
      const { t } = this;
      for (const elm of t) {
        elm.s0 = 0, elm.s1 = 0, elm.s2 = 0, elm.s3 = 0;
      }
    }
    digestInto(out) {
      aexists(this);
      aoutput(out, this);
      this.finished = true;
      const { s0, s1, s2, s3 } = this;
      const o32 = u32(out);
      o32[0] = s0;
      o32[1] = s1;
      o32[2] = s2;
      o32[3] = s3;
      return out;
    }
    digest() {
      const res = new Uint8Array(BLOCK_SIZE$1);
      this.digestInto(res);
      this.destroy();
      return res;
    }
  }
  class Polyval extends GHASH {
    constructor(key, expectedLength) {
      abytes(key);
      const ghKey = _toGHASHKey(copyBytes(key));
      super(ghKey, expectedLength);
      clean(ghKey);
    }
    update(data) {
      aexists(this);
      abytes(data);
      data = copyBytes(data);
      const b32 = u32(data);
      const left = data.length % BLOCK_SIZE$1;
      const blocks = Math.floor(data.length / BLOCK_SIZE$1);
      for (let i2 = 0; i2 < blocks; i2++) {
        this._updateBlock(swapLE(b32[i2 * 4 + 3]), swapLE(b32[i2 * 4 + 2]), swapLE(b32[i2 * 4 + 1]), swapLE(b32[i2 * 4 + 0]));
      }
      if (left) {
        ZEROS16.set(data.subarray(blocks * BLOCK_SIZE$1));
        this._updateBlock(swapLE(ZEROS32[3]), swapLE(ZEROS32[2]), swapLE(ZEROS32[1]), swapLE(ZEROS32[0]));
        clean(ZEROS32);
      }
      return this;
    }
    digestInto(out) {
      aexists(this);
      aoutput(out, this);
      this.finished = true;
      const { s0, s1, s2, s3 } = this;
      const o32 = u32(out);
      o32[0] = s0;
      o32[1] = s1;
      o32[2] = s2;
      o32[3] = s3;
      return out.reverse();
    }
  }
  function wrapConstructorWithKey(hashCons) {
    const hashC = (msg, key) => hashCons(key, msg.length).update(msg).digest();
    const tmp = hashCons(new Uint8Array(16), 0);
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = (key, expectedLength) => hashCons(key, expectedLength);
    return hashC;
  }
  const ghash = wrapConstructorWithKey((key, expectedLength) => new GHASH(key, expectedLength));
  wrapConstructorWithKey((key, expectedLength) => new Polyval(key, expectedLength));
  const BLOCK_SIZE = 16;
  const BLOCK_SIZE32 = 4;
  const EMPTY_BLOCK = /* @__PURE__ */ new Uint8Array(BLOCK_SIZE);
  const POLY = 283;
  function validateKeyLength(key) {
    if (![16, 24, 32].includes(key.length))
      throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + key.length);
  }
  function mul2(n) {
    return n << 1 ^ POLY & -(n >> 7);
  }
  function mul(a, b) {
    let res = 0;
    for (; b > 0; b >>= 1) {
      res ^= a & -(b & 1);
      a = mul2(a);
    }
    return res;
  }
  const sbox = /* @__PURE__ */ (() => {
    const t = new Uint8Array(256);
    for (let i2 = 0, x = 1; i2 < 256; i2++, x ^= mul2(x))
      t[i2] = x;
    const box = new Uint8Array(256);
    box[0] = 99;
    for (let i2 = 0; i2 < 255; i2++) {
      let x = t[255 - i2];
      x |= x << 8;
      box[t[i2]] = (x ^ x >> 4 ^ x >> 5 ^ x >> 6 ^ x >> 7 ^ 99) & 255;
    }
    clean(t);
    return box;
  })();
  const rotr32_8 = (n) => n << 24 | n >>> 8;
  const rotl32_8 = (n) => n << 8 | n >>> 24;
  function genTtable(sbox2, fn) {
    if (sbox2.length !== 256)
      throw new Error("Wrong sbox length");
    const T0 = new Uint32Array(256).map((_, j) => fn(sbox2[j]));
    const T1 = T0.map(rotl32_8);
    const T2 = T1.map(rotl32_8);
    const T3 = T2.map(rotl32_8);
    const T01 = new Uint32Array(256 * 256);
    const T23 = new Uint32Array(256 * 256);
    const sbox22 = new Uint16Array(256 * 256);
    for (let i2 = 0; i2 < 256; i2++) {
      for (let j = 0; j < 256; j++) {
        const idx = i2 * 256 + j;
        T01[idx] = T0[i2] ^ T1[j];
        T23[idx] = T2[i2] ^ T3[j];
        sbox22[idx] = sbox2[i2] << 8 | sbox2[j];
      }
    }
    return { sbox: sbox2, sbox2: sbox22, T0, T1, T2, T3, T01, T23 };
  }
  const tableEncoding = /* @__PURE__ */ genTtable(sbox, (s) => mul(s, 3) << 24 | s << 16 | s << 8 | mul(s, 2));
  const xPowers = /* @__PURE__ */ (() => {
    const p = new Uint8Array(16);
    for (let i2 = 0, x = 1; i2 < 16; i2++, x = mul2(x))
      p[i2] = x;
    return p;
  })();
  function expandKeyLE(key) {
    abytes(key);
    const len2 = key.length;
    validateKeyLength(key);
    const { sbox2 } = tableEncoding;
    const toClean = [];
    if (!isAligned32(key))
      toClean.push(key = copyBytes(key));
    const k32 = u32(key);
    const Nk = k32.length;
    const subByte = (n) => applySbox(sbox2, n, n, n, n);
    const xk = new Uint32Array(len2 + 28);
    xk.set(k32);
    for (let i2 = Nk; i2 < xk.length; i2++) {
      let t = xk[i2 - 1];
      if (i2 % Nk === 0)
        t = subByte(rotr32_8(t)) ^ xPowers[i2 / Nk - 1];
      else if (Nk > 6 && i2 % Nk === 4)
        t = subByte(t);
      xk[i2] = xk[i2 - Nk] ^ t;
    }
    clean(...toClean);
    return xk;
  }
  function apply0123(T01, T23, s0, s1, s2, s3) {
    return T01[s0 << 8 & 65280 | s1 >>> 8 & 255] ^ T23[s2 >>> 8 & 65280 | s3 >>> 24 & 255];
  }
  function applySbox(sbox2, s0, s1, s2, s3) {
    return sbox2[s0 & 255 | s1 & 65280] | sbox2[s2 >>> 16 & 255 | s3 >>> 16 & 65280] << 16;
  }
  function encrypt(xk, s0, s1, s2, s3) {
    const { sbox2, T01, T23 } = tableEncoding;
    let k = 0;
    s0 ^= xk[k++], s1 ^= xk[k++], s2 ^= xk[k++], s3 ^= xk[k++];
    const rounds = xk.length / 4 - 2;
    for (let i2 = 0; i2 < rounds; i2++) {
      const t02 = xk[k++] ^ apply0123(T01, T23, s0, s1, s2, s3);
      const t12 = xk[k++] ^ apply0123(T01, T23, s1, s2, s3, s0);
      const t22 = xk[k++] ^ apply0123(T01, T23, s2, s3, s0, s1);
      const t32 = xk[k++] ^ apply0123(T01, T23, s3, s0, s1, s2);
      s0 = t02, s1 = t12, s2 = t22, s3 = t32;
    }
    const t0 = xk[k++] ^ applySbox(sbox2, s0, s1, s2, s3);
    const t1 = xk[k++] ^ applySbox(sbox2, s1, s2, s3, s0);
    const t2 = xk[k++] ^ applySbox(sbox2, s2, s3, s0, s1);
    const t3 = xk[k++] ^ applySbox(sbox2, s3, s0, s1, s2);
    return { s0: t0, s1: t1, s2: t2, s3: t3 };
  }
  function ctr32(xk, isLE2, nonce, src, dst) {
    abytes(nonce, BLOCK_SIZE, "nonce");
    abytes(src);
    dst = getOutput(src.length, dst);
    const ctr = nonce;
    const c32 = u32(ctr);
    const view = createView(ctr);
    const src32 = u32(src);
    const dst32 = u32(dst);
    const ctrPos = isLE2 ? 0 : 12;
    const srcLen = src.length;
    let ctrNum = view.getUint32(ctrPos, isLE2);
    let { s0, s1, s2, s3 } = encrypt(xk, c32[0], c32[1], c32[2], c32[3]);
    for (let i2 = 0; i2 + 4 <= src32.length; i2 += 4) {
      dst32[i2 + 0] = src32[i2 + 0] ^ s0;
      dst32[i2 + 1] = src32[i2 + 1] ^ s1;
      dst32[i2 + 2] = src32[i2 + 2] ^ s2;
      dst32[i2 + 3] = src32[i2 + 3] ^ s3;
      ctrNum = ctrNum + 1 >>> 0;
      view.setUint32(ctrPos, ctrNum, isLE2);
      ({ s0, s1, s2, s3 } = encrypt(xk, c32[0], c32[1], c32[2], c32[3]));
    }
    const start = BLOCK_SIZE * Math.floor(src32.length / BLOCK_SIZE32);
    if (start < srcLen) {
      const b32 = new Uint32Array([s0, s1, s2, s3]);
      const buf = u8(b32);
      for (let i2 = start, pos = 0; i2 < srcLen; i2++, pos++)
        dst[i2] = src[i2] ^ buf[pos];
      clean(b32);
    }
    return dst;
  }
  function computeTag(fn, isLE2, key, data, AAD) {
    const aadLength = AAD ? AAD.length : 0;
    const h = fn.create(key, data.length + aadLength);
    if (AAD)
      h.update(AAD);
    const num = u64Lengths(8 * data.length, 8 * aadLength, isLE2);
    h.update(data);
    h.update(num);
    const res = h.digest();
    clean(num);
    return res;
  }
  const gcm = /* @__PURE__ */ wrapCipher({ blockSize: 16, nonceLength: 12, tagLength: 16, varSizeNonce: true }, function aesgcm(key, nonce, AAD) {
    if (nonce.length < 8)
      throw new Error("aes/gcm: invalid nonce length");
    const tagLength = 16;
    function _computeTag(authKey, tagMask, data) {
      const tag = computeTag(ghash, false, authKey, data, AAD);
      for (let i2 = 0; i2 < tagMask.length; i2++)
        tag[i2] ^= tagMask[i2];
      return tag;
    }
    function deriveKeys() {
      const xk = expandKeyLE(key);
      const authKey = EMPTY_BLOCK.slice();
      const counter = EMPTY_BLOCK.slice();
      ctr32(xk, false, counter, counter, authKey);
      if (nonce.length === 12) {
        counter.set(nonce);
      } else {
        const nonceLen = EMPTY_BLOCK.slice();
        const view = createView(nonceLen);
        view.setBigUint64(8, BigInt(nonce.length * 8), false);
        const g = ghash.create(authKey).update(nonce).update(nonceLen);
        g.digestInto(counter);
        g.destroy();
      }
      const tagMask = ctr32(xk, false, counter, EMPTY_BLOCK);
      return { xk, authKey, counter, tagMask };
    }
    return {
      encrypt(plaintext) {
        const { xk, authKey, counter, tagMask } = deriveKeys();
        const out = new Uint8Array(plaintext.length + tagLength);
        const toClean = [xk, authKey, counter, tagMask];
        if (!isAligned32(plaintext))
          toClean.push(plaintext = copyBytes(plaintext));
        ctr32(xk, false, counter, plaintext, out.subarray(0, plaintext.length));
        const tag = _computeTag(authKey, tagMask, out.subarray(0, out.length - tagLength));
        toClean.push(tag);
        out.set(tag, plaintext.length);
        clean(...toClean);
        return out;
      },
      decrypt(ciphertext) {
        const { xk, authKey, counter, tagMask } = deriveKeys();
        const toClean = [xk, authKey, tagMask, counter];
        if (!isAligned32(ciphertext))
          toClean.push(ciphertext = copyBytes(ciphertext));
        const data = ciphertext.subarray(0, -tagLength);
        const passedTag = ciphertext.subarray(-tagLength);
        const tag = _computeTag(authKey, tagMask, data);
        toClean.push(tag);
        if (!equalBytes(tag, passedTag))
          throw new Error("aes/gcm: invalid ghash tag");
        const out = ctr32(xk, false, counter, data);
        clean(...toClean);
        return out;
      }
    };
  });
  const PASSPHRASE = "T8c8PQlSQVU4mBuW4CbE/g57VBbM5009QHd+ym93aZZ5pEeVpToY6OdpYPvRMVYp";
  async function decryptVidnestData(encryptedBase64) {
    try {
      const encryptedBytes = buffer.Buffer.from(encryptedBase64, "base64");
      const iv = encryptedBytes.subarray(0, 12);
      const ciphertext = encryptedBytes.subarray(12, -16);
      const tag = encryptedBytes.subarray(-16);
      const payload = new Uint8Array(ciphertext.length + tag.length);
      payload.set(ciphertext, 0);
      payload.set(tag, ciphertext.length);
      const key = buffer.Buffer.from(PASSPHRASE, "base64").subarray(0, 32);
      const cipher = gcm(key, iv);
      const decryptedBytes = cipher.decrypt(payload);
      const decryptedText = buffer.Buffer.from(decryptedBytes).toString("utf-8");
      return JSON.parse(decryptedText);
    } catch (error) {
      throw new NotFoundError("Failed to decrypt data");
    }
  }
  const vidnestHollymoviehdEmbed = makeEmbed({
    id: "vidnest-hollymoviehd",
    name: "Vidnest HollyMovie",
    rank: 104,
    flags: [],
    disabled: false,
    async scrape(ctx) {
      const response = await ctx.proxiedFetcher(ctx.url);
      if (!response.data) throw new NotFoundError("No encrypted data found");
      const decryptedData = await decryptVidnestData(response.data);
      if (!decryptedData.success && !decryptedData.sources) throw new NotFoundError("No streams found");
      const sources = decryptedData.sources || decryptedData.streams;
      const streams = [];
      const streamHeaders = {
        Origin: "https://flashstream.cc",
        Referer: "https://flashstream.cc/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      };
      for (const source of sources) {
        if (source.file && (source.file.includes("pkaystream.cc") || source.file.includes("flashstream.cc"))) {
          streams.push({
            id: `hollymoviehd-${source.label || "default"}`,
            type: "hls",
            playlist: source.file,
            flags: [],
            captions: [],
            headers: streamHeaders
          });
        }
      }
      return {
        stream: streams
      };
    }
  });
  const vidnestAllmoviesEmbed = makeEmbed({
    id: "vidnest-allmovies",
    name: "Vidnest AllMovies (Hindi)",
    rank: 103,
    flags: [flags.CORS_ALLOWED],
    disabled: false,
    async scrape(ctx) {
      const response = await ctx.proxiedFetcher(ctx.url);
      if (!response.data) throw new NotFoundError("No encrypted data found");
      const decryptedData = await decryptVidnestData(response.data);
      if (!decryptedData.success && !decryptedData.streams) throw new NotFoundError("No streams found");
      const sources = decryptedData.sources || decryptedData.streams;
      const streams = [];
      for (const stream of sources) {
        streams.push({
          id: `allmovies-${stream.language || "default"}`,
          type: "hls",
          playlist: stream.url || stream.file,
          flags: [flags.CORS_ALLOWED],
          captions: [],
          preferredHeaders: stream.headers || {}
        });
      }
      return {
        stream: streams
      };
    }
  });
  const providers = [
    {
      id: "server-13",
      rank: 112
    },
    {
      id: "server-18",
      rank: 111,
      flags: []
    },
    {
      id: "server-11",
      rank: 102
    },
    {
      id: "server-7",
      rank: 92
    },
    {
      id: "server-10",
      rank: 82
    },
    {
      id: "server-1",
      rank: 72
    },
    {
      id: "server-16",
      rank: 64
    },
    {
      id: "server-3",
      rank: 62
    },
    {
      id: "server-17",
      rank: 52
    },
    {
      id: "server-2",
      rank: 42
    },
    {
      id: "server-4",
      rank: 32
    },
    {
      id: "server-5",
      rank: 24
    },
    {
      id: "server-14",
      // catflix? uwu.m3u8
      rank: 22
    },
    {
      id: "server-6",
      rank: 21
    },
    {
      id: "server-15",
      rank: 20
    },
    {
      id: "server-8",
      rank: 19
    },
    {
      id: "server-9",
      rank: 18
    },
    {
      id: "server-19",
      rank: 17
    },
    {
      id: "server-12",
      rank: 16
    }
    // { // Looks like this was removed
    //   id: 'server-20',
    //   rank: 1,
    //   name: 'Cineby',
    // },
  ];
  function embed(provider) {
    return makeEmbed({
      id: provider.id,
      name: provider.name || provider.id.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" "),
      // disabled: provider.disabled,
      disabled: true,
      rank: provider.rank,
      flags: [flags.CORS_ALLOWED],
      async scrape(ctx) {
        return {
          stream: [
            {
              id: "primary",
              type: "hls",
              playlist: ctx.url,
              flags: [flags.CORS_ALLOWED],
              captions: []
            }
          ]
        };
      }
    });
  }
  const [
    VidsrcsuServer1Scraper,
    VidsrcsuServer2Scraper,
    VidsrcsuServer3Scraper,
    VidsrcsuServer4Scraper,
    VidsrcsuServer5Scraper,
    VidsrcsuServer6Scraper,
    VidsrcsuServer7Scraper,
    VidsrcsuServer8Scraper,
    VidsrcsuServer9Scraper,
    VidsrcsuServer10Scraper,
    VidsrcsuServer11Scraper,
    VidsrcsuServer12Scraper,
    VidsrcsuServer20Scraper
  ] = providers.map(embed);
  const viperScraper = makeEmbed({
    id: "viper",
    name: "Viper",
    rank: 182,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    async scrape(ctx) {
      const apiResponse = await ctx.proxiedFetcher.full(ctx.url, {
        headers: {
          Accept: "application/json",
          Referer: "https://embed.su/"
        }
      });
      if (!apiResponse.body.source) {
        throw new NotFoundError("No source found");
      }
      const playlistUrl = apiResponse.body.source.replace(/^.*\/viper\//, "https://");
      const headers2 = {
        referer: "https://megacloud.store/",
        origin: "https://megacloud.store"
      };
      return {
        stream: [
          {
            type: "hls",
            id: "primary",
            playlist: createM3U8ProxyUrl(playlistUrl, ctx.features, headers2),
            headers: headers2,
            flags: [flags.CORS_ALLOWED],
            captions: []
          }
        ]
      };
    }
  });
  const userAgent = "Mozilla/5.0 (Linux; Android 11; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
  function cleanSymbols(s) {
    let result = s;
    for (const p of ["@$", "^^", "~@", "%?", "*~", "!!", "#&"]) {
      result = result.replaceAll(p, "_");
    }
    return result;
  }
  function cleanUnderscores(s) {
    return s.replace(/_/g, "");
  }
  function shiftBack(s, n) {
    return Array.from(s).map((c) => String.fromCharCode(c.charCodeAt(0) - n)).join("");
  }
  function rot13(str) {
    return str.replace(/[a-zA-Z]/g, (c) => {
      const base = c <= "Z" ? 65 : 97;
      return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
    });
  }
  const voeScraper = makeEmbed({
    id: "voe",
    name: "Voe",
    rank: 180,
    flags: [flags.IP_LOCKED],
    async scrape(ctx) {
      const url = ctx.url;
      const defaultDomain = (() => {
        try {
          const u = new URL(url);
          return `${u.protocol}//${u.host}/`;
        } catch {
          return void 0;
        }
      })();
      const headers2 = {
        "User-Agent": userAgent
      };
      if (defaultDomain) {
        headers2.Referer = defaultDomain;
      }
      let html = await ctx.proxiedFetcher(url, { headers: headers2 });
      if (html.includes("Redirecting...")) {
        const match = html.match(/href\s*=\s*'(.*?)';/);
        if (!match) throw new NotFoundError("Redirect target not found");
        const redirectUrl = match[1];
        html = await ctx.proxiedFetcher(redirectUrl, { headers: headers2 });
      }
      const jsonScriptMatch = html.match(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i);
      if (!jsonScriptMatch) throw new NotFoundError("Obfuscated script not found");
      const obfuscatedScript = jsonScriptMatch[1];
      const encodedMatch = obfuscatedScript.match(/\["(.*?)"\]/);
      if (!encodedMatch) throw new NotFoundError("Encoded data not found");
      const encodedData = encodedMatch[1];
      let decoded = rot13(encodedData);
      decoded = cleanSymbols(decoded);
      decoded = cleanUnderscores(decoded);
      decoded = Buffer.from(decoded, "base64").toString("utf-8");
      decoded = shiftBack(decoded, 3);
      decoded = decoded.split("").reverse().join("");
      decoded = Buffer.from(decoded, "base64").toString("utf-8");
      const json = JSON.parse(decoded);
      const videoUrl = json == null ? void 0 : json.source;
      if (!videoUrl) throw new NotFoundError("No video URL found");
      return {
        stream: [
          {
            id: "primary",
            type: "hls",
            playlist: videoUrl,
            flags: [flags.IP_LOCKED],
            captions: [],
            headers: {
              Referer: defaultDomain || url,
              Origin: (defaultDomain == null ? void 0 : defaultDomain.replace(/\/$/, "")) || new URL(url).origin,
              "User-Agent": userAgent
            }
          }
        ]
      };
    }
  });
  async function getVideowlUrlStream(ctx, decryptedId) {
    var _a2;
    const sharePage = await ctx.proxiedFetcher("https://cloud.mail.ru/public/uaRH/2PYWcJRpH");
    const regex = /"videowl_view":\{"count":"(\d+)","url":"([^"]+)"\}/g;
    const videowlUrl = (_a2 = regex.exec(sharePage)) == null ? void 0 : _a2[2];
    if (!videowlUrl) throw new NotFoundError("Failed to get videoOwlUrl");
    return `${videowlUrl}/0p/${btoa(decryptedId)}.m3u8?${new URLSearchParams({
      double_encode: "1"
    })}`;
  }
  const warezcdnembedHlsScraper = makeEmbed({
    id: "warezcdnembedhls",
    // WarezCDN is both a source and an embed host
    name: "WarezCDN HLS",
    // method no longer works
    disabled: true,
    rank: 83,
    flags: [flags.IP_LOCKED],
    async scrape(ctx) {
      const decryptedId = await getDecryptedId(ctx);
      if (!decryptedId) throw new NotFoundError("can't get file id");
      const streamUrl = await getVideowlUrlStream(ctx, decryptedId);
      return {
        stream: [
          {
            id: "primary",
            type: "hls",
            flags: [flags.IP_LOCKED],
            captions: [],
            playlist: streamUrl
          }
        ]
      };
    }
  });
  const warezPlayerScraper = makeEmbed({
    id: "warezplayer",
    name: "warezPLAYER",
    disabled: true,
    rank: 85,
    flags: [],
    async scrape(ctx) {
      const playerPageUrl = new URL(ctx.url);
      const hash = playerPageUrl.pathname.split("/")[2];
      const playerApiRes = await ctx.proxiedFetcher("/player/index.php", {
        baseUrl: playerPageUrl.origin,
        query: {
          data: hash,
          do: "getVideo"
        },
        method: "POST",
        body: new URLSearchParams({
          hash
        }),
        headers: {
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      const sources = JSON.parse(playerApiRes);
      if (!sources.videoSource) throw new Error("Playlist not found");
      return {
        stream: [
          {
            id: "primary",
            type: "hls",
            flags: [],
            captions: [],
            playlist: sources.videoSource,
            headers: {
              // without this it returns "security error"
              Accept: "*/*"
            }
          }
        ]
      };
    }
  });
  const ZUNIME_SERVERS = ["hd-2", "miko", "shiro", "zaza"];
  const baseUrl$e = "https://backend.xaiby.sbs";
  const headers$3 = {
    referer: "https://vidnest.fun/",
    origin: "https://vidnest.fun",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
  };
  function makeZunimeEmbed(id, rank = 100) {
    return makeEmbed({
      id: `zunime-${id}`,
      name: `Zunime ${id.charAt(0).toUpperCase() + id.slice(1)}`,
      rank,
      flags: [flags.CORS_ALLOWED],
      async scrape(ctx) {
        var _a2, _b2;
        const serverName = id;
        const query = JSON.parse(ctx.url);
        const { anilistId, episode } = query;
        const res = await ctx.proxiedFetcher(`${"/sources"}`, {
          baseUrl: baseUrl$e,
          headers: headers$3,
          query: {
            id: String(anilistId),
            ep: String(episode ?? 1),
            host: serverName,
            type: "dub"
          }
        });
        console.log(res);
        const resAny = res;
        if (!(resAny == null ? void 0 : resAny.success) || !((_a2 = resAny == null ? void 0 : resAny.sources) == null ? void 0 : _a2.url)) {
          throw new NotFoundError("No stream URL found in response");
        }
        const streamUrl = resAny.sources.url;
        const upstreamHeaders = ((_b2 = resAny == null ? void 0 : resAny.sources) == null ? void 0 : _b2.headers) && Object.keys(resAny.sources.headers).length > 0 ? resAny.sources.headers : headers$3;
        ctx.progress(100);
        return {
          stream: [
            {
              id: "primary",
              type: "hls",
              playlist: `https://proxy-2.madaraverse.online/proxy?url=${encodeURIComponent(streamUrl)}`,
              headers: upstreamHeaders,
              flags: [],
              captions: []
            }
          ]
        };
      }
    });
  }
  const zunimeEmbeds = ZUNIME_SERVERS.map((server, i2) => makeZunimeEmbed(server, 260 - i2));
  async function getStream$2(ctx, id) {
    var _a2, _b2;
    try {
      const baseUrl2 = "https://ftmoh345xme.com";
      const headers2 = {
        Origin: "https://friness-cherlormur-i-275.site",
        Referer: "https://google.com/",
        Dnt: "1"
      };
      const url = `${baseUrl2}/play/${id}`;
      const result = await ctx.proxiedFetcher(url, {
        headers: {
          ...headers2
        },
        method: "GET"
      });
      const $ = cheerio__namespace.load(result);
      const script = $("script").last().html();
      if (!script) {
        throw new NotFoundError("Failed to extract script data");
      }
      const content = ((_a2 = script.match(/(\{[^;]+});/)) == null ? void 0 : _a2[1]) || ((_b2 = script.match(/\((\{.*\})\)/)) == null ? void 0 : _b2[1]);
      if (!content) {
        throw new NotFoundError("Media not found");
      }
      const data = JSON.parse(content);
      let file = data.file;
      if (!file) {
        throw new NotFoundError("File not found");
      }
      if (file.startsWith("/")) {
        file = baseUrl2 + file;
      }
      const key = data.key;
      const headers22 = {
        Origin: "https://friness-cherlormur-i-275.site",
        Referer: "https://google.com/",
        Dnt: "1",
        "X-Csrf-Token": key
      };
      const PlayListRes = await ctx.proxiedFetcher(file, {
        headers: {
          ...headers22
        },
        method: "GET"
      });
      const playlist = PlayListRes;
      return {
        success: true,
        data: {
          playlist,
          key
        }
      };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new NotFoundError("Failed to fetch media info");
    }
  }
  async function getStream$1(ctx, file, key) {
    const f = file;
    const path = `${f.slice(1)}.txt`;
    try {
      const baseUrl2 = "https://ftmoh345xme.com";
      const headers2 = {
        Origin: "https://friness-cherlormur-i-275.site",
        Referer: "https://google.com/",
        Dnt: "1",
        "X-Csrf-Token": key
      };
      const url = `${baseUrl2}/playlist/${path}`;
      const result = await ctx.proxiedFetcher(url, {
        headers: {
          ...headers2
        },
        method: "GET"
      });
      return {
        success: true,
        data: {
          link: result
        }
      };
    } catch (error) {
      throw new NotFoundError("Failed to fetch stream data");
    }
  }
  async function getMovie(ctx, id, lang = "English") {
    var _a2, _b2;
    try {
      const mediaInfo = await getStream$2(ctx, id);
      if (mediaInfo == null ? void 0 : mediaInfo.success) {
        const playlist = (_a2 = mediaInfo == null ? void 0 : mediaInfo.data) == null ? void 0 : _a2.playlist;
        if (!playlist || !Array.isArray(playlist)) {
          throw new NotFoundError("Playlist not found or invalid");
        }
        let file = playlist.find((item) => (item == null ? void 0 : item.title) === lang);
        if (!file) {
          file = playlist == null ? void 0 : playlist[0];
        }
        if (!file) {
          throw new NotFoundError("No file found");
        }
        const availableLang = playlist.map((item) => item == null ? void 0 : item.title);
        const key = (_b2 = mediaInfo == null ? void 0 : mediaInfo.data) == null ? void 0 : _b2.key;
        ctx.progress(70);
        const streamUrl = await getStream$1(ctx, file == null ? void 0 : file.file, key);
        if (streamUrl == null ? void 0 : streamUrl.success) {
          return { success: true, data: streamUrl == null ? void 0 : streamUrl.data, availableLang };
        }
        throw new NotFoundError("No stream url found");
      }
      throw new NotFoundError("No media info found");
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new NotFoundError("Failed to fetch movie data");
    }
  }
  async function getTV(ctx, id, season, episode, lang) {
    var _a2, _b2, _c2;
    try {
      const mediaInfo = await getStream$2(ctx, id);
      if (!(mediaInfo == null ? void 0 : mediaInfo.success)) {
        throw new NotFoundError("No media info found");
      }
      const playlist = (_a2 = mediaInfo == null ? void 0 : mediaInfo.data) == null ? void 0 : _a2.playlist;
      const getSeason = playlist.find((item) => (item == null ? void 0 : item.id) === season.toString());
      if (!getSeason) {
        throw new NotFoundError("No season found");
      }
      const getEpisode = getSeason == null ? void 0 : getSeason.folder.find((item) => (item == null ? void 0 : item.episode) === episode.toString());
      if (!getEpisode) {
        throw new NotFoundError("No episode found");
      }
      let file = getEpisode == null ? void 0 : getEpisode.folder.find((item) => (item == null ? void 0 : item.title) === lang);
      if (!file) {
        file = (_b2 = getEpisode == null ? void 0 : getEpisode.folder) == null ? void 0 : _b2[0];
      }
      if (!file) {
        throw new NotFoundError("No file found");
      }
      const availableLang = getEpisode == null ? void 0 : getEpisode.folder.map((item) => {
        return item == null ? void 0 : item.title;
      });
      const filterLang = availableLang.filter((item) => (item == null ? void 0 : item.length) > 0);
      const key = (_c2 = mediaInfo == null ? void 0 : mediaInfo.data) == null ? void 0 : _c2.key;
      ctx.progress(70);
      const streamUrl = await getStream$1(ctx, file == null ? void 0 : file.file, key);
      if (streamUrl == null ? void 0 : streamUrl.success) {
        return {
          success: true,
          data: streamUrl == null ? void 0 : streamUrl.data,
          availableLang: filterLang
        };
      }
      throw new NotFoundError("No stream url found");
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new NotFoundError("Failed to fetch TV data");
    }
  }
  async function comboScraper$k(ctx) {
    ({
      title: ctx.media.title,
      releaseYear: ctx.media.releaseYear,
      tmdbId: ctx.media.tmdbId,
      imdbId: ctx.media.imdbId,
      type: ctx.media.type
    });
    if (ctx.media.type === "show") {
      ctx.media.season.number.toString();
      ctx.media.episode.number.toString();
    }
    if (ctx.media.type === "movie") {
      ctx.progress(40);
      const res = await getMovie(ctx, ctx.media.imdbId);
      if (res == null ? void 0 : res.success) {
        ctx.progress(90);
        return {
          embeds: [],
          stream: [
            {
              id: "primary",
              captions: [],
              playlist: res.data.link,
              type: "hls",
              flags: [flags.CORS_ALLOWED]
            }
          ]
        };
      }
      throw new NotFoundError("No providers available");
    }
    if (ctx.media.type === "show") {
      ctx.progress(40);
      const lang = "English";
      const res = await getTV(ctx, ctx.media.imdbId, ctx.media.season.number, ctx.media.episode.number, lang);
      if (res == null ? void 0 : res.success) {
        ctx.progress(90);
        return {
          embeds: [],
          stream: [
            {
              id: "primary",
              captions: [],
              playlist: res.data.link,
              type: "hls",
              flags: [flags.CORS_ALLOWED]
            }
          ]
        };
      }
      throw new NotFoundError("No providers available");
    }
    throw new NotFoundError("No providers available");
  }
  const EightStreamScraper = makeSourcerer({
    id: "8stream",
    name: "8stream",
    rank: 111,
    flags: [],
    disabled: true,
    scrapeMovie: comboScraper$k,
    scrapeShow: comboScraper$k
  });
  const baseUrl$d = "https://www3.animeflv.net";
  async function searchAnimeFlv(ctx, title) {
    const searchUrl = `${baseUrl$d}/browse?q=${encodeURIComponent(title)}`;
    const html = await ctx.proxiedFetcher(searchUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    const $ = cheerio.load(html);
    const results = $("div.Container ul.ListAnimes li article");
    if (!results.length) throw new NotFoundError("No se encontró el anime en AnimeFLV");
    let animeUrl = "";
    results.each((_, el) => {
      const resultTitle = $(el).find("a h3").text().trim().toLowerCase();
      if (resultTitle === title.trim().toLowerCase()) {
        animeUrl = $(el).find("div.Description a.Button").attr("href") || "";
        return false;
      }
    });
    if (!animeUrl) {
      animeUrl = results.first().find("div.Description a.Button").attr("href") || "";
    }
    if (!animeUrl) throw new NotFoundError("No se encontró el anime en AnimeFLV");
    const fullUrl = animeUrl.startsWith("http") ? animeUrl : `${baseUrl$d}${animeUrl}`;
    return fullUrl;
  }
  async function getEpisodes(ctx, animeUrl) {
    const html = await ctx.proxiedFetcher(animeUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    const $ = cheerio.load(html);
    let episodes = [];
    $("script").each((_, script) => {
      var _a2, _b2, _c2;
      const data = $(script).html() || "";
      if (data.includes("var anime_info =")) {
        const animeInfo = (_a2 = data.split("var anime_info = [")[1]) == null ? void 0 : _a2.split("];")[0];
        const animeUri = (_b2 = animeInfo == null ? void 0 : animeInfo.split(",")[2]) == null ? void 0 : _b2.replace(/"/g, "").trim();
        const episodesRaw = (_c2 = data.split("var episodes = [")[1]) == null ? void 0 : _c2.split("];")[0];
        if (animeUri && episodesRaw) {
          const arrEpisodes = episodesRaw.split("],[");
          episodes = arrEpisodes.map((arrEp) => {
            const noEpisode = arrEp.replace("[", "").replace("]", "").split(",")[0];
            return {
              number: parseInt(noEpisode, 10),
              url: `${baseUrl$d}/ver/${animeUri}-${noEpisode}`
            };
          });
        } else {
          console.log("[AnimeFLV] No se encontró animeUri o lista de episodios en el script");
        }
      }
    });
    if (episodes.length === 0) {
      console.log("[AnimeFLV] No se encontraron episodios");
    }
    return episodes;
  }
  async function getEmbeds$1(ctx, episodeUrl) {
    const html = await ctx.proxiedFetcher(episodeUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    const $ = cheerio.load(html);
    const script = $('script:contains("var videos =")').html();
    if (!script) return {};
    const match = script.match(/var videos = (\{[\s\S]*?\});/);
    if (!match) return {};
    let videos = {};
    try {
      videos = JSON.parse(match[1]);
    } catch {
      return {};
    }
    let streamwishJapanese;
    if (videos.SUB) {
      const sw = videos.SUB.find((s) => {
        var _a2;
        return ((_a2 = s.title) == null ? void 0 : _a2.toLowerCase()) === "sw";
      });
      if (sw && (sw.url || sw.code)) {
        streamwishJapanese = sw.url || sw.code;
        if (streamwishJapanese && streamwishJapanese.startsWith("/e/")) {
          streamwishJapanese = `https://streamwish.to${streamwishJapanese}`;
        }
      }
    }
    let streamtapeLatino;
    if (videos.LAT) {
      const stape = videos.LAT.find(
        (s) => {
          var _a2, _b2;
          return ((_a2 = s.title) == null ? void 0 : _a2.toLowerCase()) === "stape" || ((_b2 = s.title) == null ? void 0 : _b2.toLowerCase()) === "streamtape";
        }
      );
      if (stape && (stape.url || stape.code)) {
        streamtapeLatino = stape.url || stape.code;
        if (streamtapeLatino && streamtapeLatino.startsWith("/e/")) {
          streamtapeLatino = `https://streamtape.com${streamtapeLatino}`;
        }
      }
    }
    return {
      "streamwish-japanese": streamwishJapanese,
      "streamtape-latino": streamtapeLatino
    };
  }
  async function comboScraper$j(ctx) {
    var _a2;
    const title = ctx.media.title;
    if (!title) throw new NotFoundError("Falta el título");
    console.log(`[AnimeFLV] Iniciando scraping para: ${title}`);
    const animeUrl = await searchAnimeFlv(ctx, title);
    let episodeUrl = animeUrl;
    if (ctx.media.type === "show") {
      const episode = (_a2 = ctx.media.episode) == null ? void 0 : _a2.number;
      if (!episode) throw new NotFoundError("Faltan datos de episodio");
      const episodes = await getEpisodes(ctx, animeUrl);
      const ep = episodes.find((e) => e.number === episode);
      if (!ep) throw new NotFoundError(`No se encontró el episodio ${episode}`);
      episodeUrl = ep.url;
    } else if (ctx.media.type === "movie") {
      const html = await ctx.proxiedFetcher(animeUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });
      const $ = cheerio.load(html);
      let animeUri = null;
      $("script").each((_, script) => {
        var _a3, _b2;
        const data = $(script).html() || "";
        if (data.includes("var anime_info =")) {
          const animeInfo = (_a3 = data.split("var anime_info = [")[1]) == null ? void 0 : _a3.split("];")[0];
          animeUri = ((_b2 = animeInfo == null ? void 0 : animeInfo.split(",")[2]) == null ? void 0 : _b2.replace(/"/g, "").trim()) || null;
        }
      });
      if (!animeUri) throw new NotFoundError("No se pudo obtener el animeUri para la película");
      episodeUrl = `${baseUrl$d}/ver/${animeUri}-1`;
    }
    const embedsObj = await getEmbeds$1(ctx, episodeUrl);
    const filteredEmbeds = Object.entries(embedsObj).filter(([, url]) => typeof url === "string" && !!url).map(([embedId, url]) => ({ embedId, url }));
    if (filteredEmbeds.length === 0) {
      throw new NotFoundError("No se encontraron streams válidos");
    }
    return { embeds: filteredEmbeds };
  }
  const animeflvScraper = makeSourcerer({
    id: "animeflv",
    name: "AnimeFLV",
    rank: 90,
    disabled: false,
    flags: [flags.CORS_ALLOWED],
    scrapeShow: comboScraper$j,
    scrapeMovie: comboScraper$j
  });
  const cache = /* @__PURE__ */ new Map();
  function normalizeTitle$2(t) {
    return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  function matchesType(mediaType, anilist) {
    if (mediaType === "show") {
      return ["TV", "TV_SHORT", "OVA", "ONA", "SPECIAL"].includes(anilist.format);
    }
    return anilist.format === "MOVIE";
  }
  const anilistQuery = `
query ($search: String, $type: MediaType) {
  Page(page: 1, perPage: 20) {
    media(search: $search, type: $type, sort: POPULARITY_DESC) {
      id
      type
      format
      seasonYear
      title {
        romaji
        english
        native
      }
    }
  }
}
`;
  async function getAnilistIdFromMedia(ctx, media) {
    var _a2, _b2, _c2;
    const key = `${media.type}:${media.title}:${media.releaseYear}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const res = await ctx.proxiedFetcher("", {
      baseUrl: "https://graphql.anilist.co",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        query: anilistQuery,
        variables: {
          search: media.title,
          type: "ANIME"
        }
      })
    });
    const items = ((_b2 = (_a2 = res.data) == null ? void 0 : _a2.Page) == null ? void 0 : _b2.media) ?? [];
    if (!items.length) {
      throw new Error("AniList id not found");
    }
    const targetTitle = normalizeTitle$2(media.title);
    const scored = items.filter((it) => matchesType(media.type, it)).map((it) => {
      const titles = [it.title.romaji];
      if (it.title.english) titles.push(it.title.english);
      if (it.title.native) titles.push(it.title.native);
      const normTitles = titles.map(normalizeTitle$2).filter(Boolean);
      const exact = normTitles.includes(targetTitle);
      const partial = normTitles.some((t) => t.includes(targetTitle) || targetTitle.includes(t));
      const yearDelta = it.seasonYear ? Math.abs(it.seasonYear - media.releaseYear) : 5;
      let score = 0;
      if (exact) score += 100;
      else if (partial) score += 50;
      score += Math.max(0, 20 - yearDelta * 4);
      return { it, score };
    }).sort((a, b) => b.score - a.score);
    const winner = ((_c2 = scored[0]) == null ? void 0 : _c2.it) ?? items[0];
    const anilistId = winner == null ? void 0 : winner.id;
    if (!anilistId) throw new Error("AniList id not found");
    cache.set(key, anilistId);
    return anilistId;
  }
  const anilistTitlesQuery = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    title {
      romaji
      english
      native
    }
    synonyms
  }
}
`;
  async function getAnilistEnglishTitle(ctx, media) {
    const id = await getAnilistIdFromMedia(ctx, media);
    const res = await ctx.proxiedFetcher("", {
      baseUrl: "https://graphql.anilist.co",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        query: anilistTitlesQuery,
        variables: {
          id
        }
      })
    });
    const englishTitle = res.data.Media.title.english;
    return englishTitle ? englishTitle.toLowerCase() : null;
  }
  async function comboScraper$i(ctx) {
    const anilistId = await getAnilistIdFromMedia(ctx, ctx.media);
    const query = {
      type: ctx.media.type,
      title: ctx.media.title,
      tmdbId: ctx.media.tmdbId,
      imdbId: ctx.media.imdbId,
      anilistId,
      ...ctx.media.type === "show" && {
        season: ctx.media.season.number,
        episode: ctx.media.episode.number
      },
      ...ctx.media.type === "movie" && { episode: 1 },
      releaseYear: ctx.media.releaseYear
    };
    return {
      embeds: [
        {
          embedId: "animetsu-pahe",
          url: JSON.stringify(query)
        },
        {
          embedId: "animetsu-zoro",
          url: JSON.stringify(query)
        },
        {
          embedId: "animetsu-zaza",
          url: JSON.stringify(query)
        },
        {
          embedId: "animetsu-meg",
          url: JSON.stringify(query)
        },
        {
          embedId: "animetsu-bato",
          url: JSON.stringify(query)
        }
      ]
    };
  }
  const animetsuScraper = makeSourcerer({
    id: "animetsu",
    name: "Animetsu",
    rank: 112,
    flags: [],
    disabled: true,
    scrapeShow: comboScraper$i
  });
  const baseUrl$c = "https://cinehdplus.gratis";
  function inferLanguage(label) {
    const lower = (label || "").toLowerCase();
    if (lower.includes("ingles") || lower.includes("english")) return "english";
    if (lower.includes("latino")) return "latino";
    if (lower.includes("castellano") || lower.includes("español") || lower.includes("espanol") || lower.includes("spanish"))
      return "spanish";
    return void 0;
  }
  async function comboScraper$h(ctx) {
    const searchUrl = `${baseUrl$c}/series/?story=${ctx.media.tmdbId}&do=search&subaction=search`;
    const searchPage = await ctx.proxiedFetcher(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Referer: baseUrl$c
      }
    });
    const $search = cheerio.load(searchPage);
    const seriesUrl = $search(".card__title a[href]:first").attr("href");
    if (!seriesUrl) {
      throw new NotFoundError("Series not found in search results");
    }
    ctx.progress(30);
    const seriesPageUrl = new URL(seriesUrl, baseUrl$c);
    const seriesPage = await ctx.proxiedFetcher(seriesPageUrl.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Referer: baseUrl$c
      }
    });
    const $ = cheerio.load(seriesPage);
    const episodeSelector = `[data-num="${ctx.media.season.number}x${ctx.media.episode.number}"]`;
    const mirrorCandidates = $(episodeSelector).siblings(".mirrors").children("[data-link]").toArray().map((el) => {
      const link = $(el).attr("data-link");
      if (!link) return null;
      if (link.match(/cinehdplus/)) return null;
      const urlStr = link.startsWith("http") ? link : `https://${link}`;
      let url;
      try {
        url = new URL(urlStr);
      } catch {
        return null;
      }
      if (url.hostname === "cinehdplus.gratis") return null;
      const labelParts = [
        $(el).text(),
        $(el).attr("data-lang"),
        $(el).attr("data-title"),
        $(el).attr("title"),
        $(el).attr("aria-label"),
        $(el).attr("class")
      ].filter((v) => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
      return {
        url,
        label: labelParts.join(" ")
      };
    }).filter((v) => v !== null);
    if (!mirrorCandidates.length) {
      throw new NotFoundError("No streaming links found for this episode");
    }
    ctx.progress(70);
    const embeds = mirrorCandidates.map(({ url, label }) => {
      const lang = inferLanguage(label);
      const host = url.hostname.toLowerCase();
      let embedId;
      if (host.includes("streamwish")) {
        if (lang === "latino") embedId = "streamwish-latino";
        else if (lang === "spanish") embedId = "streamwish-spanish";
        else embedId = "streamwish-english";
      } else if (host.includes("vidhide")) {
        if (lang === "latino") embedId = "vidhide-latino";
        else if (lang === "spanish") embedId = "vidhide-spanish";
        else embedId = "vidhide-english";
      } else if (host.includes("filemoon")) {
        embedId = "filemoon";
      } else if (host.includes("supervideo")) {
        embedId = "supervideo";
      } else if (host.includes("dropload")) {
        embedId = "dropload";
      } else {
        return null;
      }
      return { embedId, url: url.href };
    }).filter((embed2) => embed2 !== null);
    ctx.progress(90);
    return {
      embeds
    };
  }
  const cinehdplusScraper = makeSourcerer({
    id: "cinehdplus",
    name: "CineHDPlus (Latino)",
    rank: 4,
    disabled: false,
    flags: [],
    scrapeShow: comboScraper$h
  });
  const baseUrl$b = "https://api.coitus.ca";
  async function comboScraper$g(ctx) {
    const apiUrl = ctx.media.type === "movie" ? `${baseUrl$b}/movie/${ctx.media.tmdbId}` : `${baseUrl$b}/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;
    const apiRes = await ctx.proxiedFetcher(apiUrl);
    if (!apiRes.videoSource) throw new NotFoundError("No watchable item found");
    let processedUrl = apiRes.videoSource;
    let streamHeaders = {};
    if (processedUrl.includes("orbitproxy")) {
      try {
        const urlParts = processedUrl.split(/orbitproxy\.[^/]+\//);
        if (urlParts.length >= 2) {
          const encryptedPart = urlParts[1].split(".m3u8")[0];
          try {
            const decodedData = Buffer.from(encryptedPart, "base64").toString("utf-8");
            const jsonData = JSON.parse(decodedData);
            const originalUrl = jsonData.u;
            const referer2 = jsonData.r || "";
            streamHeaders = { referer: referer2 };
            processedUrl = createM3U8ProxyUrl(originalUrl, ctx.features, streamHeaders);
          } catch (jsonError) {
            console.error("Error decoding/parsing orbitproxy data:", jsonError);
          }
        }
      } catch (error) {
        console.error("Error processing orbitproxy URL:", error);
      }
    }
    console.log(apiRes);
    ctx.progress(90);
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          captions: [],
          playlist: processedUrl,
          type: "hls",
          headers: streamHeaders,
          flags: [flags.CORS_ALLOWED]
        }
      ]
    };
  }
  const coitusScraper = makeSourcerer({
    id: "coitus",
    name: "Autoembed+",
    rank: 91,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$g,
    scrapeShow: comboScraper$g
  });
  const baseUrl$a = "https://www.cuevana3.eu";
  function normalizeTitle$1(title) {
    return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s-]/gi, "").replace(/\s+/g, "-").replace(/-+/g, "-");
  }
  async function getStreamUrl(ctx, embedUrl) {
    try {
      const html = await ctx.proxiedFetcher(embedUrl);
      const match = html.match(/var url = '([^']+)'/);
      if (match) {
        return match[1];
      }
    } catch {
    }
    return null;
  }
  function validateStream(url) {
    return url.startsWith("http://") || url.startsWith("https://");
  }
  function detectEmbedIdFromUrl(url, lang) {
    const lowerLang = (lang || "").toLowerCase();
    const normalizedLang = lowerLang === "english" ? "english" : lowerLang === "latino" ? "latino" : lowerLang === "spanish" ? "spanish" : "latino";
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      host = url.toLowerCase();
    }
    const isStreamwish = host.includes("streamwish") || host.includes("swiftplayers") || host.includes("hgplaycdn") || host.includes("habetar") || host.includes("yuguaab") || host.includes("guxhag") || host.includes("auvexiug") || host.includes("xenolyzb");
    if (host.includes("filemoon")) return "filemoon";
    if (isStreamwish) {
      if (normalizedLang === "english") return "streamwish-english";
      if (normalizedLang === "spanish") return "streamwish-spanish";
      return "streamwish-latino";
    }
    if (host.includes("vidhide")) {
      if (normalizedLang === "english") return "vidhide-english";
      if (normalizedLang === "spanish") return "vidhide-spanish";
      return "vidhide-latino";
    }
    if (host.includes("supervideo")) return "supervideo";
    if (host.includes("dropload")) return "dropload";
    if (host.includes("voe")) return "voe";
    if (host.includes("streamtape")) return "streamtape";
    if (host.includes("mixdrop")) return "mixdrop";
    if (host.includes("dood")) return "dood";
    return null;
  }
  function isDirectStreamUrl(url) {
    const lower = url.toLowerCase();
    if (lower.includes(".m3u8")) return { type: "hls", url };
    if (lower.includes(".mp4")) return { type: "file", url };
    return null;
  }
  async function extractVideos(ctx, videos) {
    const embeds = [];
    let bestDirect = null;
    let fallbackDirect = null;
    const orderedLangs = ["english", "latino", "spanish"];
    for (const lang of orderedLangs) {
      const videoArray = videos[lang];
      if (!videoArray) continue;
      for (const video of videoArray) {
        if (!video.result) continue;
        const resolvedUrl = await getStreamUrl(ctx, video.result) || video.result;
        if (!resolvedUrl || !validateStream(resolvedUrl)) continue;
        const direct = isDirectStreamUrl(resolvedUrl);
        if (direct) {
          if (lang === "english" && !bestDirect) bestDirect = direct;
          else if (!fallbackDirect) fallbackDirect = direct;
          continue;
        }
        const embedId = detectEmbedIdFromUrl(resolvedUrl, lang);
        if (!embedId) continue;
        embeds.push({ embedId, url: resolvedUrl });
      }
    }
    const directStream = bestDirect ?? fallbackDirect ?? void 0;
    return { embeds, ...directStream ? { directStream } : {} };
  }
  async function fetchTitleSubstitutes() {
    try {
      const response = await fetch("https://raw.githubusercontent.com/moonpic/fixed-titles/refs/heads/main/main.json");
      if (!response.ok) throw new Error("Failed to fetch fallback titles");
      return await response.json();
    } catch {
      return {};
    }
  }
  async function comboScraper$f(ctx) {
    var _a2, _b2, _c2, _d2;
    const mediaType = ctx.media.type;
    const tmdbId = ctx.media.tmdbId;
    if (!tmdbId) {
      throw new NotFoundError("TMDB ID is required to fetch the title in Spanish");
    }
    const translatedTitle = await fetchTMDBName(ctx, "es-ES");
    let normalizedTitle = normalizeTitle$1(translatedTitle);
    let pageUrl = mediaType === "movie" ? `${baseUrl$a}/ver-pelicula/${normalizedTitle}` : `${baseUrl$a}/episodio/${normalizedTitle}-temporada-${(_a2 = ctx.media.season) == null ? void 0 : _a2.number}-episodio-${(_b2 = ctx.media.episode) == null ? void 0 : _b2.number}`;
    ctx.progress(60);
    let pageContent = await ctx.proxiedFetcher(pageUrl);
    let $ = cheerio.load(pageContent);
    let script = $("script").toArray().find((scriptEl) => {
      var _a3;
      const content = ((_a3 = scriptEl.children[0]) == null ? void 0 : _a3.data) || "";
      return content.includes('{"props":{"pageProps":');
    });
    let embeds = [];
    let directStream;
    if (script) {
      let jsonData;
      try {
        const jsonString = script.children[0].data;
        const start = jsonString.indexOf('{"props":{"pageProps":');
        if (start === -1) throw new Error("No valid JSON start found");
        const partialJson = jsonString.slice(start);
        jsonData = JSON.parse(partialJson);
      } catch (error) {
        throw new NotFoundError(`Failed to parse JSON: ${error.message}`);
      }
      if (mediaType === "movie") {
        const movieData = jsonData.props.pageProps.thisMovie;
        if (movieData == null ? void 0 : movieData.videos) {
          const extracted = await extractVideos(ctx, movieData.videos);
          embeds = extracted.embeds ?? [];
          directStream = extracted.directStream;
        }
      } else {
        const episodeData = jsonData.props.pageProps.episode;
        if (episodeData == null ? void 0 : episodeData.videos) {
          const extracted = await extractVideos(ctx, episodeData.videos);
          embeds = extracted.embeds ?? [];
          directStream = extracted.directStream;
        }
      }
    }
    if (embeds.length === 0 && directStream) {
      return {
        embeds: [],
        stream: [
          directStream.type === "hls" ? {
            id: "primary",
            type: "hls",
            flags: [],
            playlist: directStream.url,
            captions: []
          } : {
            id: "primary",
            type: "file",
            flags: [],
            qualities: { unknown: { type: "mp4", url: directStream.url } },
            captions: []
          }
        ]
      };
    }
    if (embeds.length === 0) {
      const fallbacks = await fetchTitleSubstitutes();
      const fallbackTitle = fallbacks[tmdbId.toString()];
      if (!fallbackTitle) {
        throw new NotFoundError("No embed data found and no fallback title available");
      }
      normalizedTitle = normalizeTitle$1(fallbackTitle);
      pageUrl = mediaType === "movie" ? `${baseUrl$a}/ver-pelicula/${normalizedTitle}` : `${baseUrl$a}/episodio/${normalizedTitle}-temporada-${(_c2 = ctx.media.season) == null ? void 0 : _c2.number}-episodio-${(_d2 = ctx.media.episode) == null ? void 0 : _d2.number}`;
      pageContent = await ctx.proxiedFetcher(pageUrl);
      $ = cheerio.load(pageContent);
      script = $("script").toArray().find((scriptEl) => {
        var _a3;
        const content = ((_a3 = scriptEl.children[0]) == null ? void 0 : _a3.data) || "";
        return content.includes('{"props":{"pageProps":');
      });
      if (script) {
        let jsonData;
        try {
          const jsonString = script.children[0].data;
          const start = jsonString.indexOf('{"props":{"pageProps":');
          if (start === -1) throw new Error("No valid JSON start found");
          const partialJson = jsonString.slice(start);
          jsonData = JSON.parse(partialJson);
        } catch (error) {
          throw new NotFoundError(`Failed to parse JSON: ${error.message}`);
        }
        if (mediaType === "movie") {
          const movieData = jsonData.props.pageProps.thisMovie;
          if (movieData == null ? void 0 : movieData.videos) {
            const extracted = await extractVideos(ctx, movieData.videos);
            embeds = extracted.embeds ?? [];
            directStream = extracted.directStream;
          }
        } else {
          const episodeData = jsonData.props.pageProps.episode;
          if (episodeData == null ? void 0 : episodeData.videos) {
            const extracted = await extractVideos(ctx, episodeData.videos);
            embeds = extracted.embeds ?? [];
            directStream = extracted.directStream;
          }
        }
      }
      if (embeds.length === 0 && directStream) {
        return {
          embeds: [],
          stream: [
            directStream.type === "hls" ? {
              id: "primary",
              type: "hls",
              flags: [],
              playlist: directStream.url,
              captions: []
            } : {
              id: "primary",
              type: "file",
              flags: [],
              qualities: { unknown: { type: "mp4", url: directStream.url } },
              captions: []
            }
          ]
        };
      }
    }
    if (embeds.length === 0) {
      throw new NotFoundError("No valid streams found");
    }
    return { embeds };
  }
  const cuevana3Scraper = makeSourcerer({
    id: "cuevana3",
    name: "Cuevana3",
    rank: 160,
    disabled: true,
    flags: [],
    scrapeMovie: comboScraper$f,
    scrapeShow: comboScraper$f
  });
  async function getAddonStreams(addonUrl, ctx) {
    if (!ctx.media.imdbId) {
      throw new Error("Error: ctx.media.imdbId is required.");
    }
    let addonResponse;
    if (ctx.media.type === "show") {
      addonResponse = await ctx.proxiedFetcher(
        `${addonUrl}/stream/series/${ctx.media.imdbId}:${ctx.media.season.number}:${ctx.media.episode.number}.json`
      );
    } else {
      addonResponse = await ctx.proxiedFetcher(`${addonUrl}/stream/movie/${ctx.media.imdbId}.json`);
    }
    if (!addonResponse) {
      throw new Error("Error: addon did not respond");
    }
    return addonResponse;
  }
  async function parseStreamData(streams, ctx) {
    return ctx.proxiedFetcher("https://torrent-parse.pstream.mov", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(streams)
    });
  }
  async function getCometStreams(token, debridProvider, ctx) {
    const cometBaseUrl = "https://comet.elfhosted.com";
    const cometConfig = btoa(
      JSON.stringify({
        maxResultsPerResolution: 0,
        maxSize: 0,
        cachedOnly: false,
        removeTrash: true,
        resultFormat: ["all"],
        debridService: debridProvider,
        debridApiKey: token,
        debridStreamProxyPassword: "",
        languages: { exclude: [], preferred: ["en"] },
        resolutions: {},
        options: { remove_ranks_under: -1e10, allow_english_in_languages: false, remove_unknown_languages: false }
      })
    );
    const cometStreamsRaw = (await getAddonStreams(`${cometBaseUrl}/${cometConfig}`, ctx)).streams;
    const newStreams = [];
    for (let i2 = 0; i2 < cometStreamsRaw.length; i2++) {
      if (cometStreamsRaw[i2].description !== void 0)
        newStreams.push({
          title: cometStreamsRaw[i2].description.replace(/\n/g, ""),
          url: cometStreamsRaw[i2].url
        });
    }
    const parsedData = await parseStreamData(newStreams, ctx);
    return parsedData;
  }
  const OVERRIDE_TOKEN = "";
  const OVERRIDE_SERVICE = "";
  const getDebridToken = () => {
    var _a2;
    try {
      if (OVERRIDE_TOKEN) ;
    } catch {
    }
    try {
      if (typeof window === "undefined" || !window.localStorage || typeof window.localStorage.getItem !== "function") return null;
      const prefData = window.localStorage.getItem("__MW::preferences");
      if (!prefData) return null;
      const parsedAuth = JSON.parse(prefData);
      return ((_a2 = parsedAuth == null ? void 0 : parsedAuth.state) == null ? void 0 : _a2.debridToken) || null;
    } catch (e) {
      console.error("Error getting debrid token:", e);
      return null;
    }
  };
  const getDebridService = () => {
    var _a2;
    try {
      if (OVERRIDE_SERVICE) ;
    } catch {
    }
    try {
      if (typeof window === "undefined" || !window.localStorage || typeof window.localStorage.getItem !== "function") return "real-debrid";
      const prefData = window.localStorage.getItem("__MW::preferences");
      if (!prefData) return "real-debrid";
      const parsedPrefs = JSON.parse(prefData);
      const saved = (_a2 = parsedPrefs == null ? void 0 : parsedPrefs.state) == null ? void 0 : _a2.debridService;
      if (saved === "realdebrid" || !saved) return "real-debrid";
      return saved;
    } catch (e) {
      console.error("Error getting debrid service (defaulting to real-debrid):", e);
      return "real-debrid";
    }
  };
  function normalizeQuality(resolution) {
    if (!resolution) return "unknown";
    const res = resolution.toLowerCase();
    if (res === "4k" || res === "2160p") return "4k";
    if (res === "1080p") return 1080;
    if (res === "720p") return 720;
    if (res === "480p") return 480;
    if (res === "360p") return 360;
    return "unknown";
  }
  function scoreStream(stream) {
    let score = 0;
    if (stream.container === "mp4") score += 10;
    if (stream.audio === "aac") score += 5;
    if (stream.codec === "h265") score += 2;
    if (stream.container === "mkv") score -= 2;
    if (stream.complete) score += 1;
    return score;
  }
  async function comboScraper$e(ctx) {
    const apiKey = getDebridToken();
    if (!apiKey) {
      throw new NotFoundError("Debrid API token is required");
    }
    const debridProvider = getDebridService();
    const [torrentioResult, cometStreams] = await Promise.all([
      getAddonStreams(`https://torrentio.strem.fun/${debridProvider}=${apiKey}`, ctx),
      getCometStreams(apiKey, debridProvider, ctx).catch(() => {
        return [];
      })
    ]);
    ctx.progress(33);
    const torrentioStreams = await parseStreamData(
      torrentioResult.streams.map((s) => ({
        ...s,
        title: s.title ?? ""
      })),
      ctx
    );
    const allStreams = [...torrentioStreams, ...cometStreams];
    if (allStreams.length === 0) {
      console.log("No streams found from either source!");
      throw new NotFoundError("No streams found or parse failed!");
    }
    console.log(
      `Total streams: ${allStreams.length} (${torrentioStreams.length} from Torrentio, ${cometStreams.length} from Comet)`
    );
    ctx.progress(66);
    const qualities = {};
    const byQuality = {};
    for (const stream of allStreams) {
      const quality = normalizeQuality(stream.resolution);
      if (!byQuality[quality]) byQuality[quality] = [];
      byQuality[quality].push(stream);
    }
    for (const [quality, streams] of Object.entries(byQuality)) {
      const mp4Aac = streams.find((s) => s.container === "mp4" && s.audio === "aac");
      if (mp4Aac) {
        qualities[quality] = {
          type: "mp4",
          url: mp4Aac.url
        };
        continue;
      }
      const mp4 = streams.find((s) => s.container === "mp4");
      if (mp4) {
        qualities[quality] = {
          type: "mp4",
          url: mp4.url
        };
        continue;
      }
      streams.sort((a, b) => scoreStream(b) - scoreStream(a));
      const best = streams[0];
      if (best) {
        qualities[quality] = {
          type: "mp4",
          // has to be set as mp4 because of types..... But mkvs *can* work in a browser depending on codec, usually it cant be hevc and has to have AAC audio
          url: best.url
        };
      }
    }
    ctx.progress(100);
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          type: "file",
          qualities,
          captions: [],
          flags: []
        }
      ]
    };
  }
  const debridScraper = makeSourcerer({
    id: "debrid",
    name: "Debrid",
    rank: 450,
    disabled: !getDebridToken(),
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$e,
    scrapeShow: comboScraper$e
  });
  async function stringAtob(input) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    const str = input.replace(/=+$/, "");
    let output = "";
    if (str.length % 4 === 1) {
      throw new Error("The string to be decoded is not correctly encoded.");
    }
    for (let bc = 0, bs = 0, i2 = 0; i2 < str.length; i2++) {
      const buffer2 = str.charAt(i2);
      const charIndex = chars.indexOf(buffer2);
      if (charIndex === -1) continue;
      bs = bc % 4 ? bs * 64 + charIndex : charIndex;
      if (bc++ % 4) {
        output += String.fromCharCode(255 & bs >> (-2 * bc & 6));
      }
    }
    return output;
  }
  async function comboScraper$d(ctx) {
    const embedUrl = `https://embed.su/embed/${ctx.media.type === "movie" ? `movie/${ctx.media.tmdbId}` : `tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`}`;
    const embedPage = await ctx.proxiedFetcher(embedUrl, {
      headers: {
        Referer: "https://embed.su/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      }
    });
    const vConfigMatch = embedPage.match(/window\.vConfig\s*=\s*JSON\.parse\(atob\(`([^`]+)/i);
    const encodedConfig = vConfigMatch == null ? void 0 : vConfigMatch[1];
    if (!encodedConfig) throw new NotFoundError("No encoded config found");
    const decodedConfig = JSON.parse(await stringAtob(encodedConfig));
    if (!(decodedConfig == null ? void 0 : decodedConfig.hash)) throw new NotFoundError("No stream hash found");
    const firstDecode = (await stringAtob(decodedConfig.hash)).split(".").map((item) => item.split("").reverse().join(""));
    const secondDecode = JSON.parse(await stringAtob(firstDecode.join("").split("").reverse().join("")));
    if (!(secondDecode == null ? void 0 : secondDecode.length)) throw new NotFoundError("No servers found");
    ctx.progress(50);
    const embeds = secondDecode.map((server) => ({
      embedId: "viper",
      url: `https://embed.su/api/e/${server.hash}`
    }));
    ctx.progress(90);
    return { embeds };
  }
  const embedsuScraper = makeSourcerer({
    id: "embedsu",
    name: "embed.su",
    rank: 165,
    disabled: true,
    flags: [],
    scrapeMovie: comboScraper$d,
    scrapeShow: comboScraper$d
  });
  function rtt(str) {
    return str.replace(/[a-z]/gi, (c) => {
      return String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < "n" ? 13 : -13));
    });
  }
  function decodeAtom(e) {
    const t = atob(e.split("").reverse().join(""));
    let o = "";
    for (let i2 = 0; i2 < t.length; i2++) {
      const r = "K9L"[i2 % 3];
      const n = t.charCodeAt(i2) - (r.charCodeAt(0) % 5 + 1);
      o += String.fromCharCode(n);
    }
    return atob(o);
  }
  function extractPackerParams(rawInput) {
    const regex = /'((?:[^'\\]|\\.)*)',\s*(\d+),\s*(\d+),\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/;
    const match = regex.exec(rawInput);
    if (!match) {
      console.error("Could not parse parameters. Format is not as expected.");
      return null;
    }
    return {
      payload: match[1],
      radix: parseInt(match[2], 10),
      count: parseInt(match[3], 10),
      keywords: match[4].split("|")
    };
  }
  function decodeDeanEdwards(params) {
    const { payload, radix, count, keywords } = params;
    const dict = /* @__PURE__ */ Object.create(null);
    const encodeBase = (num) => {
      if (num < radix) {
        const char2 = num % radix;
        return char2 > 35 ? String.fromCharCode(char2 + 29) : char2.toString(36);
      }
      const prefix = encodeBase(Math.floor(num / radix));
      const char = num % radix;
      const suffix = char > 35 ? String.fromCharCode(char + 29) : char.toString(36);
      return prefix + suffix;
    };
    let i2 = count;
    while (i2--) {
      const key = encodeBase(i2);
      const value = keywords[i2] || key;
      dict[key] = value;
    }
    return payload.replace(/\b\w+\b/g, (word) => {
      if (word in dict) {
        return dict[word];
      }
      return word;
    });
  }
  function decodeHex(str) {
    return str.replace(/\\x([0-9A-Fa-f]{2})/g, (_match, hexGroup) => {
      return String.fromCharCode(parseInt(hexGroup, 16));
    });
  }
  function unescapeString(str) {
    return str.replace(/\\(.)/g, (match, char) => char);
  }
  const baseUrl$9 = "https://www.fullhdfilmizlesene.tv";
  const headers$2 = {
    Referer: baseUrl$9,
    Accept: "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
  };
  function extractVidmoxy(body) {
    const regex = /eval\(function\(p,a,c,k,e,d\){.+}}return p}\((\\?'.+.split\(\\?'\|\\?'\)).+$/m;
    let decoded = body;
    let i2 = 0;
    while (decoded.includes("eval(")) {
      const decodedMatch = decoded.match(regex);
      if (!decodedMatch) {
        throw new NotFoundError("Decryption unsuccessful");
      }
      const parameters = extractPackerParams(i2 > 0 ? unescapeString(decodedMatch[1]) : decodedMatch[1]);
      if (!parameters) throw new NotFoundError("Decryption unsuccessful");
      decoded = decodeDeanEdwards(parameters);
      i2++;
    }
    const fileMatch = decoded.match(/"file":"(.+?)"/);
    if (!fileMatch) throw new NotFoundError("No playlist found");
    const playlistUrl = unescapeString(decodeHex(fileMatch[1]));
    return playlistUrl;
  }
  function extractAtom(body) {
    const fileMatch = body.match(/"file": av\('(.+)'\),$/m);
    if (!fileMatch) throw new NotFoundError("No playlist found");
    const playlistUrl = decodeAtom(fileMatch[1]);
    return playlistUrl;
  }
  async function scrapeMovie(ctx) {
    if (!ctx.media.imdbId) {
      throw new NotFoundError("IMDb id not provided");
    }
    const searchJson = await ctx.proxiedFetcher(
      `/autocomplete/q.php?q=${ctx.media.imdbId}`,
      {
        baseUrl: baseUrl$9,
        headers: headers$2
      }
    );
    ctx.progress(30);
    if (!searchJson.length) throw new NotFoundError("Media not found");
    const searchResult = searchJson[0];
    const mediaUrl = `/${searchResult.prefix}/${searchResult.dizilink}`;
    const mediaPage = await ctx.proxiedFetcher(mediaUrl, {
      baseUrl: baseUrl$9,
      headers: headers$2
    });
    const playerMatch = mediaPage.match(/var scx = {.+"t":\["(.+)"\]},/);
    if (!playerMatch) throw new NotFoundError("No source found");
    ctx.progress(60);
    const playerUrl2 = atob(rtt(playerMatch[1]));
    const isVidmoxy = playerUrl2.startsWith("https://vidmoxy.com");
    const playerResponse = await ctx.proxiedFetcher(playerUrl2 + (isVidmoxy ? "?vst=1" : ""), {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: baseUrl$9,
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-User": "?1",
        "Sec-GPC": "1",
        "Upgrade-Insecure-Requests": "1",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });
    ctx.progress(80);
    if (!playerResponse || playerResponse === "404") throw new NotFoundError("Player 404: Source is inaccessible");
    const playlistUrl = isVidmoxy ? extractVidmoxy(playerResponse) : extractAtom(playerResponse);
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          type: "hls",
          playlist: createM3U8ProxyUrl(playlistUrl, ctx.features, headers$2),
          headers: headers$2,
          flags: [flags.CORS_ALLOWED],
          captions: []
        }
      ]
    };
  }
  const fullhdfilmizleScraper = makeSourcerer({
    id: "fullhdfilmizle",
    name: "FullHDFilmizle (Turkish)",
    rank: 6,
    disabled: false,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie
  });
  function generateRandomFavs() {
    const randomHex = () => Math.floor(Math.random() * 16).toString(16);
    const generateSegment = (length) => Array.from({ length }, randomHex).join("");
    return `${generateSegment(8)}-${generateSegment(4)}-${generateSegment(4)}-${generateSegment(4)}-${generateSegment(
      12
    )}`;
  }
  function parseSubtitleLinks(inputString) {
    if (!inputString || typeof inputString === "boolean") return [];
    const linksArray = inputString.split(",");
    const captions = [];
    linksArray.forEach((link) => {
      const match = link.match(/\[([^\]]+)\](https?:\/\/\S+?)(?=,\[|$)/);
      if (match) {
        const type = getCaptionTypeFromUrl(match[2]);
        const language = labelToLanguageCode(match[1]);
        if (!type || !language) return;
        captions.push({
          id: match[2],
          language,
          hasCorsRestrictions: false,
          type,
          url: match[2]
        });
      }
    });
    return captions;
  }
  function parseVideoLinks(inputString) {
    if (!inputString) throw new NotFoundError("No video links found");
    try {
      const qualityMap = {};
      const links = inputString.split(",");
      links.forEach((link) => {
        const match = link.match(/\[([^\]]+)\](https?:\/\/[^\s,]+)/);
        if (match) {
          const [_, quality, url] = match;
          if (url === "null") return;
          const normalizedQuality = quality.replace(/<[^>]+>/g, "").toLowerCase().replace("p", "").trim();
          qualityMap[normalizedQuality] = {
            type: "mp4",
            url: url.trim()
          };
        }
      });
      const result = {};
      Object.entries(qualityMap).forEach(([quality, data]) => {
        const validQuality = getValidQualityFromString(quality);
        result[validQuality] = data;
      });
      return result;
    } catch (error) {
      console.error("Error parsing video links:", error);
      throw new NotFoundError("Failed to parse video links");
    }
  }
  const rezkaBase = "https://hdrezka.ag/";
  const baseHeaders = {
    "X-Hdrezka-Android-App": "1",
    "X-Hdrezka-Android-App-Version": "2.2.0",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    "CF-IPCountry": "RU"
  };
  async function searchAndFindMediaId(ctx) {
    const searchData = await ctx.proxiedFetcher(`/engine/ajax/search.php`, {
      baseUrl: rezkaBase,
      headers: baseHeaders,
      query: { q: ctx.media.title }
    });
    const $ = cheerio.load(searchData);
    const items = $("a").map((_, el) => {
      var _a2;
      const $el = $(el);
      const url = $el.attr("href");
      const titleText = $el.find("span.enty").text();
      const yearMatch = titleText.match(/\((\d{4})\)/) || (url == null ? void 0 : url.match(/-(\d{4})(?:-|\.html)/)) || titleText.match(/(\d{4})/);
      const itemYear = yearMatch ? yearMatch[1] : null;
      const id = (_a2 = url == null ? void 0 : url.match(/\/(\d+)-[^/]+\.html$/)) == null ? void 0 : _a2[1];
      if (id) {
        return {
          id,
          year: itemYear ? parseInt(itemYear, 10) : ctx.media.releaseYear,
          type: ctx.media.type,
          url: url || ""
        };
      }
      return null;
    }).get().filter(Boolean);
    items.sort((a, b) => {
      const diffA = Math.abs(a.year - ctx.media.releaseYear);
      const diffB = Math.abs(b.year - ctx.media.releaseYear);
      return diffA - diffB;
    });
    return items[0] || null;
  }
  async function getStream(id, translatorId, ctx) {
    const searchParams = new URLSearchParams();
    searchParams.append("id", id);
    searchParams.append("translator_id", translatorId);
    if (ctx.media.type === "show") {
      searchParams.append("season", ctx.media.season.number.toString());
      searchParams.append("episode", ctx.media.episode.number.toString());
    }
    searchParams.append("favs", generateRandomFavs());
    searchParams.append("action", ctx.media.type === "show" ? "get_stream" : "get_movie");
    searchParams.append("t", Date.now().toString());
    const response = await ctx.proxiedFetcher("/ajax/get_cdn_series/", {
      baseUrl: rezkaBase,
      method: "POST",
      body: searchParams,
      headers: {
        ...baseHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${rezkaBase}films/action/${id}-novokain-2025-latest.html`
      }
    });
    try {
      const data = JSON.parse(response);
      if (!data.url && data.success) {
        throw new NotFoundError("Movie found but no stream available (might be premium or not yet released)");
      }
      if (!data.url) {
        throw new NotFoundError("No stream URL found in response");
      }
      return data;
    } catch (error) {
      console.error("Error parsing stream response:", error);
      throw new NotFoundError("Failed to parse stream response");
    }
  }
  async function getTranslatorId(url, id, ctx) {
    const response = await ctx.proxiedFetcher(url, {
      headers: baseHeaders
    });
    if (response.includes(`data-translator_id="238"`)) {
      return "238";
    }
    const functionName = ctx.media.type === "movie" ? "initCDNMoviesEvents" : "initCDNSeriesEvents";
    const regexPattern = new RegExp(`sof\\.tv\\.${functionName}\\(${id}, ([^,]+)`, "i");
    const match = response.match(regexPattern);
    const translatorId = match ? match[1] : null;
    return translatorId;
  }
  const universalScraper$4 = async (ctx) => {
    const result = await searchAndFindMediaId(ctx);
    if (!result || !result.id) throw new NotFoundError("No result found");
    const translatorId = await getTranslatorId(result.url, result.id, ctx);
    if (!translatorId) throw new NotFoundError("No translator id found");
    const { url: streamUrl, subtitle: streamSubtitle } = await getStream(result.id, translatorId, ctx);
    const parsedVideos = parseVideoLinks(streamUrl);
    const parsedSubtitles = parseSubtitleLinks(streamSubtitle);
    ctx.progress(90);
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          type: "file",
          flags: [flags.CORS_ALLOWED, flags.IP_LOCKED],
          captions: parsedSubtitles,
          qualities: parsedVideos
        }
      ]
    };
  };
  const hdRezkaScraper = makeSourcerer({
    id: "hdrezka",
    name: "HDRezka",
    rank: 105,
    flags: [flags.CORS_ALLOWED, flags.IP_LOCKED],
    scrapeShow: universalScraper$4,
    scrapeMovie: universalScraper$4
  });
  async function getVideoSources(ctx, id, media) {
    let path = "";
    if (media.type === "show") {
      path = `/v1/episodes/view`;
    } else if (media.type === "movie") {
      path = `/v1/movies/view`;
    }
    const data = await ctx.proxiedFetcher(path, {
      baseUrl: baseUrl$8,
      query: { expand: "streams,subtitles", id }
    });
    return data;
  }
  async function getVideo(ctx, id, media) {
    const data = await getVideoSources(ctx, id, media);
    const videoSources = data.streams;
    const opts = ["auto", "1080p", "1080", "720p", "720", "480p", "480", "240p", "240", "360p", "360", "144", "144p"];
    let videoUrl = null;
    for (const res of opts) {
      if (videoSources[res] && !videoUrl) {
        videoUrl = videoSources[res];
      }
    }
    let captions = [];
    for (const sub of data.subtitles) {
      const language = labelToLanguageCode(sub.language);
      if (!language) continue;
      captions.push({
        id: sub.url,
        type: "vtt",
        url: `${baseUrl$8}${sub.url}`,
        hasCorsRestrictions: false,
        language
      });
    }
    captions = removeDuplicatedLanguages(captions);
    return {
      playlist: videoUrl,
      captions
    };
  }
  const baseUrl$8 = "https://lmscript.xyz";
  async function searchAndFindMedia(ctx, media) {
    if (media.type === "show") {
      const searchRes = await ctx.proxiedFetcher(`/v1/shows`, {
        baseUrl: baseUrl$8,
        query: { "filters[q]": media.title }
      });
      const results = searchRes.items;
      const result = results.find((res) => compareMedia(media, res.title, Number(res.year)));
      return result;
    }
    if (media.type === "movie") {
      const searchRes = await ctx.proxiedFetcher(`/v1/movies`, {
        baseUrl: baseUrl$8,
        query: { "filters[q]": media.title }
      });
      const results = searchRes.items;
      const result = results.find((res) => compareMedia(media, res.title, Number(res.year)));
      return result;
    }
  }
  async function scrape$1(ctx, media, result) {
    var _a2;
    let id = null;
    if (media.type === "movie") {
      id = result.id_movie;
    } else if (media.type === "show") {
      const data = await ctx.proxiedFetcher(`/v1/shows`, {
        baseUrl: baseUrl$8,
        query: { expand: "episodes", id: result.id_show }
      });
      const episode = (_a2 = data.episodes) == null ? void 0 : _a2.find((v) => {
        return Number(v.season) === Number(media.season.number) && Number(v.episode) === Number(media.episode.number);
      });
      if (episode) id = episode.id;
    }
    if (id === null) throw new NotFoundError("Not found");
    const video = await getVideo(ctx, id, media);
    return video;
  }
  async function universalScraper$3(ctx) {
    const lookmovieData = await searchAndFindMedia(ctx, ctx.media);
    if (!lookmovieData) throw new NotFoundError("Media not found");
    ctx.progress(30);
    const video = await scrape$1(ctx, ctx.media, lookmovieData);
    if (!video.playlist) throw new NotFoundError("No video found");
    ctx.progress(60);
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          playlist: video.playlist,
          type: "hls",
          flags: [flags.IP_LOCKED],
          captions: video.captions
        }
      ]
    };
  }
  const lookmovieScraper = makeSourcerer({
    id: "lookmovie",
    name: "LookMovie",
    disabled: false,
    rank: 170,
    flags: [flags.IP_LOCKED],
    scrapeShow: universalScraper$3,
    scrapeMovie: universalScraper$3
  });
  const baseUrl$7 = "https://movies4f.com";
  const headers$1 = {
    Referer: "https://movies4f.com/",
    Origin: "https://movies4f.com",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  };
  async function comboScraper$c(ctx) {
    let searchQuery = encodeURIComponent(ctx.media.title);
    let searchUrl = `${baseUrl$7}/search?q=${searchQuery}`;
    let searchPage = await ctx.proxiedFetcher(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      }
    });
    if (!searchPage.includes("/film/")) {
      searchQuery = encodeURIComponent(`${ctx.media.title} ${ctx.media.releaseYear}`);
      searchUrl = `${baseUrl$7}/search?q=${searchQuery}`;
      searchPage = await ctx.proxiedFetcher(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        }
      });
    }
    ctx.progress(40);
    let filmUrl = null;
    const filmCardRegex = /<a[^>]*href="([^"]*\/film\/\d+\/[^"]*)"[^>]*class="[^"]*poster[^"]*"[^>]*>[\s\S]*?<img[^>]*alt="([^"]*)"[^>]*>/g;
    let filmMatch;
    for (; ; ) {
      filmMatch = filmCardRegex.exec(searchPage);
      if (filmMatch === null) break;
      const link = filmMatch[1];
      const title = filmMatch[2];
      const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
      const normalizedSearchTitle = ctx.media.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normalizedTitle.includes(normalizedSearchTitle)) {
        if (ctx.media.type === "show") {
          const episode = ctx.media.episode.number;
          const episodeUrl = `${baseUrl$7}${link}/episode-${episode}`;
          if (title.toLowerCase().includes("season") || link.includes("/film/")) {
            filmUrl = episodeUrl;
            break;
          }
        } else {
          filmUrl = `${baseUrl$7}${link}`;
          break;
        }
      }
    }
    if (!filmUrl) {
      throw new NotFoundError("No matching film found in search results");
    }
    ctx.progress(50);
    const filmPage = await ctx.proxiedFetcher(filmUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      }
    });
    ctx.progress(60);
    const $film = cheerio.load(filmPage);
    const iframeSrc = $film("iframe#iframeStream").attr("src");
    if (!iframeSrc) {
      throw new NotFoundError("No embed iframe found");
    }
    const embedUrl = new URL(iframeSrc);
    const videoId = embedUrl.searchParams.get("id");
    if (!videoId) {
      throw new NotFoundError("No video ID found in embed URL");
    }
    ctx.progress(70);
    const tokenResponse = await ctx.proxiedFetcher("https://moviking.childish2x2.fun/geturl", {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=----geckoformboundaryc5f480bcac13a77346dab33881da6bfb",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: iframeSrc
      },
      body: `------geckoformboundaryc5f480bcac13a77346dab33881da6bfb
Content-Disposition: form-data; name="renderer"

ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar
------geckoformboundaryc5f480bcac13a77346dab33881da6bfb
Content-Disposition: form-data; name="id"

6164426f797cf4b2fe93e4b20c0a4338
------geckoformboundaryc5f480bcac13a77346dab33881da6bfb
Content-Disposition: form-data; name="videoId"

${videoId}
------geckoformboundaryc5f480bcac13a77346dab33881da6bfb
Content-Disposition: form-data; name="domain"

${baseUrl$7}/
------geckoformboundaryc5f480bcac13a77346dab33881da6bfb--`
    });
    ctx.progress(80);
    const tokenMatch = tokenResponse.match(/token1=(\w+)&token2=(\w+)&token3=(\w+)/);
    if (!tokenMatch) {
      throw new NotFoundError("Failed to extract tokens");
    }
    const [, token1, token2, token3] = tokenMatch;
    const streamingUrl = `https://cdn4.zenty.store/streaming?id=${videoId}&web=movies4f.com&token1=${token1}&token2=${token2}&token3=${token3}&cdn=https%3A%2F%2Fcdn4.zenty.store&lang=en`;
    const streamingPage = await ctx.proxiedFetcher(streamingUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://moviking.childish2x2.fun/"
      }
    });
    ctx.progress(90);
    const urlRegex = /url = '([^']+)'/;
    const urlMatch = streamingPage.match(urlRegex);
    if (!urlMatch) {
      throw new NotFoundError("Failed to extract stream URL from streaming page");
    }
    const streamBaseUrl = urlMatch[1];
    const videoIdMatch = streamingUrl.match(/id=([^&]+)/);
    if (!videoIdMatch) {
      throw new NotFoundError("Failed to extract videoId from streaming URL");
    }
    const streamVideoId = videoIdMatch[1];
    const streamUrl = `${streamBaseUrl}${streamVideoId}/?token1=${token1}&token3=${token3}`;
    ctx.progress(95);
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          type: "hls",
          playlist: streamUrl,
          headers: headers$1,
          flags: [flags.CORS_ALLOWED],
          captions: []
        }
      ]
    };
  }
  const movies4fScraper = makeSourcerer({
    id: "movies4f",
    name: "M4F",
    rank: 166,
    disabled: true,
    flags: [],
    scrapeMovie: comboScraper$c,
    scrapeShow: comboScraper$c
  });
  const GEMINI_BASE_URL = "https://gemini.aether.mom/v1beta/models/gemini-2.5-flash-lite:generateContent";
  function buildPrompt(media, searchResults) {
    const seasons = media.season.number > 1 ? ` and has ${media.season.number} seasons` : "";
    const prompt = `
    You are an AI that matches TMDB movie and show data to myanime search results.
    The user is searching for "${media.title}" which was released in ${media.releaseYear}${seasons}.
    The user is looking for season ${media.season.number} (TMDB title: "${media.season.title}", ${media.season.episodeCount ?? "unknown"} episodes), episode ${media.episode.number}.

    Here are the search results from myanime:
    ${JSON.stringify(searchResults, null, 2)}

    IMPORTANT: Some shows on TMDB have continuous episode numbering across seasons (e.g., episode 25 is the first episode of season 2), but myanime lists seasons as separate entries with their own episode counts. The myanime entry may also have a different title (e.g., "Mugen Train Arc").
    To solve this, please return a JSON object with a "results" array that contains ALL entries from the search results that match the requested show, including all of its seasons, even if the user is only asking for one.
    Each object in the "results" array should have the "id" of the matching anime from the myanime search results, and the "season" number. You must determine the season number for each entry based on its title.
    The results MUST be sorted by season number in ascending order so the calling code can correctly map the episode number.
    Pay close attention to the season title and episode counts from both TMDB and the myanime results to find the best match. If TMDB combines seasons into one, you must split them based on the episode counts in the search results.
    Use the TMDB season title as the primary key for matching, and do not assign the same season number to different arcs.
    Your response must only be the raw JSON object, without any markdown formatting, comments, or other text.
  `;
    return prompt.trim();
  }
  async function getAiMatching(ctx, media, searchResults) {
    try {
      const prompt = buildPrompt(media, searchResults);
      const response = await ctx.fetcher(GEMINI_BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      const text = response.candidates[0].content.parts[0].text;
      const firstBracket = text.indexOf("{");
      const lastBracket = text.lastIndexOf("}");
      if (firstBracket === -1 || lastBracket === -1) {
        throw new Error("Invalid AI response: No JSON object found");
      }
      const jsonString = text.substring(firstBracket, lastBracket + 1);
      const data = JSON.parse(jsonString);
      if (!data.results || !Array.isArray(data.results)) {
        throw new Error("Invalid AI response format");
      }
      return data;
    } catch (error) {
      if (error instanceof Error) {
        ctx.progress(0);
      }
      return null;
    }
  }
  const showScraper = async (ctx) => {
    var _a2, _b2, _c2;
    const title = await getAnilistEnglishTitle(ctx, ctx.media);
    if (!title) throw new NotFoundError("Anime not found");
    const allAnimes = [];
    for (const t of [ctx.media.title, title]) {
      try {
        const searchResult = await ctx.proxiedFetcher(
          `https://anime.aether.mom/api/search?keyword=${encodeURIComponent(t)}`
        );
        if ((_a2 = searchResult == null ? void 0 : searchResult.results) == null ? void 0 : _a2.data) {
          allAnimes.push(...searchResult.results.data);
        }
      } catch (err) {
      }
    }
    const uniqueAnimes = [...new Map(allAnimes.map((item) => [item.id, item])).values()];
    if (uniqueAnimes.length === 0) throw new NotFoundError("Anime not found");
    const tvAnimes = uniqueAnimes.filter((v) => v.tvInfo.showType === "TV");
    const aiResult = await getAiMatching(ctx, ctx.media, tvAnimes);
    let seasons = [];
    if (aiResult && aiResult.results.length > 0) {
      seasons = aiResult.results.map((v) => {
        const anime = tvAnimes.find((a) => a.id === v.id);
        if (!anime) return null;
        return {
          ...anime,
          seasonNum: v.season ?? 1
        };
      }).filter((v) => v !== null).sort((a, b) => a.seasonNum - b.seasonNum);
    }
    if (seasons.length === 0) throw new NotFoundError("Anime not found");
    let episodeId;
    let season = seasons.find((v) => v.seasonNum === ctx.media.season.number);
    const seasonEntries = seasons.filter((v) => v.seasonNum === ctx.media.season.number);
    if (seasonEntries.length > 1) {
      const sorted = seasonEntries.sort((a, b) => {
        const aTitleText = a.title;
        const bTitleText = b.title;
        const targetTitle = ctx.media.season.title;
        return Number(compareTitle(bTitleText, targetTitle)) - Number(compareTitle(aTitleText, targetTitle));
      });
      season = sorted[0];
    }
    if (season) {
      const episodeData = await ctx.proxiedFetcher(`https://anime.aether.mom/api/episodes/${season.id}`);
      if ((_b2 = episodeData == null ? void 0 : episodeData.results) == null ? void 0 : _b2.episodes) {
        const episode = episodeData.results.episodes.find((ep) => ep.episode_no === ctx.media.episode.number);
        if (episode) episodeId = episode.id;
      }
    }
    if (!episodeId) {
      let episodeNumber = ctx.media.episode.number;
      for (const s of seasons) {
        const epCount = s.tvInfo.sub ?? 0;
        if (episodeNumber <= epCount) {
          const targetEpisodeNumber = episodeNumber;
          const episodeData = await ctx.proxiedFetcher(`https://anime.aether.mom/api/episodes/${s.id}`);
          if ((_c2 = episodeData == null ? void 0 : episodeData.results) == null ? void 0 : _c2.episodes) {
            const episode = episodeData.results.episodes.find((ep) => ep.episode_no === targetEpisodeNumber);
            if (episode) {
              episodeId = episode.id;
              break;
            }
          }
        }
        if (episodeId) break;
        episodeNumber -= epCount;
      }
    }
    if (!episodeId) throw new NotFoundError("Episode not found");
    return {
      embeds: [
        {
          embedId: "myanimesub",
          url: episodeId
        },
        {
          embedId: "myanimedub",
          url: episodeId
        }
      ]
    };
  };
  const universalScraper$2 = async (ctx) => {
    const searchResults = await ctx.proxiedFetcher(
      `https://anime.aether.mom/api/search?keyword=${encodeURIComponent(ctx.media.title)}`
    );
    const movie = searchResults.results.data.find((v) => v.tvInfo.showType === "Movie");
    if (!movie) throw new NotFoundError("No watchable sources found");
    const episodeData = await ctx.proxiedFetcher(`https://anime.aether.mom/api/episodes/${movie.id}`);
    const episode = episodeData.results.episodes.find((e) => e.episode_no === 1);
    if (!episode) throw new NotFoundError("No watchable sources found");
    return {
      embeds: [
        {
          embedId: "myanimesub",
          url: episode.id
        },
        {
          embedId: "myanimedub",
          url: episode.id
        }
      ]
    };
  };
  const myanimeScraper = makeSourcerer({
    id: "myanime",
    name: "MyAnime",
    rank: 113,
    disabled: true,
    // disabled since AI api is not privated
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: universalScraper$2,
    scrapeShow: showScraper
  });
  const mamaApiBase = "https://mama.up.railway.app/api/showbox";
  const getUserToken = () => {
    try {
      return typeof window !== "undefined" ? window.localStorage.getItem("febbox_ui_token") : null;
    } catch (e) {
      console.warn("Unable to access localStorage:", e);
      return null;
    }
  };
  async function comboScraper$b(ctx) {
    const userToken = getUserToken();
    const apiUrl = ctx.media.type === "movie" ? `${mamaApiBase}/movie/${ctx.media.tmdbId}?token=${userToken}` : `${mamaApiBase}/tv/${ctx.media.tmdbId}?season=${ctx.media.season.number}&episode=${ctx.media.episode.number}&token=${userToken}`;
    const apiRes = await ctx.proxiedFetcher(apiUrl);
    if (!apiRes) {
      throw new NotFoundError("No response from API");
    }
    const data = await apiRes;
    if (!data.success) {
      throw new NotFoundError("No streams found");
    }
    const streamItems = Array.isArray(data.streams) ? data.streams : [data.streams];
    if (streamItems.length === 0 || !streamItems[0].player_streams) {
      throw new NotFoundError("No valid streams found");
    }
    let bestStreamItem = streamItems[0];
    for (const item of streamItems) {
      if (item.quality.includes("4K") || item.quality.includes("2160p")) {
        bestStreamItem = item;
        break;
      }
    }
    const streams = bestStreamItem.player_streams.reduce((acc, stream) => {
      let qualityKey;
      if (stream.quality === "4K" || stream.quality.includes("4K")) {
        qualityKey = 2160;
      } else if (stream.quality === "ORG" || stream.quality.includes("ORG")) {
        return acc;
      } else {
        qualityKey = parseInt(stream.quality.replace("P", ""), 10);
      }
      if (Number.isNaN(qualityKey) || acc[qualityKey]) return acc;
      acc[qualityKey] = stream.file;
      return acc;
    }, {});
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          captions: [],
          qualities: {
            ...streams[2160] && {
              "4k": {
                type: "mp4",
                url: streams[2160]
              }
            },
            ...streams[1080] && {
              1080: {
                type: "mp4",
                url: streams[1080]
              }
            },
            ...streams[720] && {
              720: {
                type: "mp4",
                url: streams[720]
              }
            },
            ...streams[480] && {
              480: {
                type: "mp4",
                url: streams[480]
              }
            },
            ...streams[360] && {
              360: {
                type: "mp4",
                url: streams[360]
              }
            }
          },
          type: "file",
          flags: [flags.CORS_ALLOWED]
        }
      ]
    };
  }
  const nunflixScraper = makeSourcerer({
    id: "nunflix",
    name: "NFlix",
    rank: 155,
    disabled: !getUserToken(),
    // disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$b,
    scrapeShow: comboScraper$b
  });
  const baseUrl$6 = "https://ww3.pelisplus.to";
  const TMDB_API_KEY = (typeof process !== "undefined" && ((_c = process.env) == null ? void 0 : _c.EXPO_PUBLIC_TMDB_API_KEY) || typeof process !== "undefined" && ((_d = process.env) == null ? void 0 : _d.MOVIE_WEB_TMDB_API_KEY) || "").trim();
  function normalizeTitle(title) {
    return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s-]/gi, "").replace(/\s+/g, "-").replace(/-+/g, "-");
  }
  function decodeBase64(str) {
    try {
      return atob(str);
    } catch {
      return "";
    }
  }
  function fetchUrls(text) {
    if (!text) return [];
    const linkRegex2 = /(http|ftp|https):\/\/([\w_-]+(?:(?:\.[\w_-]+)+))([\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])/g;
    return Array.from(text.matchAll(linkRegex2)).map((m) => m[0].replace(/^"+|"+$/g, ""));
  }
  async function resolvePlayerUrl(ctx, url) {
    try {
      const html = await ctx.proxiedFetcher(url);
      const $ = cheerio.load(html);
      const script = $('script:contains("window.onload")').html() || "";
      return fetchUrls(script)[0] || "";
    } catch {
      return "";
    }
  }
  async function extractVidhideEmbed(ctx, $) {
    const regIsUrl = /^https?:\/\/([\w.-]+\.[a-z]{2,})(\/.*)?$/i;
    const playerLinks = [];
    $(".bg-tabs ul li").each((idx, el) => {
      var _a2, _b2;
      const li = $(el);
      const langBtn = (_b2 = (_a2 = li.parent()) == null ? void 0 : _a2.parent()) == null ? void 0 : _b2.find("button").first().text().trim().toLowerCase();
      const dataServer = li.attr("data-server") || "";
      const decoded = decodeBase64(dataServer);
      const url = regIsUrl.test(decoded) ? decoded : `${baseUrl$6}/player/${btoa(dataServer)}`;
      playerLinks.push({ idx, langBtn, url });
    });
    const results = [];
    for (const link of playerLinks) {
      let realUrl = link.url;
      if (realUrl.includes("/player/")) {
        realUrl = await resolvePlayerUrl(ctx, realUrl);
      }
      if (/vidhide/i.test(realUrl)) {
        let embedId = "vidhide";
        if (link.langBtn.includes("latino")) embedId = "vidhide-latino";
        else if (link.langBtn.includes("castellano") || link.langBtn.includes("español")) embedId = "vidhide-spanish";
        else if (link.langBtn.includes("ingles") || link.langBtn.includes("english")) embedId = "vidhide-english";
        results.push({ embedId, url: realUrl });
      }
    }
    return results;
  }
  async function fetchTmdbTitleInSpanish(tmdbId, apiKey, mediaType) {
    const endpoint = mediaType === "movie" ? `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&language=es-ES` : `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${apiKey}&language=es-ES`;
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Error fetching TMDB data: ${response.statusText}`);
    }
    const tmdbData = await response.json();
    return mediaType === "movie" ? tmdbData.title : tmdbData.name;
  }
  async function fallbackSearchByGithub(ctx) {
    var _a2, _b2;
    const tmdbId = ctx.media.tmdbId;
    const mediaType = ctx.media.type;
    if (!tmdbId) return [];
    const jsonFile = mediaType === "movie" ? "pelisplushd_movies.json" : "pelisplushd_series.json";
    let fallbacks = {};
    try {
      const url = `https://raw.githubusercontent.com/moonpic/fixed-titles/main/${jsonFile}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error();
      fallbacks = await response.json();
    } catch {
      return [];
    }
    const fallbackTitle = fallbacks[tmdbId.toString()];
    if (!fallbackTitle) return [];
    const normalizedTitle = normalizeTitle(fallbackTitle);
    const pageUrl = mediaType === "movie" ? `${baseUrl$6}/pelicula/${normalizedTitle}` : `${baseUrl$6}/serie/${normalizedTitle}/season/${(_a2 = ctx.media.season) == null ? void 0 : _a2.number}/episode/${(_b2 = ctx.media.episode) == null ? void 0 : _b2.number}`;
    let html = "";
    try {
      html = await ctx.proxiedFetcher(pageUrl);
    } catch {
      return [];
    }
    const $ = cheerio.load(html);
    return extractVidhideEmbed(ctx, $);
  }
  async function comboScraper$a(ctx) {
    var _a2, _b2;
    const mediaType = ctx.media.type;
    const tmdbId = ctx.media.tmdbId;
    if (!TMDB_API_KEY) {
      throw new NotFoundError("Missing TMDB API key. Set EXPO_PUBLIC_TMDB_API_KEY.");
    }
    if (!tmdbId) throw new NotFoundError("TMDB ID is required to fetch the title in Spanish");
    let translatedTitle = "";
    try {
      translatedTitle = await fetchTmdbTitleInSpanish(Number(tmdbId), TMDB_API_KEY, mediaType);
    } catch {
      throw new NotFoundError("Could not get the title from TMDB");
    }
    const normalizedTitle = normalizeTitle(translatedTitle);
    const pageUrl = mediaType === "movie" ? `${baseUrl$6}/pelicula/${normalizedTitle}` : `${baseUrl$6}/serie/${normalizedTitle}/season/${(_a2 = ctx.media.season) == null ? void 0 : _a2.number}/episode/${(_b2 = ctx.media.episode) == null ? void 0 : _b2.number}`;
    ctx.progress(60);
    let html = "";
    try {
      html = await ctx.proxiedFetcher(pageUrl);
    } catch {
      html = "";
    }
    let embeds = [];
    if (html) {
      const $ = cheerio.load(html);
      try {
        embeds = await extractVidhideEmbed(ctx, $);
      } catch {
        embeds = [];
      }
    }
    if (!embeds.length) {
      embeds = await fallbackSearchByGithub(ctx);
    }
    if (!embeds.length) {
      throw new NotFoundError("No vidhide embed found in PelisPlusHD");
    }
    return { embeds };
  }
  const pelisplushdScraper = makeSourcerer({
    id: "pelisplushd",
    name: "PelisPlusHD",
    rank: 75,
    flags: [flags.IP_LOCKED],
    // Vidhide embeds are IP locked
    scrapeMovie: comboScraper$a,
    scrapeShow: comboScraper$a
  });
  async function comboScraper$9(ctx) {
    let apiUrl;
    if (ctx.media.type === "movie") {
      if (!ctx.media.imdbId) throw new NotFoundError("IMDB ID required for movies");
      apiUrl = `https://primewire.pstream.mov/movie/${ctx.media.imdbId}`;
    } else {
      if (!ctx.media.imdbId) throw new NotFoundError("IMDB ID required for TV shows");
      apiUrl = `https://primewire.pstream.mov/tv/${ctx.media.imdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;
    }
    ctx.progress(30);
    const response = await ctx.fetcher(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
      }
    });
    if (!response.streams || !Array.isArray(response.streams) || response.streams.length === 0) {
      throw new NotFoundError("No streams found");
    }
    ctx.progress(60);
    const embeds = [];
    for (const stream of response.streams) {
      if (!stream.link || !stream.quality) continue;
      let mirrorContext;
      if (stream.type === "m3u8") {
        mirrorContext = {
          type: "hls",
          stream: stream.link,
          headers: stream.headers || [],
          captions: [],
          flags: !stream.headers || Object.keys(stream.headers).length === 0 ? [flags.CORS_ALLOWED] : []
        };
      } else {
        let qualityKey;
        if (stream.quality === "ORG") {
          const urlPath = stream.link.split("?")[0];
          if (urlPath.toLowerCase().endsWith(".mp4")) {
            qualityKey = "unknown";
          } else {
            continue;
          }
        } else if (stream.quality === "4K") {
          qualityKey = "4k";
        } else {
          const parsed = parseInt(stream.quality.replace("P", ""), 10);
          if (Number.isNaN(parsed)) continue;
          qualityKey = parsed.toString();
        }
        mirrorContext = {
          type: "file",
          qualities: {
            [qualityKey === "unknown" || qualityKey === "4k" ? qualityKey : parseInt(qualityKey, 10)]: {
              type: "mp4",
              url: stream.link
            }
          },
          flags: !stream.headers || Object.keys(stream.headers).length === 0 ? [flags.CORS_ALLOWED] : [],
          headers: stream.headers || [],
          captions: []
        };
      }
      embeds.push({
        embedId: "mirror",
        url: JSON.stringify(mirrorContext)
      });
    }
    if (embeds.length === 0) {
      throw new NotFoundError("No valid streams found");
    }
    ctx.progress(90);
    return { embeds };
  }
  const primewireScraper = makeSourcerer({
    id: "primewire",
    name: "PrimeWire 🔥",
    rank: 206,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$9,
    scrapeShow: comboScraper$9
  });
  const baseApiUrl = "https://primesrc.me/api/v1/";
  const nameToEmbedId = {
    Filelions: "filelions",
    Dood: "dood",
    Streamwish: "streamwish-english",
    Filemoon: "filemoon",
    Voe: "voe",
    Mixdrop: "mixdrop"
  };
  function extractLinkFromPrimeSrcResponse(body) {
    if (typeof body === "string") {
      const trimmed = body.trim();
      try {
        const parsed = JSON.parse(trimmed);
        if ((parsed == null ? void 0 : parsed.link) && typeof parsed.link === "string") return parsed.link;
      } catch {
      }
      if (/^https?:\/\//i.test(trimmed)) return trimmed;
      const m = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
      return (m == null ? void 0 : m[0]) ?? null;
    }
    if (body && typeof body === "object") {
      const anyBody = body;
      if (typeof anyBody.link === "string") return anyBody.link;
      if (typeof anyBody.url === "string") return anyBody.url;
      if (anyBody.data && typeof anyBody.data.link === "string") return anyBody.data.link;
    }
    return null;
  }
  async function comboScraper$8(ctx) {
    const url = ctx.media.type === "movie" ? `${baseApiUrl}s?tmdb=${ctx.media.tmdbId}&type=movie` : `${baseApiUrl}s?tmdb=${ctx.media.tmdbId}&season=${ctx.media.season.number}&episode=${ctx.media.episode.number}&type=tv`;
    let data;
    try {
      data = await ctx.proxiedFetcher(url);
    } catch {
      return { embeds: [] };
    }
    if (!(data == null ? void 0 : data.servers) || !Array.isArray(data.servers)) {
      return { embeds: [] };
    }
    ctx.progress(30);
    const seenTypes = /* @__PURE__ */ new Set();
    const serversToFetch = [];
    for (const server of data.servers) {
      if (!server.name || !server.key) continue;
      const embedId = nameToEmbedId[server.name];
      if (!embedId || seenTypes.has(embedId)) continue;
      seenTypes.add(embedId);
      serversToFetch.push({ embedId, key: server.key });
    }
    ctx.progress(50);
    const results = await Promise.allSettled(
      serversToFetch.map(async ({ embedId, key }) => {
        const linkBody = await ctx.proxiedFetcher(`${baseApiUrl}l?key=${key}`);
        return { embedId, url: extractLinkFromPrimeSrcResponse(linkBody) };
      })
    );
    ctx.progress(90);
    const embeds = results.filter((r) => r.status === "fulfilled" && typeof r.value.url === "string" && r.value.url.length > 0).map((r) => {
      const v = r.value;
      return { embedId: v.embedId, url: v.url };
    });
    return { embeds };
  }
  const primesrcScraper = makeSourcerer({
    id: "primesrc",
    name: "PrimeSrc",
    rank: 190,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$8,
    scrapeShow: comboScraper$8
  });
  const baseUrl$5 = "api.rgshows.ru";
  const headers = {
    referer: "https://rgshows.ru/",
    origin: "https://rgshows.ru",
    host: baseUrl$5,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
  };
  async function comboScraper$7(ctx) {
    var _a2;
    let url = `https://${baseUrl$5}/main`;
    if (ctx.media.type === "movie") {
      url += `/movie/${ctx.media.tmdbId}`;
    } else if (ctx.media.type === "show") {
      url += `/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;
    }
    const res = await ctx.proxiedFetcher(url, { headers });
    if (!((_a2 = res == null ? void 0 : res.stream) == null ? void 0 : _a2.url)) {
      throw new NotFoundError("No streams found");
    }
    if (res.stream.url === "https://vidzee.wtf/playlist/69/master.m3u8") {
      throw new NotFoundError("Found only vidzee porn stream");
    }
    const streamUrl = res.stream.url;
    const streamHost = new URL(streamUrl).host;
    const m3u8Headers = {
      ...headers,
      host: streamHost,
      origin: "https://www.rgshows.ru",
      referer: "https://www.rgshows.ru/"
    };
    ctx.progress(100);
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          type: "hls",
          playlist: streamUrl,
          headers: m3u8Headers,
          flags: [],
          captions: []
        }
      ]
    };
  }
  const rgshowsScraper = makeSourcerer({
    id: "rgshows",
    name: "RGShows",
    rank: 176,
    flags: [],
    scrapeMovie: comboScraper$7,
    scrapeShow: comboScraper$7
  });
  const ridoMoviesBase = `https://ridomovies.tv`;
  const ridoMoviesApiBase = `${ridoMoviesBase}/core/api`;
  const universalScraper$1 = async (ctx) => {
    const searchResult = await ctx.proxiedFetcher("/search", {
      baseUrl: ridoMoviesApiBase,
      query: {
        q: ctx.media.title
      }
    });
    const mediaData = searchResult.data.items.map((movieEl) => {
      const name = movieEl.title;
      const year = movieEl.contentable.releaseYear;
      const fullSlug = movieEl.fullSlug;
      return { name, year, fullSlug };
    });
    const targetMedia = mediaData.find((m) => m.name === ctx.media.title && m.year === ctx.media.releaseYear.toString());
    if (!(targetMedia == null ? void 0 : targetMedia.fullSlug)) throw new NotFoundError("No watchable item found");
    ctx.progress(40);
    let iframeSourceUrl = `/${targetMedia.fullSlug}/videos`;
    if (ctx.media.type === "show") {
      const showPageResult = await ctx.proxiedFetcher(`/${targetMedia.fullSlug}`, {
        baseUrl: ridoMoviesBase
      });
      const fullEpisodeSlug = `season-${ctx.media.season.number}/episode-${ctx.media.episode.number}`;
      const regexPattern = new RegExp(
        `\\\\"id\\\\":\\\\"(\\d+)\\\\"(?=.*?\\\\\\"fullSlug\\\\\\":\\\\\\"[^"]*${fullEpisodeSlug}[^"]*\\\\\\")`,
        "g"
      );
      const matches = [...showPageResult.matchAll(regexPattern)];
      const episodeIds = matches.map((match) => match[1]);
      if (episodeIds.length === 0) throw new NotFoundError("No watchable item found");
      const episodeId = episodeIds[episodeIds.length - 1];
      iframeSourceUrl = `/episodes/${episodeId}/videos`;
    }
    const iframeSource = await ctx.proxiedFetcher(iframeSourceUrl, {
      baseUrl: ridoMoviesApiBase
    });
    const iframeSource$ = cheerio.load(iframeSource.data[0].url);
    const iframeUrl = iframeSource$("iframe").attr("data-src");
    if (!iframeUrl) throw new NotFoundError("No watchable item found");
    ctx.progress(60);
    const embeds = [];
    if (iframeUrl.includes("closeload")) {
      embeds.push({
        embedId: closeLoadScraper.id,
        url: iframeUrl
      });
    }
    if (iframeUrl.includes("ridoo")) {
      embeds.push({
        embedId: ridooScraper.id,
        url: iframeUrl
      });
    }
    ctx.progress(90);
    return {
      embeds
    };
  };
  const ridooMoviesScraper = makeSourcerer({
    id: "ridomovies",
    name: "RidoMovies",
    rank: 210,
    flags: [],
    disabled: false,
    scrapeMovie: universalScraper$1,
    scrapeShow: universalScraper$1
  });
  const baseUrl$4 = "https://pupp.slidemovies-dev.workers.dev";
  async function comboScraper$6(ctx) {
    const watchPageUrl = ctx.media.type === "movie" ? `${baseUrl$4}/movie/${ctx.media.tmdbId}` : `${baseUrl$4}/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/-${ctx.media.episode.number}`;
    const watchPage = await ctx.proxiedFetcher(watchPageUrl);
    const $ = cheerio.load(watchPage);
    ctx.progress(50);
    const proxiedStreamUrl = $("media-player").attr("src");
    if (!proxiedStreamUrl) {
      throw new NotFoundError("Stream URL not found");
    }
    const proxyUrl = new URL(proxiedStreamUrl);
    const encodedUrl = proxyUrl.searchParams.get("url") || "";
    const playlist = decodeURIComponent(encodedUrl);
    const captions = $("media-provider track").map((_, el) => {
      const url = $(el).attr("src") || "";
      const rawLang = $(el).attr("lang") || "unknown";
      const languageCode = labelToLanguageCode(rawLang) || rawLang;
      const isVtt = url.endsWith(".vtt") ? "vtt" : "srt";
      return {
        type: isVtt,
        id: url,
        url,
        language: languageCode,
        hasCorsRestrictions: false
      };
    }).get();
    ctx.progress(90);
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          type: "hls",
          flags: [],
          playlist,
          captions
        }
      ]
    };
  }
  const slidemoviesScraper = makeSourcerer({
    id: "slidemovies",
    name: "SlideMovies",
    rank: 135,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$6,
    scrapeShow: comboScraper$6
  });
  async function convertPlaylistsToDataUrls(fetcher, playlistUrl, headers2) {
    const playlistData = await fetcher(playlistUrl, { headers: headers2 });
    const playlist = hlsParser.parse(playlistData);
    if (playlist.isMasterPlaylist) {
      const baseUrl2 = new URL(playlistUrl).origin;
      await Promise.all(
        playlist.variants.map(async (variant) => {
          let variantUrl = variant.uri;
          if (!variantUrl.startsWith("http")) {
            if (!variantUrl.startsWith("/")) {
              variantUrl = `/${variantUrl}`;
            }
            variantUrl = baseUrl2 + variantUrl;
          }
          const variantPlaylistData = await fetcher(variantUrl, { headers: headers2 });
          const variantPlaylist = hlsParser.parse(variantPlaylistData);
          variant.uri = `data:application/vnd.apple.mpegurl;base64,${btoa(hlsParser.stringify(variantPlaylist))}`;
        })
      );
    }
    return `data:application/vnd.apple.mpegurl;base64,${btoa(hlsParser.stringify(playlist))}`;
  }
  const baseUrl$3 = "https://soaper.cc";
  const universalScraper = async (ctx) => {
    var _a2;
    const searchResult = await ctx.proxiedFetcher("/search.html", {
      baseUrl: baseUrl$3,
      query: {
        keyword: ctx.media.title
      }
    });
    const search$ = cheerio.load(searchResult);
    const searchResults = [];
    search$(".thumbnail").each((_, element) => {
      const title = search$(element).find("h5").find("a").first().text().trim();
      const year = search$(element).find(".img-tip").first().text().trim();
      const url = search$(element).find("h5").find("a").first().attr("href");
      if (!title || !url) return;
      searchResults.push({ title, year: year ? parseInt(year, 10) : void 0, url });
    });
    let showLink = (_a2 = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))) == null ? void 0 : _a2.url;
    if (!showLink) throw new NotFoundError("Content not found");
    if (ctx.media.type === "show") {
      const seasonNumber = ctx.media.season.number;
      const episodeNumber = ctx.media.episode.number;
      const showPage = await ctx.proxiedFetcher(showLink, { baseUrl: baseUrl$3 });
      const showPage$ = cheerio.load(showPage);
      const seasonBlock = showPage$("h4").filter((_, el) => showPage$(el).text().trim().split(":")[0].trim() === `Season${seasonNumber}`).parent();
      const episodes = seasonBlock.find("a").toArray();
      showLink = showPage$(
        episodes.find((el) => parseInt(showPage$(el).text().split(".")[0], 10) === episodeNumber)
      ).attr("href");
    }
    if (!showLink) throw new NotFoundError("Content not found");
    const contentPage = await ctx.proxiedFetcher(showLink, { baseUrl: baseUrl$3 });
    const contentPage$ = cheerio.load(contentPage);
    const pass = contentPage$("#hId").attr("value");
    if (!pass) throw new NotFoundError("Content not found");
    ctx.progress(50);
    const formData = new URLSearchParams();
    formData.append("pass", pass);
    formData.append("e2", "0");
    formData.append("server", "0");
    const infoEndpoint = ctx.media.type === "show" ? "/home/index/getEInfoAjax" : "/home/index/getMInfoAjax";
    const streamRes = await ctx.proxiedFetcher(infoEndpoint, {
      baseUrl: baseUrl$3,
      method: "POST",
      body: formData,
      headers: {
        referer: `${baseUrl$3}${showLink}`,
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        "Viewport-Width": "375"
      }
    });
    const streamResJson = JSON.parse(streamRes);
    const captions = [];
    if (Array.isArray(streamResJson.subs)) {
      for (const sub of streamResJson.subs) {
        let language = "";
        if (sub.name.includes(".srt")) {
          const langName = sub.name.split(".srt")[0].trim();
          language = labelToLanguageCode(langName);
        } else if (sub.name.includes(":")) {
          const langName = sub.name.split(":")[0].trim();
          language = labelToLanguageCode(langName);
        } else {
          const langName = sub.name.trim();
          language = labelToLanguageCode(langName);
        }
        if (!language) continue;
        captions.push({
          id: sub.path,
          url: `${baseUrl$3}${sub.path}`,
          type: "srt",
          hasCorsRestrictions: false,
          language
        });
      }
    }
    ctx.progress(90);
    const headers2 = {
      referer: `${baseUrl$3}${showLink}`,
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Viewport-Width": "375",
      Origin: baseUrl$3
    };
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          playlist: await convertPlaylistsToDataUrls(ctx.proxiedFetcher, `${baseUrl$3}/${streamResJson.val}`, headers2),
          type: "hls",
          proxyDepth: 2,
          flags: [flags.CORS_ALLOWED],
          captions
        },
        ...streamResJson.val_bak ? [
          {
            id: "backup",
            playlist: await convertPlaylistsToDataUrls(
              ctx.proxiedFetcher,
              `${baseUrl$3}/${streamResJson.val_bak}`,
              headers2
            ),
            type: "hls",
            flags: [flags.CORS_ALLOWED],
            proxyDepth: 2,
            captions
          }
        ] : []
      ]
    };
  };
  const soaperTvScraper = makeSourcerer({
    id: "soapertv",
    name: "SoaperTV",
    rank: 130,
    disabled: false,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: universalScraper,
    scrapeShow: universalScraper
  });
  const streamboxBase = "https://vidjoy.pro/embed/api/fastfetch";
  async function comboScraper$5(ctx) {
    var _a2, _b2;
    const apiRes = await ctx.proxiedFetcher(
      ctx.media.type === "movie" ? `${streamboxBase}/${ctx.media.tmdbId}?sr=0` : `${streamboxBase}/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}?sr=0`
    );
    if (!apiRes) {
      throw new NotFoundError("Failed to fetch StreamBox data");
    }
    console.log(apiRes);
    const data = await apiRes;
    const streams = {};
    data.url.forEach((stream) => {
      streams[stream.resulation] = stream.link;
    });
    const captions = data.tracks.map((track) => ({
      id: track.lang,
      url: track.url,
      language: track.code,
      type: "srt"
    }));
    if (data.provider === "MovieBox") {
      return {
        embeds: [],
        stream: [
          {
            id: "primary",
            captions,
            qualities: {
              ...streams["1080"] && {
                1080: {
                  type: "mp4",
                  url: streams["1080"]
                }
              },
              ...streams["720"] && {
                720: {
                  type: "mp4",
                  url: streams["720"]
                }
              },
              ...streams["480"] && {
                480: {
                  type: "mp4",
                  url: streams["480"]
                }
              },
              ...streams["360"] && {
                360: {
                  type: "mp4",
                  url: streams["360"]
                }
              }
            },
            type: "file",
            flags: [flags.CORS_ALLOWED],
            preferredHeaders: {
              Referer: (_a2 = data.headers) == null ? void 0 : _a2.Referer
            }
          }
        ]
      };
    }
    const hlsStream = data.url.find((stream) => stream.type === "hls") || data.url[0];
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          captions,
          playlist: hlsStream.link,
          type: "hls",
          flags: [flags.CORS_ALLOWED],
          preferredHeaders: {
            Referer: (_b2 = data.headers) == null ? void 0 : _b2.Referer
          }
        }
      ]
    };
  }
  const streamboxScraper = makeSourcerer({
    id: "streambox",
    name: "StreamBox",
    rank: 119,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$5,
    scrapeShow: comboScraper$5
  });
  const baseUrl$2 = "https://turbovid.eu";
  async function comboScraper$4(ctx) {
    const embedUrl = ctx.media.type === "movie" ? `${baseUrl$2}/api/req/movie/${ctx.media.tmdbId}` : `${baseUrl$2}/api/req/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;
    return {
      embeds: [
        {
          embedId: "turbovid",
          url: embedUrl
        }
      ]
    };
  }
  const turbovidSourceScraper = makeSourcerer({
    id: "turbovidSource",
    name: "TurboVid",
    rank: 120,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$4,
    scrapeShow: comboScraper$4
  });
  const baseUrl$1 = "https://vidapi.click";
  async function comboScraper$3(ctx) {
    const apiUrl = ctx.media.type === "show" ? `${baseUrl$1}/api/video/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}` : `${baseUrl$1}/api/video/movie/${ctx.media.tmdbId}`;
    const apiRes = await ctx.proxiedFetcher(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!apiRes) throw new NotFoundError("Failed to fetch video source");
    if (!apiRes.sources[0].file) throw new NotFoundError("No video source found");
    ctx.progress(50);
    ctx.progress(90);
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          type: "hls",
          playlist: apiRes.sources[0].file,
          flags: [flags.CORS_ALLOWED],
          captions: []
        }
      ]
    };
  }
  const vidapiClickScraper = makeSourcerer({
    id: "vidapi-click",
    name: "vidapi.click",
    rank: 89,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$3,
    scrapeShow: comboScraper$3
  });
  const VIDIFY_SERVERS = [
    { name: "Mbox", sr: 17 },
    { name: "Xprime", sr: 15 },
    { name: "Hexo", sr: 8 },
    { name: "Prime", sr: 9 },
    { name: "Nitro", sr: 20 },
    { name: "Meta", sr: 6 },
    { name: "Veasy", sr: 16 },
    { name: "Lux", sr: 26 },
    { name: "Vfast", sr: 11 },
    { name: "Zozo", sr: 7 },
    { name: "Tamil", sr: 13 },
    { name: "Telugu", sr: 14 },
    { name: "Beta", sr: 5 },
    { name: "Alpha", sr: 1 },
    { name: "Vplus", sr: 18 },
    { name: "Cobra", sr: 12 }
  ];
  async function comboScraper$2(ctx) {
    const query = {
      type: ctx.media.type,
      tmdbId: ctx.media.tmdbId,
      ...ctx.media.type === "show" && {
        season: ctx.media.season.number,
        episode: ctx.media.episode.number
      }
    };
    return {
      embeds: VIDIFY_SERVERS.map((server) => ({
        embedId: `vidify-${server.name.toLowerCase()}`,
        url: JSON.stringify({ ...query, sr: server.sr })
      }))
    };
  }
  const vidifyScraper = makeSourcerer({
    id: "vidify",
    name: "Vidify 🔥",
    rank: 204,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$2,
    scrapeShow: comboScraper$2
  });
  const backendUrl = "https://second.vidnest.fun";
  const servers = ["hollymoviehd", "allmovies"];
  async function scrape(ctx, type) {
    const embeds = [];
    for (const server of servers) {
      let url = "";
      if (type === "movie") {
        url = `${backendUrl}/${server}/movie/${ctx.media.tmdbId}`;
      } else if (ctx.media.type === "show") {
        url = `${backendUrl}/${server}/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;
      }
      embeds.push({
        embedId: `vidnest-${server}`,
        url
      });
    }
    return {
      embeds
    };
  }
  const vidnestScraper = makeSourcerer({
    id: "vidnest",
    name: "Vidnest",
    rank: 115,
    disabled: true,
    // Backend second.vidnest.fun is down (502)
    flags: [],
    scrapeMovie: (ctx) => scrape(ctx, "movie"),
    scrapeShow: (ctx) => scrape(ctx, "tv")
  });
  async function getEmbeds(id, servers2, ctx) {
    var _a2;
    const embeds = [];
    for (const server of servers2.split(",")) {
      await ctx.proxiedFetcher(`/getEmbed.php`, {
        baseUrl: warezcdnBase,
        headers: {
          Referer: `${warezcdnBase}/getEmbed.php?${new URLSearchParams({ id, sv: server })}`
        },
        method: "HEAD",
        query: { id, sv: server }
      });
      const embedPage = await ctx.proxiedFetcher(`/getPlay.php`, {
        baseUrl: warezcdnBase,
        headers: {
          Referer: `${warezcdnBase}/getEmbed.php?${new URLSearchParams({ id, sv: server })}`
        },
        query: { id, sv: server }
      });
      const url = (_a2 = embedPage.match(/window.location.href\s*=\s*"([^"]+)"/)) == null ? void 0 : _a2[1];
      if (url && server === "warezcdn") {
        embeds.push(
          { embedId: warezcdnembedHlsScraper.id, url },
          { embedId: warezcdnembedMp4Scraper.id, url },
          { embedId: warezPlayerScraper.id, url }
        );
      } else if (url && server === "mixdrop") embeds.push({ embedId: mixdropScraper.id, url });
    }
    return { embeds };
  }
  const warezcdnScraper = makeSourcerer({
    id: "warezcdn",
    name: "WarezCDN",
    disabled: true,
    rank: 115,
    flags: [],
    scrapeMovie: async (ctx) => {
      if (!ctx.media.imdbId) throw new NotFoundError("This source requires IMDB id.");
      const serversPage = await ctx.proxiedFetcher(`/filme/${ctx.media.imdbId}`, {
        baseUrl: warezcdnBase
      });
      const [, id, servers2] = serversPage.match(/let\s+data\s*=\s*'\[\s*\{\s*"id":"([^"]+)".*?"servers":"([^"]+)"/);
      if (!id || !servers2) throw new NotFoundError("Failed to find episode id");
      ctx.progress(40);
      return getEmbeds(id, servers2, ctx);
    }
    // scrapeShow: async (ctx) => {
    //   if (!ctx.media.imdbId) throw new NotFoundError('This source requires IMDB id.');
    //   const url = `${warezcdnBase}/serie/${ctx.media.imdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;
    //   const serversPage = await ctx.proxiedFetcher<string>(url);
    //   const seasonsApi = serversPage.match(/var\s+cachedSeasons\s*=\s*"([^"]+)"/)?.[1];
    //   if (!seasonsApi) throw new NotFoundError('Failed to find data');
    //   ctx.progress(40);
    //   const streamsData = await ctx.proxiedFetcher<cachedSeasonsRes>(seasonsApi, {
    //     baseUrl: warezcdnBase,
    //     headers: {
    //       Referer: url,
    //       'X-Requested-With': 'XMLHttpRequest',
    //     },
    //   });
    //   const season = Object.values(streamsData.seasons).find((s) => s.name === ctx.media.season.number.toString());
    //   if (!season) throw new NotFoundError('Failed to find season id');
    //   const episode = Object.values(season.episodes).find((e) => e.name === ctx.media.season.number.toString())?.id;
    //   if (!episode) throw new NotFoundError('Failed to find episode id');
    //   const episodeData = await ctx.proxiedFetcher<string>('/core/ajax.php', {
    //     baseUrl: warezcdnBase,
    //     headers: {
    //       Referer: url,
    //       'X-Requested-With': 'XMLHttpRequest',
    //     },
    //     query: { audios: episode },
    //   });
    //   const [, id, servers] = episodeData.replace(/\\"/g, '"').match(/"\[\s*\{\s*"id":"([^"]+)".*?"servers":"([^"]+)"/)!;
    //   if (!id || !servers) throw new NotFoundError('Failed to find episode id');
    //   return getEmbeds(id, servers, ctx);
    // },
  });
  const baseUrl = "https://wecima.tube";
  async function comboScraper$1(ctx) {
    const searchPage = await ctx.proxiedFetcher(`/search/${encodeURIComponent(ctx.media.title)}/`, {
      baseUrl
    });
    const search$ = cheerio.load(searchPage);
    const firstResult = search$(".Grid--WecimaPosts .GridItem a").first();
    if (!firstResult.length) throw new NotFoundError("No results found");
    const contentUrl = firstResult.attr("href");
    if (!contentUrl) throw new NotFoundError("No content URL found");
    ctx.progress(30);
    const contentPage = await ctx.proxiedFetcher(contentUrl, { baseUrl });
    const content$ = cheerio.load(contentPage);
    let embedUrl;
    if (ctx.media.type === "movie") {
      embedUrl = content$('meta[itemprop="embedURL"]').attr("content");
    } else {
      const seasonLinks = content$(".List--Seasons--Episodes a");
      let seasonUrl;
      for (const element of seasonLinks) {
        const text = content$(element).text().trim();
        if (text.includes(`موسم ${ctx.media.season}`)) {
          seasonUrl = content$(element).attr("href");
          break;
        }
      }
      if (!seasonUrl) throw new NotFoundError(`Season ${ctx.media.season} not found`);
      const seasonPage = await ctx.proxiedFetcher(seasonUrl, { baseUrl });
      const season$ = cheerio.load(seasonPage);
      const episodeLinks = season$(".Episodes--Seasons--Episodes a");
      for (const element of episodeLinks) {
        const epTitle = season$(element).find("episodetitle").text().trim();
        if (epTitle === `الحلقة ${ctx.media.episode}`) {
          const episodeUrl = season$(element).attr("href");
          if (episodeUrl) {
            const episodePage = await ctx.proxiedFetcher(episodeUrl, { baseUrl });
            const episode$ = cheerio.load(episodePage);
            embedUrl = episode$('meta[itemprop="embedURL"]').attr("content");
          }
          break;
        }
      }
    }
    if (!embedUrl) throw new NotFoundError("No embed URL found");
    ctx.progress(60);
    const embedPage = await ctx.proxiedFetcher(embedUrl);
    const embed$ = cheerio.load(embedPage);
    const videoSource = embed$('source[type="video/mp4"]').attr("src");
    if (!videoSource) throw new NotFoundError("No video source found");
    ctx.progress(90);
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          type: "file",
          flags: [],
          headers: {
            referer: baseUrl
          },
          qualities: {
            unknown: {
              type: "mp4",
              url: videoSource
            }
          },
          captions: []
        }
      ]
    };
  }
  const wecimaScraper = makeSourcerer({
    id: "wecima",
    name: "Wecima (Arabic)",
    rank: 3,
    disabled: false,
    flags: [],
    scrapeMovie: comboScraper$1,
    scrapeShow: comboScraper$1
  });
  async function comboScraper(ctx) {
    const anilistId = await getAnilistIdFromMedia(ctx, ctx.media);
    const query = {
      type: ctx.media.type,
      title: ctx.media.title,
      tmdbId: ctx.media.tmdbId,
      imdbId: ctx.media.imdbId,
      anilistId,
      ...ctx.media.type === "show" && {
        season: ctx.media.season.number,
        episode: ctx.media.episode.number
      },
      ...ctx.media.type === "movie" && { episode: 1 },
      releaseYear: ctx.media.releaseYear
    };
    return {
      embeds: [
        {
          embedId: "zunime-hd-2",
          url: JSON.stringify(query)
        },
        {
          embedId: "zunime-miko",
          url: JSON.stringify(query)
        },
        {
          embedId: "zunime-shiro",
          url: JSON.stringify(query)
        },
        {
          embedId: "zunime-zaza",
          url: JSON.stringify(query)
        }
      ]
    };
  }
  const zunimeScraper = makeSourcerer({
    id: "zunime",
    name: "Zunime",
    rank: 114,
    flags: [],
    scrapeShow: comboScraper
  });
  function gatherAllSources() {
    return [
      primesrcScraper,
      fsOnlineScraper,
      dopeboxScraper,
      cuevana3Scraper,
      ridooMoviesScraper,
      hdRezkaScraper,
      warezcdnScraper,
      insertunitScraper,
      soaperTvScraper,
      autoembedScraper,
      myanimeScraper,
      tugaflixScraper,
      ee3Scraper,
      fsharetvScraper,
      zoechipScraper,
      mp4hydraScraper,
      embedsuScraper,
      slidemoviesScraper,
      vidapiClickScraper,
      coitusScraper,
      streamboxScraper,
      nunflixScraper,
      EightStreamScraper,
      wecimaScraper,
      animeflvScraper,
      pirxcyScraper,
      vidsrcvipScraper,
      rgshowsScraper,
      vidifyScraper,
      zunimeScraper,
      vidnestScraper,
      animetsuScraper,
      lookmovieScraper,
      turbovidSourceScraper,
      pelisplushdScraper,
      primewireScraper,
      movies4fScraper,
      debridScraper,
      cinehdplusScraper,
      fullhdfilmizleScraper
    ];
  }
  function gatherAllEmbeds() {
    return [
      ...fsOnlineEmbeds,
      ...dopeboxEmbeds,
      serverMirrorEmbed,
      upcloudScraper,
      vidCloudScraper,
      mixdropScraper,
      ridooScraper,
      closeLoadScraper,
      doodScraper,
      streamvidScraper,
      streamtapeScraper,
      warezcdnembedHlsScraper,
      warezcdnembedMp4Scraper,
      warezPlayerScraper,
      autoembedEnglishScraper,
      autoembedHindiScraper,
      autoembedBengaliScraper,
      autoembedTamilScraper,
      autoembedTeluguScraper,
      turbovidScraper,
      mp4hydraServer1Scraper,
      mp4hydraServer2Scraper,
      VidsrcsuServer1Scraper,
      VidsrcsuServer2Scraper,
      VidsrcsuServer3Scraper,
      VidsrcsuServer4Scraper,
      VidsrcsuServer5Scraper,
      VidsrcsuServer6Scraper,
      VidsrcsuServer7Scraper,
      VidsrcsuServer8Scraper,
      VidsrcsuServer9Scraper,
      VidsrcsuServer10Scraper,
      VidsrcsuServer11Scraper,
      VidsrcsuServer12Scraper,
      VidsrcsuServer20Scraper,
      viperScraper,
      streamwishJapaneseScraper,
      streamwishLatinoScraper,
      streamwishSpanishScraper,
      streamwishEnglishScraper,
      streamtapeLatinoScraper,
      ...cinemaosEmbeds,
      // ...cinemaosHexaEmbeds,
      // vidsrcNovaEmbed,
      // vidsrcCometEmbed,
      // vidsrcPulsarEmbed,
      ...vidifyEmbeds,
      ...zunimeEmbeds,
      ...AnimetsuEmbeds,
      vidnestHollymoviehdEmbed,
      vidnestAllmoviesEmbed,
      myanimesubScraper,
      myanimedubScraper,
      filemoonScraper,
      vidhideLatinoScraper,
      vidhideSpanishScraper,
      vidhideEnglishScraper,
      filelionsScraper,
      droploadScraper,
      supervideoScraper,
      voeScraper
    ];
  }
  function getBuiltinSources() {
    return gatherAllSources().filter((v) => !v.disabled && !v.externalSource);
  }
  function getBuiltinExternalSources() {
    return gatherAllSources().filter((v) => v.externalSource && !v.disabled);
  }
  function getBuiltinEmbeds() {
    return gatherAllEmbeds().filter((v) => !v.disabled);
  }
  function findDuplicates(items, keyFn) {
    const groups = /* @__PURE__ */ new Map();
    for (const item of items) {
      const key = keyFn(item);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(item);
    }
    return Array.from(groups.entries()).filter(([_, groupItems]) => groupItems.length > 1).map(([key, groupItems]) => ({ key, items: groupItems }));
  }
  function formatDuplicateError(type, duplicates, keyName) {
    const duplicateList = duplicates.map(({ key, items }) => {
      const itemNames = items.map((item) => item.name || item.id).join(", ");
      return `  ${keyName} ${key}: ${itemNames}`;
    }).join("\n");
    return `${type} have duplicate ${keyName}s:
${duplicateList}`;
  }
  function getProviders(features, list) {
    const sources = list.sources.filter((v) => !(v == null ? void 0 : v.disabled));
    const embeds = list.embeds.filter((v) => !(v == null ? void 0 : v.disabled));
    const combined = [...sources, ...embeds];
    const duplicateIds = findDuplicates(combined, (v) => v.id);
    if (duplicateIds.length > 0) {
      throw new Error(formatDuplicateError("Sources/embeds", duplicateIds, "ID"));
    }
    const duplicateSourceRanks = findDuplicates(sources, (v) => v.rank);
    if (duplicateSourceRanks.length > 0) {
      throw new Error(formatDuplicateError("Sources", duplicateSourceRanks, "rank"));
    }
    const duplicateEmbedRanks = findDuplicates(embeds, (v) => v.rank);
    if (duplicateEmbedRanks.length > 0) {
      throw new Error(formatDuplicateError("Embeds", duplicateEmbedRanks, "rank"));
    }
    return {
      sources: sources.filter((s) => flagsAllowedInFeatures(features, s.flags)),
      embeds: embeds.filter((e) => flagsAllowedInFeatures(features, e.flags))
    };
  }
  function buildProviders() {
    let consistentIpForRequests = false;
    let target = null;
    let fetcher = null;
    let proxiedFetcher = null;
    const embeds = [];
    const sources = [];
    const builtinSources = getBuiltinSources();
    const builtinExternalSources = getBuiltinExternalSources();
    const builtinEmbeds = getBuiltinEmbeds();
    return {
      enableConsistentIpForRequests() {
        consistentIpForRequests = true;
        return this;
      },
      setFetcher(f) {
        fetcher = f;
        return this;
      },
      setProxiedFetcher(f) {
        proxiedFetcher = f;
        return this;
      },
      setTarget(t) {
        target = t;
        return this;
      },
      addSource(input) {
        if (typeof input !== "string") {
          sources.push(input);
          return this;
        }
        const matchingSource = [...builtinSources, ...builtinExternalSources].find((v) => v.id === input);
        if (!matchingSource) throw new Error("Source not found");
        sources.push(matchingSource);
        return this;
      },
      addEmbed(input) {
        if (typeof input !== "string") {
          embeds.push(input);
          return this;
        }
        const matchingEmbed = builtinEmbeds.find((v) => v.id === input);
        if (!matchingEmbed) throw new Error("Embed not found");
        embeds.push(matchingEmbed);
        return this;
      },
      addBuiltinProviders() {
        sources.push(...builtinSources);
        embeds.push(...builtinEmbeds);
        return this;
      },
      build() {
        if (!target) throw new Error("Target not set");
        if (!fetcher) throw new Error("Fetcher not set");
        const features = getTargetFeatures(target, consistentIpForRequests);
        const list = getProviders(features, {
          embeds,
          sources
        });
        return makeControls({
          fetcher,
          proxiedFetcher: proxiedFetcher ?? void 0,
          embeds: list.embeds,
          sources: list.sources,
          features
        });
      }
    };
  }
  function makeProviders(ops) {
    var _a2;
    const features = getTargetFeatures(
      ops.proxyStreams ? "any" : ops.target,
      ops.consistentIpForRequests ?? false,
      ops.proxyStreams
    );
    const sources = [...getBuiltinSources()];
    if (ops.externalSources === "all") sources.push(...getBuiltinExternalSources());
    else {
      (_a2 = ops.externalSources) == null ? void 0 : _a2.forEach((source) => {
        const matchingSource = getBuiltinExternalSources().find((v) => v.id === source);
        if (!matchingSource) return;
        sources.push(matchingSource);
      });
    }
    const list = getProviders(features, {
      embeds: getBuiltinEmbeds(),
      sources
    });
    return makeControls({
      embeds: list.embeds,
      sources: list.sources,
      features,
      fetcher: ops.fetcher,
      proxiedFetcher: ops.proxiedFetcher,
      proxyStreams: ops.proxyStreams
    });
  }
  const isReactNative = () => {
    try {
      require("react-native");
      return true;
    } catch (e) {
      return false;
    }
  };
  function serializeBody(body) {
    if (body === void 0 || typeof body === "string" || body instanceof URLSearchParams || body instanceof FormData) {
      if (body instanceof URLSearchParams && isReactNative()) {
        return {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: body.toString()
        };
      }
      return {
        headers: {},
        body
      };
    }
    return {
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    };
  }
  function getHeaders(list, res) {
    const output = new Headers();
    list.forEach((header) => {
      var _a2;
      const realHeader = header.toLowerCase();
      const realValue = res.headers.get(realHeader);
      const extraValue = (_a2 = res.extraHeaders) == null ? void 0 : _a2.get(realHeader);
      const value = extraValue ?? realValue;
      if (!value) return;
      output.set(realHeader, value);
    });
    return output;
  }
  function makeStandardFetcher(f) {
    const normalFetch = async (url, ops) => {
      var _a2;
      const fullUrl = makeFullUrl(url, ops);
      const seralizedBody = serializeBody(ops.body);
      const controller = new AbortController();
      const timeout = 3e4;
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      try {
        const res = await f(fullUrl, {
          method: ops.method,
          headers: {
            ...seralizedBody.headers,
            ...ops.headers
          },
          body: seralizedBody.body,
          credentials: ops.credentials,
          signal: controller.signal
          // Pass the signal to fetch
        });
        clearTimeout(timeoutId);
        let body;
        const contentType = (_a2 = res.headers.get("content-type")) == null ? void 0 : _a2.toLowerCase();
        const isJson = contentType == null ? void 0 : contentType.includes("application/json");
        const isBinary = (contentType == null ? void 0 : contentType.includes("application/wasm")) || (contentType == null ? void 0 : contentType.includes("application/octet-stream")) || (contentType == null ? void 0 : contentType.includes("binary"));
        if (res.status === 204) {
          body = null;
        } else if (isJson) {
          body = await res.json();
        } else if (isBinary) {
          body = await res.arrayBuffer();
        } else {
          body = await res.text();
        }
        return {
          body,
          finalUrl: res.extraUrl ?? res.url,
          headers: getHeaders(ops.readHeaders, res),
          statusCode: res.status
        };
      } catch (error) {
        if (error.name === "AbortError") {
          throw new Error(`Fetch request to ${fullUrl} timed out after ${timeout}ms`);
        }
        throw error;
      }
    };
    return normalFetch;
  }
  const headerMap = {
    cookie: "X-Cookie",
    referer: "X-Referer",
    origin: "X-Origin",
    "user-agent": "X-User-Agent",
    "x-real-ip": "X-X-Real-Ip"
  };
  const responseHeaderMap = {
    "x-set-cookie": "Set-Cookie"
  };
  function makeSimpleProxyFetcher(proxyUrl, f) {
    const proxiedFetch = async (url, ops) => {
      const fetcher = makeStandardFetcher(async (a, b) => {
        const controller = new AbortController();
        const timeout = 3e4;
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
          const res = await f(a, {
            method: (b == null ? void 0 : b.method) || "GET",
            headers: (b == null ? void 0 : b.headers) || {},
            body: b == null ? void 0 : b.body,
            credentials: b == null ? void 0 : b.credentials,
            signal: controller.signal
            // Pass the signal to fetch
          });
          clearTimeout(timeoutId);
          res.extraHeaders = new Headers();
          Object.entries(responseHeaderMap).forEach((entry) => {
            var _a2;
            const value = res.headers.get(entry[0]);
            if (!value) return;
            (_a2 = res.extraHeaders) == null ? void 0 : _a2.set(entry[1].toLowerCase(), value);
          });
          res.extraUrl = res.headers.get("X-Final-Destination") ?? res.url;
          return res;
        } catch (error) {
          if (error.name === "AbortError") {
            throw new Error(`Fetch request to ${a} timed out after ${timeout}ms`);
          }
          throw error;
        }
      });
      const fullUrl = makeFullUrl(url, ops);
      const headerEntries = Object.entries(ops.headers).map((entry) => {
        const key = entry[0].toLowerCase();
        if (headerMap[key]) return [headerMap[key], entry[1]];
        return entry;
      });
      return fetcher(proxyUrl, {
        ...ops,
        query: {
          destination: fullUrl
        },
        headers: Object.fromEntries(headerEntries),
        baseUrl: void 0
      });
    };
    return proxiedFetch;
  }
  class YouTubeMusic {
    constructor() {
      this.baseUrl = "https://music.youtube.com";
      this.headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      };
    }
    async search(query) {
      try {
        const homeRes = await fetch(this.baseUrl, { headers: this.headers });
        const html = await homeRes.text();
        const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"(.+?)"/);
        const apiKey = apiKeyMatch ? apiKeyMatch[1] : null;
        const clientVersionMatch = html.match(/"clientVersion":"([\d\.]+)"/);
        const clientVersion = clientVersionMatch ? clientVersionMatch[1] : "1.20240101.01.00";
        if (!apiKey) {
          throw new Error("Could not find YouTube Music API Key");
        }
        const apiUrl = `${this.baseUrl}/youtubei/v1/search?key=${apiKey}`;
        const body = {
          context: {
            client: {
              clientName: "WEB_REMIX",
              clientVersion
            }
          },
          query,
          params: "Eg-KAQwIABAAGAAgACgAMABqChAAGAAgACgAMQA="
          // Songs filter
        };
        const apiRes = await fetch(apiUrl, {
          method: "POST",
          headers: {
            ...this.headers,
            "Content-Type": "application/json",
            Origin: this.baseUrl,
            Referer: `${this.baseUrl}/`
          },
          body: JSON.stringify(body)
        });
        if (!apiRes.ok) {
          throw new Error(`YouTube Music API Error: ${apiRes.status}`);
        }
        const json = await apiRes.json();
        return this.parseSearchResults(json);
      } catch (error) {
        console.error("YouTube Music Search Error:", error);
        throw error;
      }
    }
    parseSearchResults(json) {
      var _a2, _b2, _c2, _d2, _e;
      const songs = [];
      const tabs = (_b2 = (_a2 = json.contents) == null ? void 0 : _a2.tabbedSearchResultsRenderer) == null ? void 0 : _b2.tabs;
      const correctTab = (_c2 = tabs == null ? void 0 : tabs.find((t) => {
        var _a3;
        return (_a3 = t.tabRenderer) == null ? void 0 : _a3.selected;
      })) == null ? void 0 : _c2.tabRenderer;
      const sections = (_e = (_d2 = correctTab == null ? void 0 : correctTab.content) == null ? void 0 : _d2.sectionListRenderer) == null ? void 0 : _e.contents;
      if (!sections) return [];
      sections.forEach((sec) => {
        const shelf = sec.musicShelfRenderer;
        if (shelf) {
          shelf.contents.forEach((item) => {
            var _a3, _b3, _c3, _d3, _e2, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
            const mrb = item.musicResponsiveListItemRenderer;
            if (mrb) {
              const title = (_e2 = (_d3 = (_c3 = (_b3 = (_a3 = mrb.flexColumns[0]) == null ? void 0 : _a3.musicResponsiveListItemFlexColumnRenderer) == null ? void 0 : _b3.text) == null ? void 0 : _c3.runs) == null ? void 0 : _d3[0]) == null ? void 0 : _e2.text;
              const videoId = (_f = mrb.playlistItemData) == null ? void 0 : _f.videoId;
              const metadataRuns = (_i = (_h = (_g = mrb.flexColumns[1]) == null ? void 0 : _g.musicResponsiveListItemFlexColumnRenderer) == null ? void 0 : _h.text) == null ? void 0 : _i.runs;
              const artist = ((_j = metadataRuns == null ? void 0 : metadataRuns.find(
                (r) => {
                  var _a4, _b4, _c4, _d4, _e3, _f2;
                  return ((_c4 = (_b4 = (_a4 = r.navigationEndpoint) == null ? void 0 : _a4.browseEndpoint) == null ? void 0 : _b4.browseId) == null ? void 0 : _c4.startsWith("UC")) || // Artist channel
                  ((_f2 = (_e3 = (_d4 = r.navigationEndpoint) == null ? void 0 : _d4.browseEndpoint) == null ? void 0 : _e3.browseId) == null ? void 0 : _f2.startsWith("MPRE"));
                }
              )) == null ? void 0 : _j.text) || ((_k = metadataRuns == null ? void 0 : metadataRuns[0]) == null ? void 0 : _k.text) || "Unknown Artist";
              const thumbnail = (_p = (_o = (_n = (_m = (_l = mrb.thumbnail) == null ? void 0 : _l.musicThumbnailRenderer) == null ? void 0 : _m.thumbnail) == null ? void 0 : _n.thumbnails) == null ? void 0 : _o.pop()) == null ? void 0 : _p.url;
              if (title && videoId) {
                songs.push({
                  title,
                  artist,
                  album: void 0,
                  // Hard to extract reliably without more logic
                  duration: void 0,
                  videoId,
                  thumbnail
                });
              }
            }
          });
        }
      });
      return songs;
    }
  }
  const ytMusic = new YouTubeMusic();
  exports2.NotFoundError = NotFoundError;
  exports2.YouTubeMusic = YouTubeMusic;
  exports2.buildProviders = buildProviders;
  exports2.createM3U8ProxyUrl = createM3U8ProxyUrl;
  exports2.flags = flags;
  exports2.getBuiltinEmbeds = getBuiltinEmbeds;
  exports2.getBuiltinExternalSources = getBuiltinExternalSources;
  exports2.getBuiltinSources = getBuiltinSources;
  exports2.getM3U8ProxyUrl = getM3U8ProxyUrl;
  exports2.labelToLanguageCode = labelToLanguageCode;
  exports2.makeProviders = makeProviders;
  exports2.makeSimpleProxyFetcher = makeSimpleProxyFetcher;
  exports2.makeStandardFetcher = makeStandardFetcher;
  exports2.setM3U8ProxyUrl = setM3U8ProxyUrl;
  exports2.targets = targets;
  exports2.updateM3U8ProxyUrl = updateM3U8ProxyUrl;
  exports2.ytMusic = ytMusic;
  Object.defineProperty(exports2, Symbol.toStringTag, { value: "Module" });
});
