const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// ... (channels অবজেক্ট এবং অন্যান্য রুট, যেমন '/' এবং '/channel/:name', অপরিবর্তিত থাকবে)

// --- সংশোধিত /proxy-media রুট ---
app.get('/proxy-media', async (req, res) => {
    const mediaUrl = req.query.url;

    if (!mediaUrl) {
        return res.status(400).send('Missing url parameter');
    }

    console.log('[Proxy] Fetching media from:', mediaUrl);

    try {
        const response = await axios.get(mediaUrl, {
            // Referer এবং Origin হেডার পাঠানো হচ্ছে, যা HLS সার্ভার প্রায়ই চায়
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': mediaUrl, 
                'Origin': new URL(mediaUrl).origin,
            },
            // responseType পরিবর্তন করা হয়েছে: HLS ম্যানিফেস্টের জন্য 'text' দরকার
            responseType: 'arraybuffer', // সব ডেটাকে বাইনারি বা টেক্সট হিসেবে আনার জন্য
            maxRedirects: 0,
            timeout: 20000,
            validateStatus: status => status >= 200 && status < 400,
        });

        const contentType = response.headers['content-type'] || '';
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // HLS এর জন্য ক্যাশিং বন্ধ করা

        // ১. HLS ম্যানিফেস্ট (m3u8) সনাক্ত করা
        if (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegurl')) {
            
            let manifestText = response.data.toString('utf8');
            const baseUrl = mediaUrl.substring(0, mediaUrl.lastIndexOf('/') + 1);
            
            // Render.com-এ রিকোয়েস্ট আসছে HTTPS-এ, তাই আমরা HTTPS প্রক্সি ইউআরএল তৈরি করব
            const proxyBase = `${req.protocol}://${req.get('host')}${req.path}?url=`;

            // ২. Manifest Rewrite লজিক
            // সেগমেন্ট এবং সাব-প্লেলিস্ট লিংকগুলিকে প্রক্সি URL দিয়ে প্রতিস্থাপন করা হচ্ছে
            
            const rewrittenManifest = manifestText.split('\n').map(line => {
                if (line.startsWith('#')) {
                    return line; // কমেন্ট লাইন অপরিবর্তিত থাকবে
                }

                // যদি লাইনটি একটি URL বা পাথ হয় (অর্থাৎ সেগমেন্ট বা অন্য ম্যানিফেস্ট)
                if (line.trim().length > 0) {
                    let fullUrl = line.trim();

                    // আপেক্ষিক পাথ (relative path) হলে, সেটিকে মূল URL এর বেস দিয়ে পূর্ণ URL বানানো হচ্ছে
                    if (!fullUrl.startsWith('http')) {
                        fullUrl = new URL(fullUrl, baseUrl).href;
                    }
                    
                    // সমস্ত সেগমেন্ট/সাব-ম্যানিফেস্ট URL-কে প্রক্সি দিয়ে মুড়ে দেওয়া
                    // এটি Mixed Content (http://) এবং CORS সমস্যার সমাধান করবে
                    const proxiedLine = proxyBase + encodeURIComponent(fullUrl);
                    
                    console.log(`[Manifest Rewrite] Rewrote link: ${proxiedLine}`);
                    return proxiedLine;
                }
                
                return line;
            }).join('\n');

            // ৩. পরিবর্তিত ম্যানিফেস্ট ক্লায়েন্টের কাছে পাঠানো
            res.send(rewrittenManifest);

        } else {
            // যদি এটি HLS ম্যানিফেস্ট না হয় (যেমন .ts সেগমেন্ট), তবে ডেটা সরাসরি স্ট্রিম করা
            res.end(response.data);
        }

    } catch (error) {
        // Axios Error: এটি 4xx বা 5xx ত্রুটি হতে পারে
        if (error.response) {
            console.error(`Error proxying media (Status ${error.response.status}):`, error.message);
            return res.status(error.response.status).send(`Error from origin server: ${error.response.statusText}`);
        } else {
            console.error('Network or Proxy Error:', error.message);
            res.status(500).send('Failed to proxy media due to internal network error');
        }
    }
});

app.listen(PORT, () => {
    console.log(`Proxy server running on http://localhost:${PORT}`);
});
