/* ACG Radar Service Worker
 *
 * 目标：
 * - 弱网/离线时仍可打开站点（至少可回退到最近缓存的页面）
 * - 对静态资源与数据文件提供缓存（提升二次访问速度）
 *
 * 约束：
 * - 仅处理同源 GET 请求
 * - 尽量保守，避免“缓存污染”影响在线体验
 */

const SW_VERSION = "v1";
const CACHE_PAGES = `acg-pages-${SW_VERSION}`;
const CACHE_ASSETS = `acg-assets-${SW_VERSION}`;
const CACHE_DATA = `acg-data-${SW_VERSION}`;
const CACHE_IMAGES = `acg-images-${SW_VERSION}`;

function safeUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isSameOrigin(reqUrl) {
  return reqUrl && reqUrl.origin === self.location.origin;
}

function basePathname() {
  // scope 形如：https://example.com/ACG/
  const u = safeUrl(self.registration && self.registration.scope);
  const p = u ? u.pathname : "/";
  return p.endsWith("/") ? p : `${p}/`;
}

function isUnderBase(reqUrl) {
  const base = basePathname();
  return reqUrl && reqUrl.pathname.startsWith(base);
}

function isDataRequest(reqUrl) {
  if (!reqUrl) return false;
  return /\/data\/(posts|status)\.json(\.gz)?$/i.test(reqUrl.pathname);
}

function isAssetRequest(reqUrl) {
  if (!reqUrl) return false;
  return reqUrl.pathname.includes("/_astro/") || /\.(css|js|mjs|map|txt|svg|ico|webmanifest)$/i.test(reqUrl.pathname);
}

function isImageRequest(request) {
  return request.destination === "image";
}

function offlineHtml() {
  const base = basePathname();
  return `<!doctype html>
<html lang="zh-Hans">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#f2f4f8" />
    <title>ACG Radar - Offline</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, \"Apple Color Emoji\", \"Segoe UI Emoji\"; margin: 0; background: #f2f4f8; color: #0b0f14; }
      .wrap { max-width: 720px; margin: 0 auto; padding: 36px 18px; }
      .card { background: rgba(255,255,255,0.72); border: 1px solid rgba(15,23,42,0.10); border-radius: 18px; padding: 20px; box-shadow: 0 18px 55px rgba(2,6,23,0.12); }
      h1 { font-size: 20px; margin: 0; }
      p { margin: 10px 0 0; line-height: 1.6; color: rgba(15,23,42,0.72); }
      a { color: #0b0f14; }
      .row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
      .btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 14px; border-radius: 14px; text-decoration: none; background: rgba(15,23,42,0.06); border: 1px solid rgba(15,23,42,0.10); }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>网络不可用（Offline）</h1>
        <p>当前处于离线或网络不稳定状态。你仍可以打开“最近访问过的页面”。</p>
        <p>オフライン状態です。最近アクセスしたページは表示できる場合があります。</p>
        <div class="row">
          <a class="btn" href="${base}">返回主页</a>
          <a class="btn" href="${base}zh/">中文</a>
          <a class="btn" href="${base}ja/">日本語</a>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

async function cachePut(cacheName, request, response) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
  } catch {
    // ignore
  }
}

async function cacheMatch(cacheName, request) {
  try {
    const cache = await caches.open(cacheName);
    return await cache.match(request);
  } catch {
    return null;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      self.skipWaiting();
      const base = basePathname();
      const urls = [`${base}`, `${base}zh/`, `${base}ja/`, `${base}manifest.webmanifest`];
      try {
        const cache = await caches.open(CACHE_PAGES);
        await cache.addAll(urls);
      } catch {
        // 允许离线安装失败：后续靠运行时缓存逐步补齐
      }
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([CACHE_PAGES, CACHE_ASSETS, CACHE_DATA, CACHE_IMAGES]);
      try {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      } catch {
        // ignore
      }
      self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!request || request.method !== "GET") return;

  const reqUrl = safeUrl(request.url);
  if (!reqUrl || !isSameOrigin(reqUrl) || !isUnderBase(reqUrl)) return;

  const isNavigate = request.mode === "navigate";

  // 导航：network-first，失败回退到缓存页/离线页（避免“缓存污染”长期卡死在旧版本）
  if (isNavigate) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res && res.ok) void cachePut(CACHE_PAGES, request, res.clone());
          return res;
        } catch {
          const cached = await cacheMatch(CACHE_PAGES, request);
          if (cached) return cached;
          const fallback = await cacheMatch(CACHE_PAGES, basePathname());
          if (fallback) return fallback;
          return new Response(offlineHtml(), { headers: { "content-type": "text/html; charset=utf-8" } });
        }
      })()
    );
    return;
  }

  // 数据：stale-while-revalidate（优先返回缓存，再后台更新）
  if (isDataRequest(reqUrl)) {
    event.respondWith(
      (async () => {
        const cached = await cacheMatch(CACHE_DATA, request);
        const fetchPromise = (async () => {
          try {
            const res = await fetch(request);
            if (res && res.ok) void cachePut(CACHE_DATA, request, res.clone());
            return res;
          } catch {
            return null;
          }
        })();

        if (cached) {
          event.waitUntil(fetchPromise);
          return cached;
        }

        const fresh = await fetchPromise;
        return fresh || new Response("{}", { headers: { "content-type": "application/json; charset=utf-8" } });
      })()
    );
    return;
  }

  // 静态资源：stale-while-revalidate
  if (isAssetRequest(reqUrl)) {
    event.respondWith(
      (async () => {
        const cached = await cacheMatch(CACHE_ASSETS, request);
        const fetchPromise = (async () => {
          try {
            const res = await fetch(request);
            if (res && res.ok) void cachePut(CACHE_ASSETS, request, res.clone());
            return res;
          } catch {
            return null;
          }
        })();

        if (cached) {
          event.waitUntil(fetchPromise);
          return cached;
        }

        const fresh = await fetchPromise;
        return fresh || new Response("", { status: 504 });
      })()
    );
    return;
  }

  // 图片：cache-first（可用则直接返回）
  if (isImageRequest(request)) {
    event.respondWith(
      (async () => {
        const cached = await cacheMatch(CACHE_IMAGES, request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res && res.ok) void cachePut(CACHE_IMAGES, request, res.clone());
          return res;
        } catch {
          return new Response("", { status: 504 });
        }
      })()
    );
  }
});

