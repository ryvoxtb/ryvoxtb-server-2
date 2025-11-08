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

    console.log('[Proxy] Fetching media from:', mediaUrl);

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
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); 

        // ১. HLS ম্যানিফেস্ট সনাক্ত করা
        if (contentType.includes('application/vnd.apple.mpegurl') || 
            contentType.includes('application/x-mpegurl') || 
            mediaUrl.endsWith('.m3u8')) {
            
            let manifestText = response.data.toString('utf8');
            
            if (!manifestText || !manifestText.includes('#EXTM3U')) {
                console.error('[Manifest Error] Invalid or empty manifest received.');
                return res.status(500).send('Manifest processing error: Invalid HLS format.');
            }

            const baseUrl = mediaUrl.substring(0, mediaUrl.lastIndexOf('/') + 1);
            
            // প্রক্সি বেস URL তৈরি করা (HTTPS নিশ্চিত করা)
            const proxyBase = `${req.protocol}://${req.get('host')}${req.path}?url=`;

            // ২. Manifest Rewrite লজিক: সমস্ত সেগমেন্ট লিংককে প্রক্সি দিয়ে প্রতিস্থাপন করা
            const rewrittenManifest = manifestText.split('\n').map(line => {
                if (line.startsWith('#')) {
                    return line; // কমেন্ট লাইন অপরিবর্তিত থাকবে
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
        if (error.response) {
            console.error(`Error proxying media (Status ${error.response.status}):`, error.message);
            return res.status(error.response.status).send(`Error from origin server: ${error.response.statusText}`);
        } else {
            console.error('Network or Proxy Error:', error.message);
            res.status(500).send('Failed to proxy media due to internal network error');
        }
    }
});

// রুট হ্যান্ডেলার
app.get('/', (req, res) => {
    res.send('HLS Proxy server is running successfully!');
});

app.listen(PORT, () => {
    console.log(`Proxy server running on port ${PORT}`);
});
