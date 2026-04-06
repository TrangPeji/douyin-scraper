const express = require('express');
const cors = require('cors');
const path = require('path');
const puppeteer = require('puppeteer-core');
const translate = require('translate-google');

const app = express();
const PORT = process.env.PORT || 3456;
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let _browser = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled', '--hide-scrollbars', '--mute-audio',
      '--disable-gpu', '--disable-software-rasterizer'
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
    hasVoice,
  };
}

function deepFind(obj, pred, depth = 0) {
  if (depth > 12) return null;
  if (pred(obj)) return obj;
  if (Array.isArray(obj)) {
    for (const x of obj) { const r = deepFind(x, pred, depth + 1); if (r) return r; }
  } else if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) { const r = deepFind(obj[k], pred, depth + 1); if (r) return r; }
  }
  return null;
}

function findAwemeById(obj, targetId) {
  return deepFind(obj, o => o && typeof o === 'object' && String(o.aweme_id) === String(targetId));
}

function findAnyAweme(obj) {
  return deepFind(obj, o => o && typeof o === 'object' && o.aweme_id && (o.desc !== undefined || o.statistics));
}

// Pre-launch browser
getBrowser().catch(e => console.error('Browser launch failed:', e.message));

async function scrapeWithPuppeteer(inputUrl) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    let capturedItem = null;
    let targetVideoId = extractVideoId(inputUrl);

    // Intercept API responses
    page.on('response', async (response) => {
      if (capturedItem) return;
      const url = response.url();
      if (
        response.status() === 200 &&
        (url.includes('/aweme/') || url.includes('iteminfo') || url.includes('detail'))
      ) {
        try {
          const ct = response.headers()['content-type'] || '';
          if (!ct.includes('json') && !ct.includes('javascript') && !ct.includes('text')) return;
          const text = await response.text();
          if (!text || text.length < 50) return;
          const json = JSON.parse(text);

          if (json.aweme_detail) {
            capturedItem = json.aweme_detail;
            console.log('[API] ✅ aweme_detail');
            return;
          }
          if (json.item_list?.[0]) {
            const match = targetVideoId
              ? json.item_list.find(i => String(i.aweme_id) === targetVideoId)
              : json.item_list[0];
            if (match) { capturedItem = match; console.log('[API] ✅ item_list'); return; }
          }
          if (json.aweme_list && Array.isArray(json.aweme_list)) {
            const match = targetVideoId
              ? json.aweme_list.find(i => String(i.aweme_id) === targetVideoId)
              : null;
            if (match) { capturedItem = match; console.log('[API] ✅ aweme_list'); return; }
          }
          if (targetVideoId) {
            const found = findAwemeById(json, targetVideoId);
            if (found) { capturedItem = found; console.log('[API] ✅ deep search'); return; }
          }
        } catch (_) {}
      }
    });

    console.log('[Scrape] ➡️', inputUrl, '| target:', targetVideoId || 'auto-detect');

    // Navigate + aggressive waiting strategy
    await new Promise((resolve) => {
      let resolved = false;
      const done = () => { if (!resolved) { resolved = true; resolve(); } };

      page.goto(inputUrl, { waitUntil: 'networkidle2', timeout: 40000 })
        .then(done)
        .catch(() => done());

      // Poll for captured data every 300ms
      const interval = setInterval(() => {
        if (capturedItem) {
          clearInterval(interval);
          clearTimeout(maxTimer);
          setTimeout(done, 300);
        }
      }, 300);

      // Max wait 38s
      const maxTimer = setTimeout(() => {
        clearInterval(interval);
        done();
      }, 38000);
    });

    // If not captured yet, wait a bit more for late API responses
    if (!capturedItem) {
      console.log('[Scrape] ⏳ Waiting extra 5s for late API responses...');
      await new Promise(r => setTimeout(r, 5000));
    }

    // Update targetVideoId from final URL
    const finalUrl = page.url();
    if (!targetVideoId) targetVideoId = extractVideoId(finalUrl);

    if (capturedItem) {
      console.log('[Scrape] ✅ Success via API interception');
      return normalizeItem(capturedItem, targetVideoId, finalUrl);
    }

    // Fallback: SSR data from HTML
    console.log('[Scrape] 🔄 Trying SSR extraction...');
    const ssrData = await page.evaluate(() => {
      try {
        const el = document.getElementById('RENDER_DATA');
        if (el) return JSON.parse(decodeURIComponent(el.textContent));
      } catch (e) {}
      try {
        const rd = window.__RENDER_DATA__;
        if (rd) return typeof rd === 'string' ? JSON.parse(decodeURIComponent(rd)) : rd;
      } catch (e) {}
      try {
        const el = document.getElementById('__NEXT_DATA__');
        if (el) return JSON.parse(el.textContent);
      } catch (e) {}
      return null;
    });

    if (ssrData) {
      let item = targetVideoId ? findAwemeById(ssrData, targetVideoId) : null;
      if (!item) item = findAnyAweme(ssrData);
      if (item) {
        console.log('[Scrape] ✅ Success via SSR');
        return normalizeItem(item, targetVideoId, finalUrl);
      }
    }

    // Last resort: page title
    const title = await page.title();
    if (title && title.length > 10 && title !== '抖音') {
      const caption = title.replace(/\s*-\s*抖音$/, '').trim();
      if (caption && caption.length > 5) {
        console.log('[Scrape] ⚠️ Title fallback');
        return {
          success: true, partial: true,
          videoId: targetVideoId || '',
          url: finalUrl,
          caption,
          hasVoice: null,
          note: '⚡ Chỉ lấy được caption từ tiêu đề trang',
        };
      }
    }

    return { success: false, url: finalUrl || inputUrl, error: 'Không thể trích xuất dữ liệu.' };
  } finally {
    await page.close().catch(() => {});
  }
}

// ─── API ──────────────────────────────────────────────────────────────────────
app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string')
    return res.status(400).json({ success: false, error: 'URL không hợp lệ' });

  const trimmedUrl = url.trim();
  console.log('\n===== REQUEST =====\n' + trimmedUrl);

  try {
    const data = await scrapeWithPuppeteer(trimmedUrl);

    if (data.success && data.caption) {
      try {
        data.captionEnglish = await translate(data.caption, { to: 'en' });
      } catch (e) {
        console.log('Translate error:', e.message);
        data.captionEnglish = data.caption;
      }
    } else {
      data.captionEnglish = '';
    }

    res.json(data);
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ success: false, error: `Lỗi: ${err.message}` });
  }
});

app.listen(PORT, () => console.log(`✅ Douyin Bulk Scraper → http://localhost:${PORT}`));
