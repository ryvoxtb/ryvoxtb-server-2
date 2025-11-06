const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

const channels = {
  ttvplus: 'https://cdn.televisionbd.com:8880/live/ttvplus/Tim3Plus24/21.m3u8',
  channel2: 'https://example.com/path/to/channel2.m3u8',
  channel3: 'https://example.com/path/to/channel3.m3u8',
  // নতুন চ্যানেল এখানে যোগ করো
};

app.get('/', (req, res) => {
  res.send('Proxy server is running');
});

app.get('/channel/:name', (req, res) => {
  const name = req.params.name.toLowerCase();

  if (!channels[name]) {
    return res.status(404).send('Channel not found');
  }

  const proxyUrl = `${req.protocol}://${req.get('host')}/proxy-media?url=${encodeURIComponent(channels[name])}`;

  res.json({ proxyUrl });
});

app.get('/proxy-media', async (req, res) => {
  const mediaUrl = req.query.url;

  if (!mediaUrl) {
    return res.status(400).send('Missing url parameter');
  }

  console.log('[Proxy] Fetching media from:', mediaUrl);

  try {
    const response = await axios.get(mediaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': mediaUrl,
        'Origin': mediaUrl,
      },
      responseType: 'stream',
      maxRedirects: 0,
      timeout: 20000, // 20 seconds timeout, দরকার মতো বাড়াতে পারো
      validateStatus: status => status >= 200 && status < 400,
    });

    if (response.status >= 300 && response.status < 400) {
      const redirectUrl = response.headers.location;
      console.log('[Proxy] Redirecting to:', redirectUrl);
      return res.redirect(redirectUrl);
    }

    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }

    res.setHeader('Access-Control-Allow-Origin', '*');

    response.data.pipe(res);

  } catch (error) {
    console.error('Error proxying media:', error.message);
    res.status(500).send('Failed to proxy media');
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
});
