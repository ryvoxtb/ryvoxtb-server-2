const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS সক্রিয় করা হয়েছে
app.use(cors());

// --- ভিডিও প্রক্সি রুট (Manifest Rewrite সহ) ---
app.get('/proxy-media', async (req, res) => {
    const mediaUrl = req.query.url;

    if (!mediaUrl) {
        return res.status(400).send('Missing url parameter');
    }

    console.log(`[Proxy] Requesting: ${mediaUrl}`); // এই লাইনটি প্রতিটি রিকোয়েস্ট দেখাবে

    try {
        const response = await axios.get(mediaUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                // সার্ভারের নিরাপত্তা পাস করার জন্য Referer এবং Origin পাঠানো
                'Referer': mediaUrl, 
                'Origin': new URL(mediaUrl).origin,
            },
            // ডেটা Buffer/ArrayBuffer হিসেবে আনা হচ্ছে
            responseType: 'arraybuffer', 
            maxRedirects: 5, 
            timeout: 30000,
            validateStatus: status => status >= 200 && status < 400,
        });

        const contentType = response.headers['content-type'] || '';
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', contentType);

        // ১. HLS ম্যানিফেস্ট ফাইল শনাক্ত করা
        const isM3U8 = contentType.includes('application/vnd.apple.mpegurl') || mediaUrl.toLowerCase().endsWith('.m3u8');
        
        // ২. যদি HLS ম্যানিফেস্ট হয়, তবে তার ভেতরের URL পরিবর্তন করা
        if (isM3U8) {
            const manifest = Buffer.from(response.data).toString('utf-8');
            const baseUrl = new URL(mediaUrl).href;
            const proxyBase = req.protocol + '://' + req.get('host') + '/proxy-media?url=';

            const rewrittenManifest = manifest.split('\n').map(line => {
                if (line.startsWith('#')) {
                    return line; // ট্যাগ (Tag) অপরিবর্তিত রাখা
                }

                if (line.trim().length > 0) {
                    let fullUrl = line.trim();

                    // আপেক্ষিক পাথ থাকলে পূর্ণ URL তৈরি করা
                    if (!fullUrl.startsWith('http')) {
                        fullUrl = new URL(fullUrl, baseUrl).href;
                    }
                    
                    // সেগমেন্ট URL-কে প্রক্সি দিয়ে মুড়ে দেওয়া
                    const proxiedLine = proxyBase + encodeURIComponent(fullUrl);
                    return proxiedLine;
                }
                
                return line;
            }).join('\n');

            // ৩. পরিবর্তিত ম্যানিফেস্ট ক্লায়েন্টের কাছে পাঠানো
            res.send(rewrittenManifest);

        } else {
            // যদি এটি HLS ম্যানিফেস্ট না হয় (যেমন .ts সেগমেন্ট), তবে ডেটা সরাসরি পাঠানো
            res.end(Buffer.from(response.data));
        }

    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            // সোর্স সার্ভার থেকে প্রাপ্ত ত্রুটি কোড
            const status = error.response.status;
            console.error(`❌ Error proxying media (Status ${status}): Source URL: ${mediaUrl}`);
            // ক্লায়েন্টকে সেই ত্রুটি কোড ফরোয়ার্ড করা
            return res.status(status).send(`Error from origin server: ${error.response.statusText}`);
        } else {
            console.error('❌ Network or Proxy Error:', error.message);
            res.status(500).send('Failed to proxy media due to internal network error');
        }
    }
});

// রুট হ্যান্ডেলার - index.html লোড করার জন্য
app.use(express.static('public')); // যদি index.html টিকে public ফোল্ডারে রাখেন

// সার্ভার চালু করা
app.listen(PORT, () => {
    console.log(`✅ HLS Proxy server running on http://localhost:${PORT}`);
});
