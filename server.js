const express = require("express");
const axios = require("axios");
const cors = require("cors");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// HTTPS Agent to ignore self-signed SSL errors (optional)
const agent = new https.Agent({ rejectUnauthorized: false });

// CHANNELS অবজেক্টে তোমার স্ট্রিম URL গুলো রাখবে
const CHANNELS = {
  atb: "https://cd198.anystream.uk:8082/hls/atbla85tv/index.m3u8",
  ekushey: "https://ekusheyserver.com/hls-live/livepkgr/_definst_/liveevent/livestream2.m3u8",
  // এখানে চাইলে নতুন চ্যানেল যোগ করো
};

// Helper: URL থেকে base path বের করার ফাংশন
function getBaseUrl(url) {
  return url.substring(0, url.lastIndexOf("/") + 1);
}

// মেইন ম্যানিফেস্ট প্রোক্সি
app.get("/live-tv/:channel", async (req, res) => {
  const key = req.params.channel;
  let url = req.query.url || CHANNELS[key];
  if (!url) return res.status(404).send("Channel not found");

  console.log(`📡 Loading manifest for channel: ${key}`);

  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "*/*",
        Referer: new URL(url).origin,
        Origin: new URL(url).origin,
      },
      httpsAgent: agent,
      maxRedirects: 5,
      timeout: 10000,
    });

    let data = response.data;
    const base = getBaseUrl(url);

    // সাব-ম্যানিফেস্ট লিঙ্ক রিরাইট
    data = data.replace(/^(?!#)(.*\.m3u8.*)$/gm, (match, p1) => {
      if (p1.startsWith("http")) {
        return `/live-tv/${key}?url=${encodeURIComponent(p1)}`;
      }
      return `/live-tv/${key}?url=${encodeURIComponent(base + p1)}`;
    });

    // সেগমেন্ট ফাইল রিরাইট (.ts, .m4s, .aac, .mp4)
    data = data.replace(/^(?!#)(.*\.(ts|m4s|aac|mp4).*)$/gm, (match, p1) => {
      if (p1.startsWith("http")) {
        return `/segment/${key}?url=${encodeURIComponent(p1)}`;
      }
      return `/segment/${key}?url=${encodeURIComponent(base + p1)}`;
    });

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(data);
  } catch (err) {
    console.error(`❌ Manifest load error for ${key}:`, err.message);
    res.status(500).send("Manifest load failed: " + err.message);
  }
});

// সেগমেন্ট প্রোক্সি রুট
app.get("/segment/:channel", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send("Missing segment URL");

  console.log(`🎞️ Segment request: ${url}`);

  try {
    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Referer: new URL(url).origin,
        Origin: new URL(url).origin,
        Accept: "*/*",
        Connection: "keep-alive",
        Range: req.headers.range || "bytes=0-",
      },
      httpsAgent: agent,
    });

    const ext = url.split(".").pop();
    const type =
      ext === "m4s"
        ? "video/iso.segment"
        : ext === "aac"
        ? "audio/aac"
        : "video/mp2t";

    res.setHeader("Content-Type", type);
    response.data.pipe(res);
  } catch (err) {
    console.error(`❌ Segment load error:`, err.message);
    res.status(500).send("Segment load failed: " + err.message);
  }
});

// প্লেয়ার পেজ রুট
app.get("/player/:channel", (req, res) => {
  const ch = req.params.channel;
  if (!CHANNELS[ch]) return res.status(404).send("Channel not found");

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>${ch.toUpperCase()} Player</title>
      <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
      <style>
        body { margin:0; background:#000; display:flex; justify-content:center; align-items:center; height:100vh; }
        video { width:80%; border-radius:12px; box-shadow:0 0 30px #0f0; }
      </style>
    </head>
    <body>
      <video id="video" controls autoplay muted></video>
      <script>
        const src = window.location.origin + '/live-tv/${ch}';
        const video = document.getElementById('video');
        if (Hls.isSupported()) {
          const hls = new Hls({ debug: false });
          hls.loadSource(src);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = src;
        } else {
          alert('HLS not supported');
        }
      </script>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`✅ Proxy running on http://localhost:${PORT}`);
  console.log(`📺 Available channels: ${Object.keys(CHANNELS).join(", ")}`);
  console.log(`👉 Open player: http://localhost:${PORT}/player/{channel}`);
});
