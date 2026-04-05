const express = require('express');
const cors = require('cors');
const path = require('path');
const puppeteer = require('puppeteer-core');
const translate = require('translate-google');

const app = express();
const PORT = 3456;
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let _browser = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true, // headless works well with this simple setup
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled', '--hide-scrollbars', '--mute-audio'
    ],
    defaultViewport: { width: 1280, height: 800 },
  });
  console.log('🌐 Browser launched');
  return _browser;
}

function extractVideoId(url) {
  if (!url) return null;
  const m = url.match(/(?:video\/|note\/|item_id=|\/)(\d{15,20})/);
  return m ? m[1] : null;
}

function normalizeItem(item, videoId, url) {
  const desc = item.desc || item.title || item.share_desc || '';
  const music = item.music || item.bgm_info || null;
  const hasVoice = !!(music && (music.id || music.mid || music.title));
  
  return {
    success: true,
    videoId: String(videoId || item.aweme_id || item.id || ''),
    url: url || `https://www.douyin.com/video/${videoId}`,
    caption: desc,
    hasVoice: hasVoice
  };
}

// Ensure browser is ready
getBrowser();

async function scrapeWithPuppeteer(inputUrl) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    let capturedItem = null;

    page.on('response', async (response) => {
      const url = response.url();
      if ((url.includes('aweme/detail') || url.includes('iteminfo') || url.includes('aweme/v1/web')) && response.status() === 200) {
        try {
          const text = await response.text();
          if (text && text.length > 50) {
            const json = JSON.parse(text);
            if (json.aweme_detail) {
              capturedItem = json.aweme_detail;
            } else if (json.item_list?.[0]) {
              capturedItem = json.item_list[0];
            }
          }
        } catch (_) {}
      }
    });

    console.log('[Puppeteer] Navigating to:', inputUrl);

    await new Promise((resolve) => {
      let resolved = false;
      const done = () => { if (!resolved) { resolved = true; resolve(); } };

      page.goto(inputUrl, { waitUntil: 'domcontentloaded', timeout: 35000 })
        .then(done).catch(() => done());

      const interval = setInterval(() => {
        if (capturedItem) {
          clearInterval(interval);
          clearTimeout(maxTimer);
          setTimeout(done, 800); // Small wait to make sure response body has been read securely
        }
      }, 500);

      const maxTimer = setTimeout(() => {
        clearInterval(interval);
        done();
      }, 34000); // Max wait
    });

    if (capturedItem) {
      const finalUrl = page.url();
      const videoId = extractVideoId(finalUrl) || extractVideoId(inputUrl);
      return normalizeItem(capturedItem, videoId, finalUrl);
    }
    
    // Fallback parsing (RENDER_DATA)
    const fallbackResult = await page.evaluate(() => {
      try {
        const rd = window.__RENDER_DATA__;
        if (rd) return typeof rd === 'string' ? JSON.parse(decodeURIComponent(rd)) : rd;
      } catch(e) {}
      return null;
    });

    if (fallbackResult) {
      function deepFind(obj, pred, depth=0) {
        if(depth>10) return null;
        if(pred(obj)) return obj;
        if(Array.isArray(obj)) { for(const x of obj) { const r=deepFind(x,pred,depth+1); if(r) return r;} }
        else if(obj && typeof obj==='object') { for(const k of Object.keys(obj)) { const r=deepFind(obj[k],pred,depth+1); if(r) return r;} }
        return null;
      }
      const item = deepFind(fallbackResult, o => o && typeof o==='object' && (o.aweme_id || o.statistics?.digg_count));
      if (item) {
        let finalUrl = page.url();
        return normalizeItem(item, extractVideoId(finalUrl) || extractVideoId(inputUrl), finalUrl);
      }
    }

    return { success: false, url: inputUrl, error: 'Không thể trích xuất dữ liệu từ Douyin.' };
  } finally {
    await page.close().catch(()=>{});
  }
}

app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') return res.status(400).json({ success: false, error: 'URL không hợp lệ' });

  const trimmedUrl = url.trim();
  console.log('===== NEW REQUEST =====\nURL:', trimmedUrl);

  try {
    const data = await scrapeWithPuppeteer(trimmedUrl);
    
    if (data.success && data.caption) {
      try {
        data.captionEnglish = await translate(data.caption, { to: 'en' });
      } catch (e) {
        console.log('Translate error:', e.message);
        data.captionEnglish = data.caption; // fallback to original
      }
    } else {
      data.captionEnglish = '';
    }

    res.json(data);
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ success: false, error: `Lỗi xử lý: ${err.message}` });
  }
});

app.listen(PORT, () => console.log(`✅ Douyin Bulk Scraper at http://localhost:${PORT}`));
