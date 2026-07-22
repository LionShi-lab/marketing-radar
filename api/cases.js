// ============================================
// 案例抓取 API v2.2
// SocialBeta: class="tit" + /campaign/数字
// 广告门:    class="article_2_href" + /article/数字
// 数英:      RSS
// ============================================

const SOURCES = {
  'socialbeta': { name: 'SocialBeta', url: 'https://socialbeta.com/', type: 'html' },
  'adquan': { name: '广告门', url: 'https://www.adquan.com/', type: 'html' },
  'digitaling': { name: '数英网', url: 'https://www.digitaling.com/rss', type: 'rss' }
};

export default async function handler(req, res) {
  const source = req.query.source || 'socialbeta';
  const config = SOURCES[source];
  
  if (!config) return res.status(400).json({ error: '不支持的数据源: ' + source });
  
  try {
    let items = [];
    if (config.type === 'rss') items = await fetchRSS(config.url);
    else if (source === 'socialbeta') items = await fetchSocialBeta();
    else if (source === 'adquan') items = await fetchAdquan();
    
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
    res.status(200).json({
      source: source,
      sourceName: config.name,
      updateTime: new Date().toISOString(),
      count: items.length,
      items: items.slice(0, 30)
    });
  } catch (err) {
    res.status(200).json({
      source: source,
      sourceName: config.name,
      items: [{ title: '⚠️ 抓取失败: ' + err.message, url: config.url, desc: '', time: '', author: '', tags: [] }],
      demo: true
    });
  }
}

async function fetchRSS(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 BCC2-Radar/2.2' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('RSS 拉取失败: ' + response.status);
  
  const xml = await response.text();
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xml)) !== null && items.length < 30) {
    const itemXml = match[1];
    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link');
    const pubDate = extractTag(itemXml, 'pubDate');
    const description = extractTag(itemXml, 'description');
    const author = extractTag(itemXml, 'author') || extractTag(itemXml, 'dc:creator');
    
    if (title) {
      items.push({
        title: cleanText(title),
        url: link,
        desc: cleanText(description).slice(0, 150),
        time: formatDate(pubDate),
        author: cleanText(author).slice(0, 20),
        tags: extractTagsFromTitle(title)
      });
    }
  }
  return items;
}

async function fetchSocialBeta() {
  const response = await fetch('https://socialbeta.com/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('SocialBeta 拉取失败: ' + response.status);
  
  const html = await response.text();
  const items = [];
  const seen = new Set();
  
  const patterns = [
    /<a\s+href="(https?:\/\/socialbeta\.com\/campaign\/\d+)"[^>]*class="tit"[^>]*>([\s\S]*?)<\/a>/g,
    /<a[^>]*class="tit"[^>]*href="(https?:\/\/socialbeta\.com\/campaign\/\d+)"[^>]*>([\s\S]*?)<\/a>/g,
    /<a[^>]+href="(\/campaign\/\d+)"[^>]*>([\s\S]*?)<\/a>/g,
    /<a[^>]+href="(https?:\/\/socialbeta\.com\/campaign\/\d+)"[^>]*>([\s\S]*?)<\/a>/g,
    /<a[^>]+href="(\/article\/\d+)"[^>]*>([\s\S]*?)<\/a>/g,
    /<a[^>]+href="(https?:\/\/socialbeta\.com\/article\/\d+)"[^>]*>([\s\S]*?)<\/a>/g
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null && items.length < 30) {
      const rawUrl = match[1];
      const url = rawUrl.startsWith('http') ? rawUrl : 'https://socialbeta.com' + rawUrl;
      const title = cleanText(match[2]);
      if (title && title.length >= 5 && title.length < 200 && !seen.has(url)) {
        seen.add(url);
        items.push({ title, url, desc: '', time: '', author: '', tags: extractTagsFromTitle(title) });
      }
    }
  }
  return items;
}

async function fetchAdquan() {
  const response = await fetch('https://www.adquan.com/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('广告门拉取失败: ' + response.status);
  
  const html = await response.text();
  const items = [];
  const seen = new Set();
  
  const patterns = [
    /<a[^>]*class="article_2_href"[^>]*href="(https?:\/\/www\.adquan\.com\/article\/\d+)"[^>]*>([\s\S]*?)<\/a>/g,
    /<a\s+[^>]*href="(https?:\/\/www\.adquan\.com\/article\/\d+)"[^>]*class="article_2_href"[^>]*>([\s\S]*?)<\/a>/g,
    /<a[^>]+href="(\/article\/\d+)"[^>]*>([\s\S]*?)<\/a>/g,
    /<a[^>]+href="(https?:\/\/www\.adquan\.com\/article\/\d+)"[^>]*>([\s\S]*?)<\/a>/g
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null && items.length < 30) {
      const rawUrl = match[1];
      const url = rawUrl.startsWith('http') ? rawUrl : 'https://www.adquan.com' + rawUrl;
      const title = cleanText(match[2]);
      if (title && title.length >= 5 && title.length < 200 && !seen.has(url) && !isNavLink(title)) {
        seen.add(url);
        items.push({ title, url, desc: '', time: '', author: '', tags: extractTagsFromTitle(title) });
      }
    }
  }
  return items;
}

function isNavLink(text) {
  const navKeywords = ['首页', '登录', '注册', '关于我们', '联系我们', '广告合作', '案例中心', '视频', '资讯', '专题', '订阅', '更多', 'RSS', 'App'];
  return navKeywords.some(kw => text === kw || (text.length < 8 && text.includes(kw)));
}

function extractTag(xml, tag) {
  const escaped = tag.replace(':', '\\:');
  const cdataRegex = new RegExp('<' + escaped + '[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></' + escaped + '>');
  const normalRegex = new RegExp('<' + escaped + '[^>]*>([\\s\\S]*?)</' + escaped + '>');
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();
  const normalMatch = xml.match(normalRegex);
  if (normalMatch) return normalMatch[1].trim();
  return '';
}

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffHours = (now - d) / (1000 * 60 * 60);
    if (diffHours < 1) return Math.floor(diffHours * 60) + '分钟前';
    if (diffHours < 24) return Math.floor(diffHours) + '小时前';
    if (diffHours < 24 * 7) return Math.floor(diffHours / 24) + '天前';
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  } catch(e) { return ''; }
}

function extractTagsFromTitle(title) {
  const tags = [];
  const patterns = [
    { key: '联名', label: '联名' },
    { key: '×', label: '跨界' },
    { key: '快闪', label: '快闪' },
    { key: '限定', label: '限定' },
    { key: '新品', label: '新品' },
    { key: '代言', label: '代言人' },
    { key: 'CP', label: 'CP' },
    { key: '短剧', label: '短剧' },
    { key: 'IP', label: 'IP' },
    { key: '春节', label: 'CNY' },
    { key: '出圈', label: '出圈' }
  ];
  for (const p of patterns) {
    if (title.includes(p.key)) tags.push(p.label);
  }
  return [...new Set(tags)].slice(0, 3);
}
