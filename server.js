const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/proxy-media', async (req, res) => {
    const mediaUrl = req.query.url;

    if (!mediaUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        if (mediaUrl.includes('.m3u8') || mediaUrl.endsWith('.m3u8')) {
            const response = await axios.get(mediaUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Referer': mediaUrl,
                    'Origin': new URL(mediaUrl).origin
                },
                responseType: 'text',
                timeout: 15000
            });

            let manifestText = response.data;
            if (!manifestText || !manifestText.includes('#EXTM3U')) {
                return res.status(500).send('Invalid HLS format.');
            }

            const baseUrl = mediaUrl.substring(0, mediaUrl.lastIndexOf('/') + 1);
            const proxyBase = `${req.protocol}://${req.get('host')}${req.path}?url=`;

            const rewrittenManifest = manifestText.split('\n').map(line => {
                if (line.startsWith('#') || line.trim().length === 0) {
                    return line;
                }
                
                let fullUrl = line.trim();
                if (!fullUrl.startsWith('http')) {
                    fullUrl = new URL(fullUrl, baseUrl).href;
                }
                return proxyBase + encodeURIComponent(fullUrl);
            }).join('\n');

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'no-cache');
            return res.send(rewrittenManifest);
        } 

        const streamResponse = await axios({
            method: 'get',
            url: mediaUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': mediaUrl
            },
            timeout: 30000
        });

        res.setHeader('Content-Type', streamResponse.headers['content-type'] || 'video/MP2T');
        res.setHeader('Cache-Control', 'public, max-age=3600'); 
        
        streamResponse.data.pipe(res);

    } catch (error) {
        console.error('Proxy Error:', error.message);
        if (!res.headersSent) {
            res.status(500).send('Error loading media');
        }
    }
});

app.get('/', (req, res) => {
    res.send('HLS Proxy server is running successfully!');
});

app.listen(PORT, () => {
    console.log(`Proxy server running on port ${PORT}`);
});
