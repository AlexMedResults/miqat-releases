const RELEASES_RAW_BASE = "https://raw.githubusercontent.com/AlexMedResults/miqat-releases/main/channels";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const dlMatch = path.match(/^\/download\/(stable|staging)(?:\/[^/]+)?$/);
    if (dlMatch) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      const ch = dlMatch[1];
      const vParam = url.searchParams.get("v") || "";
      const mUrl = vParam
        ? `${RELEASES_RAW_BASE}/${ch}.json?v=${encodeURIComponent(vParam)}`
        : `${RELEASES_RAW_BASE}/${ch}.json`;

      const mRes = await fetch(mUrl, {
        headers: { "User-Agent": "Miqat-Download-Proxy" },
        cf: { cacheTtl: 30, cacheEverything: true }
      });
      if (!mRes.ok) {
        return new Response("تعذر جلب بيانات الإصدار حالياً", {
          status: 502,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }

      let manifest;
      try {
        manifest = await mRes.json();
      } catch {
        return new Response("بيانات الإصدار غير صالحة", {
          status: 502,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }

      const upstreamApk = String(manifest.apkUrl || "").trim();
      if (!upstreamApk.startsWith("https://")) {
        return new Response("رابط التحميل غير متاح حالياً", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }

      const apkRes = await fetch(upstreamApk, {
        redirect: "follow",
        headers: { "User-Agent": "Miqat-Download-Proxy" }
      });
      if (!apkRes.ok) {
        return new Response("تعذر تحميل ملف التطبيق من المصدر", {
          status: 502,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }

      const vn = String(manifest.versionName || "latest").replace(/[^0-9A-Za-z._-]/g, "");
      const outHeaders = new Headers();
      outHeaders.set("Content-Type", "application/vnd.android.package-archive");
      outHeaders.set("Content-Disposition", `attachment; filename="Miqat-v${vn}.apk"`);
      outHeaders.set("Cache-Control", "public, max-age=300");
      const cl = apkRes.headers.get("Content-Length");
      if (cl) outHeaders.set("Content-Length", cl);

      if (request.method === "HEAD") {
        try { await apkRes.body?.cancel(); } catch {}
        return new Response(null, { status: 200, headers: outHeaders });
      }
      return new Response(apkRes.body, { status: 200, headers: outHeaders });
    }

    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return Response.redirect(`${url.origin}/download/stable`, 302);
  }
};
