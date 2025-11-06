const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());  // CORS চালু রাখো যাতে অন্য ডোমেইন থেকে অনুরোধ আসতে পারে

// হোমপেজ বা বেস URL (ঐচ্ছিক)
app.get('/', (req, res) => {
  res.send('Proxy server is running');
});

// মিডিয়া ফাইল (ভিডিও সেগমেন্ট) প্রক্সি করার এন্ডপয়েন্ট
// URL প্যারামিটার হিসেবে মিডিয়া লিংক নেবে
app.get('/proxy-media', async (req, res) => {
  const mediaUrl = req.query.url;  // url ?url=... থেকে নেয়া হবে

  if (!mediaUrl) {
    return res.status(400).send('Missing url parameter');
  }

  console.log('[Proxy] Fetching media from:', mediaUrl);

  try {
    // axios দিয়ে মিডিয়া ফাইল অনুরোধ করা
    const response = await axios.get(mediaUrl, {
      headers: {
        // কিছু ক্ষেত্রে ইউজার এজেন্ট ও রেফারার দরকার হতে পারে
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': mediaUrl,
        'Origin': mediaUrl,
      },
      responseType: 'stream',

      // রিডাইরেক্টগুলো হ্যান্ডেল করার জন্য
      maxRedirects: 0,   // এখানে 0 দিয়েছি, মানে রিডাইরেক্ট করলে দেখাবে
      validateStatus: status => status >= 200 && status < 400,
    });

    // যদি রিডাইরেক্ট হয় তাহলে ক্লায়েন্টকে রিডাইরেক্ট করে দাও
    if (response.status >= 300 && response.status < 400) {
      const redirectUrl = response.headers.location;
      console.log('[Proxy] Redirecting to:', redirectUrl);
      return res.redirect(redirectUrl);
    }

    // কনটেন্ট টাইপ সেট করো যাতে ব্রাউজার বুঝতে পারে কী আসছে
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }

    // CORS হেডার
    res.setHeader('Access-Control-Allow-Origin', '*');

    // স্ট্রিম ডেটা ক্লায়েন্টে পাঠাও
    response.data.pipe(res);

  } catch (error) {
    console.error('Error proxying media:', error.message);
    res.status(500).send('Failed to proxy media');
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
});
