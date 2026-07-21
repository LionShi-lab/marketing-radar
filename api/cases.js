// ============================================
// 案例抓取 API
// 支持: SocialBeta / 广告门 / 数英
// 数据源: RSS + 官网抓取
// ============================================

const SOURCES = {
  'socialbeta': {
    name: 'SocialBeta',
    url: 'https://socialbeta.com/',
    type: 'html'
  },
  'adquan': {
    name: '广告门',
    url: 'https://www.adquan.com/',
    type: 'html'
  },
  'digitaling': {
    name: '数英网',
    url: 'https://www.digitaling.com/rss',
    type: 'rss'
  }
};

export default async function handler(req, res) {
  const source = req.query.source || 'socialbeta';
  const config = SOURCES[source];
  
  if (!config) {
    return res.status(400).json({ error: '不支持的数据源: ' + source });
  }
  
  try {
    let items = [];
    
    if (config.type === 'rss') {
      items = await fetchRSS(config.url);
    } else {
      items = await fetchHTML(config.url, source);
    }
    
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
    res.status(200).json({
      source: source,
      sourceName: config.name,
      updateTime: new Date().toISOString(),
      items: items.slice(0, 30)
    });
  } catch (err) {
    // 兜底演示数据
    res.status(200).json({
      source: source,
      sourceName: config.name,
      updateTime: new Date().toISOString(),
      items: getDemoData(source),
      demo: true,
      note: '当前使用演示数据。抓取失败: ' + err.message
    });
  }
}

// ============================================
// RSS 抓取(数英)
// ============================================
async function fetchRSS(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 BCC2-Radar/1.0' },
    signal: AbortSignal.timeout(15000)
  });
  
  if (!response.ok) throw new Error('RSS 拉取失败: ' + response.status);
  
  const xml = await response.text();
  const items = [];
  
  // 简易 XML 解析: 匹配 <item>...</item>
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xml)) !== null && items.length < 30) {
    const itemXml = match[1];
    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link');
    const pubDate = extractTag(itemXml, 'pubDate');
    const description = extractTag(itemXml, 'description');
    
    if (title) {
      items.push({
        title: cleanText(title),
        url: link,
        desc: cleanText(description).slice(0, 150),
        time: formatDate(pubDate),
        insight: '',
        tags: []
      });
    }
  }
  
  return items;
}

// ============================================
// HTML 抓取(SocialBeta / 广告门)
// ============================================
async function fetchHTML(url, source) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml'
    },
    signal: AbortSignal.timeout(15000)
  });
  
  if (!response.ok) throw new Error(source + ' 页面拉取失败: ' + response.status);
  
  const html = await response.text();
  
  if (source === 'socialbeta') {
    return parseSocialBeta(html);
  } else if (source === 'adquan') {
    return parseAdquan(html);
  }
  
  return [];
}

// SocialBeta 简易解析
function parseSocialBeta(html) {
  const items = [];
  // 匹配文章标题和链接的常见模式
  const patterns = [
    /<a[^>]+href="(\/campaign\/\d+[^"]*)"[^>]*>([^<]+)<\/a>/g,
    /<a[^>]+href="(\/article\/\d+[^"]*)"[^>]*>([^<]+)<\/a>/g,
    /<a[^>]+href="(https?:\/\/socialbeta\.com\/[^"]+)"[^>]*>([^<]{5,120})<\/a>/g
  ];
  
  const seen = new Set();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null && items.length < 30) {
      const url = match[1].startsWith('http') ? match[1] : 'https://socialbeta.com' + match[1];
      const title = cleanText(match[2]);
      if (title && title.length >= 5 && !seen.has(url)) {
        seen.add(url);
        items.push({
          title: title,
          url: url,
          desc: '',
          time: '',
          insight: '',
          tags: extractTagsFromTitle(title)
        });
      }
    }
  }
  
  return items;
}

// 广告门简易解析
function parseAdquan(html) {
  const items = [];
  const patterns = [
    /<a[^>]+href="(\/article\/[^"]+)"[^>]*>([^<]{5,120})<\/a>/g,
    /<a[^>]+href="(https?:\/\/www\.adquan\.com\/[^"]+\.html)"[^>]*>([^<]{5,120})<\/a>/g
  ];
  
  const seen = new Set();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null && items.length < 30) {
      const url = match[1].startsWith('http') ? match[1] : 'https://www.adquan.com' + match[1];
      const title = cleanText(match[2]);
      if (title && title.length >= 5 && !seen.has(url)) {
        seen.add(url);
        items.push({
          title: title,
          url: url,
          desc: '',
          time: '',
          insight: '',
          tags: extractTagsFromTitle(title)
        });
      }
    }
  }
  
  return items;
}

// ============================================
// 工具函数
// ============================================
function extractTag(xml, tag) {
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`);
  const normalRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
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
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  } catch(e) {
    return '';
  }
}

function extractTagsFromTitle(title) {
  const tags = [];
  const patterns = [
    { key: '联名', label: '联名' },
    { key: '×', label: '跨界' },
    { key: 'x ', label: '跨界' },
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

// ============================================
// 演示数据
// ============================================
function getDemoData(source) {
  const demos = {
    'socialbeta': [
      { title: '双汇 × 太太乐 玩了一场"小学生商战"', url: 'https://socialbeta.com/', desc: '品牌人格化 UGC 迷因典型案例', time: '今天', insight: '低姿态接梗 = 品牌年轻化捷径', tags: ['品牌人格化', 'UGC'] },
      { title: 'Rays 潮玩承接甜玉米 CP 粉,24 小时破 1100 万', url: 'https://socialbeta.com/', desc: '', time: '昨天', insight: 'CP 粉自下而上选品牌', tags: ['CP', '粉丝共创'] },
      { title: '优衣库娃衣:非官方联名的教科书', url: 'https://socialbeta.com/', desc: '', time: '昨天', insight: '尺寸即联名,零 IP 费的极致', tags: ['联名', '潮玩'] }
    ],
    'adquan': [
      { title: '麦当劳"麦麦岛":世界观×任务×生态的长线打法', url: 'https://www.adquan.com/', desc: '', time: '今天', insight: '从促销升级为品牌宇宙', tags: ['世界观', 'IP'] },
      { title: '伊利 × 马伊琍谐音梗,网友已经开始"考古"', url: 'https://www.adquan.com/', desc: '', time: '昨天', insight: 'CNY 时令梗,快速反应=赢面', tags: ['CNY', '谐音梗'] }
    ],
    'digitaling': [
      { title: '短剧《盛夏芬德拉》上线 14 天播放破 30 亿', url: 'https://www.digitaling.com/', desc: '短剧细糠时代来临', time: '今天', insight: '短剧内容精品化拐点', tags: ['短剧', '细糠'] },
      { title: '娇兰在乌镇戏剧节做"香氛沉浸式体验"', url: 'https://www.digitaling.com/', desc: '', time: '昨天', insight: '文化节 = 高势能品牌场', tags: ['文化事件', '沉浸式'] }
    ]
  };
  return demos[source] || demos['socialbeta'];
}
