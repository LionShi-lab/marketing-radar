// ============================================
// 热点抓取 API v2.3
// 
// v2.3 关键改动:
//   - 豆瓣改用官方页面直抓 (movie.douban.com + 豆瓣小组 hot_groups)
//   - 其他 4 平台 (小红书/抖音/微博/B站) 保持多源自动切换
// ============================================

const SOURCES_MAP = {
  'xhs': { imsyy: 'xhs', viki: 'xhs', uapis: 'xhs' },
  'douyin': { imsyy: 'douyin', viki: 'douyin', uapis: 'douyin' },
  'weibo': { imsyy: 'weibo', viki: 'weibo', uapis: 'weibo' },
  'bilibili': { imsyy: 'bilibili', viki: 'bili', uapis: 'bilibili' }
};

export default async function handler(req, res) {
  const source = req.query.source || 'weibo';
  
  // 豆瓣走独立通道:官方页面直抓
  if (source === 'douban') {
    return handleDouban(req, res);
  }
  
  const sourceMap = SOURCES_MAP[source];
  if (!sourceMap) {
    return res.status(400).json({ error: '不支持的数据源: ' + source });
  }
  
  const errors = [];
  const strategies = [
    { name: 'imsyy', fn: () => fetchImsyy(sourceMap.imsyy) },
    { name: 'viki', fn: () => sourceMap.viki ? fetchViki(sourceMap.viki) : Promise.reject('无 viki 源') },
    { name: 'uapis', fn: () => fetchUapis(sourceMap.uapis) }
  ];
  
  for (const strategy of strategies) {
    try {
      const items = await strategy.fn();
      if (items && items.length > 0) {
        res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
        return res.status(200).json({
          source: source,
          upstream: strategy.name,
          updateTime: new Date().toISOString(),
          items: items
        });
      }
      errors.push(strategy.name + ': 返回空');
    } catch (err) {
      errors.push(strategy.name + ': ' + err.message);
    }
  }
  
  res.status(200).json({
    source: source,
    upstream: 'all-failed',
    updateTime: new Date().toISOString(),
    items: getDemoData(source),
    demo: true,
    note: '所有源暂时不可用: ' + errors.join(' | ')
  });
}

// ============================================
// 豆瓣独立处理 (v2.3 新增)
// 数据源:
//   1. 豆瓣热门小组 (movie.douban.com/group/explore/hot_groups)
//   2. 豆瓣正在热映 (movie.douban.com)
// ============================================
async function handleDouban(req, res) {
  const errors = [];
  const allItems = [];
  
  // 尝试抓豆瓣热门小组(讨论话题)
  try {
    const groupItems = await fetchDoubanHotGroups();
    if (groupItems && groupItems.length > 0) {
      allItems.push(...groupItems);
    }
  } catch (err) {
    errors.push('hot_groups: ' + err.message);
  }
  
  // 尝试抓豆瓣正在热映(影视)
  try {
    const movieItems = await fetchDoubanShowingMovies();
    if (movieItems && movieItems.length > 0) {
      allItems.push(...movieItems);
    }
  } catch (err) {
    errors.push('showing: ' + err.message);
  }
  
  if (allItems.length > 0) {
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
    return res.status(200).json({
      source: 'douban',
      upstream: 'douban-official',
      updateTime: new Date().toISOString(),
      items: allItems.slice(0, 30)
    });
  }
  
  // 都挂了,兜底
  res.status(200).json({
    source: 'douban',
    upstream: 'failed',
    items: [{
      title: '⚠️ 豆瓣暂时不可用',
      hot: '',
      rank: 1,
      url: 'https://movie.douban.com/',
      desc: errors.join(' | '),
      time: '',
      status: null,
      tags: ['系统提示']
    }],
    demo: true
  });
}

// 抓豆瓣热门小组
async function fetchDoubanHotGroups() {
  const response = await fetch('https://www.douban.com/group/explore/hot_groups', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    },
    signal: AbortSignal.timeout(15000)
  });
  
  if (!response.ok) throw new Error('HTTP ' + response.status);
  
  const html = await response.text();
  const items = [];
  const seen = new Set();
  
  // 匹配小组卡片: <div class="result">...</div>
  // 每个小组包含: 名称(<h3><a>) + 火力值(class="info") + 描述(<p>)
  const groupPattern = /<div\s+class="result">([\s\S]*?)<\/div>\s*<\/div>/g;
  let match;
  
  while ((match = groupPattern.exec(html)) !== null && items.length < 20) {
    const block = match[1];
    
    // 提取小组名称
    const titleMatch = block.match(/<h3><a[^>]+href="(https?:\/\/www\.douban\.com\/group\/\d+\/?)"[^>]*>([^<]+)<\/a><\/h3>/);
    if (!titleMatch) continue;
    
    const url = titleMatch[1];
    const title = cleanText(titleMatch[2]);
    
    if (seen.has(url)) continue;
    seen.add(url);
    
    // 提取火力值
    const hotMatch = block.match(/<div\s+class="info">([\s\S]*?)<\/div>/);
    const hotText = hotMatch ? cleanText(hotMatch[1]) : '';
    const hotNum = hotText.match(/(\d+)/);
    const hot = hotNum ? formatHot(hotNum[1]) : '';
    
    // 提取描述
    const descMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const desc = descMatch ? cleanText(descMatch[1]).slice(0, 100) : '';
    
    items.push({
      title: title,
      hot: hot + ' 火力值',
      rank: items.length + 1,
      url: url,
      desc: desc,
      time: '',
      status: items.length < 3 ? 'hot' : (items.length < 10 ? 'rising' : null),
      tags: extractGroupTags(title, desc)
    });
  }
  
  return items;
}

// 抓豆瓣正在热映
async function fetchDoubanShowingMovies() {
  const response = await fetch('https://movie.douban.com/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    },
    signal: AbortSignal.timeout(15000)
  });
  
  if (!response.ok) throw new Error('HTTP ' + response.status);
  
  const html = await response.text();
  const items = [];
  const seen = new Set();
  
  // 匹配电影链接:含 from=showing 参数
  // <a onclick="moreurl(this, {from:'mv_a_tl'})" href="https://movie.douban.com/subject/xxx/?from=showing">电影名</a>
  const moviePatterns = [
    /<li[^>]*data-title="([^"]+)"[^>]*data-actors="([^"]*)"[^>]*data-region="([^"]*)"[^>]*data-release="([^"]*)"[^>]*data-rate="([^"]*)"[^>]*>[\s\S]*?<a[^>]+href="(https?:\/\/movie\.douban\.com\/subject\/\d+\/)"/g,
    /<a[^>]+href="(https?:\/\/movie\.douban\.com\/subject\/\d+\/\?from=showing)"[^>]*>([^<]+)<\/a>/g
  ];
  
  // 第一种:结构化数据
  let match;
  while ((match = moviePatterns[0].exec(html)) !== null && items.length < 10) {
    const url = match[6];
    if (seen.has(url)) continue;
    seen.add(url);
    
    const title = cleanText(match[1]);
    const actors = cleanText(match[2]);
    const region = cleanText(match[3]);
    const rate = cleanText(match[5]);
    
    let desc = '';
    if (region) desc += region;
    if (actors) desc += (desc ? ' · ' : '') + '主演:' + actors.slice(0, 30);
    
    items.push({
      title: '🎬 ' + title + (rate ? ` (${rate}分)` : ''),
      hot: rate ? rate + '分' : '正在热映',
      rank: items.length + 1,
      url: url,
      desc: desc || '正在热映',
      time: '',
      status: parseFloat(rate) >= 8.0 ? 'hot' : 'new',
      tags: extractMovieTags(title, region)
    });
  }
  
  // 第二种:兜底,如果第一种没抓到
  if (items.length === 0) {
    while ((match = moviePatterns[1].exec(html)) !== null && items.length < 10) {
      const url = match[1];
      const title = cleanText(match[2]);
      if (seen.has(url) || !title || title.length < 2) continue;
      seen.add(url);
      
      items.push({
        title: '🎬 ' + title,
        hot: '正在热映',
        rank: items.length + 1,
        url: url,
        desc: '',
        time: '',
        status: 'new',
        tags: ['电影']
      });
    }
  }
  
  return items;
}

function extractGroupTags(title, desc) {
  const tags = [];
  const text = title + ' ' + desc;
  const patterns = [
    { key: '综艺', label: '综艺' },
    { key: '电视剧', label: '剧集' },
    { key: '电影', label: '电影' },
    { key: '偶像', label: '偶像' },
    { key: '动漫', label: '动漫' },
    { key: '游戏', label: '游戏' },
    { key: '生活', label: '生活' },
    { key: '旅游', label: '旅游' },
    { key: '美食', label: '美食' },
    { key: '八卦', label: '八卦' },
    { key: '穿搭', label: '穿搭' },
    { key: '追星', label: '追星' }
  ];
  for (const p of patterns) {
    if (text.includes(p.key)) tags.push(p.label);
  }
  if (tags.length === 0) tags.push('讨论组');
  return [...new Set(tags)].slice(0, 3);
}

function extractMovieTags(title, region) {
  const tags = [];
  if (region.includes('中国')) tags.push('国产');
  if (region.includes('美国')) tags.push('好莱坞');
  if (region.includes('日本')) tags.push('日本');
  if (region.includes('韩国')) tags.push('韩国');
  const patterns = [
    { key: '动画', label: '动画' },
    { key: '喜剧', label: '喜剧' },
    { key: '爱情', label: '爱情' },
    { key: '悬疑', label: '悬疑' },
    { key: '战争', label: '战争' },
    { key: '剧情', label: '剧情' }
  ];
  for (const p of patterns) {
    if (title.includes(p.key)) tags.push(p.label);
  }
  if (tags.length === 0) tags.push('热映');
  return [...new Set(tags)].slice(0, 3);
}

// ============================================
// 其他 4 平台的多源抓取 (保持不变)
// ============================================
async function fetchImsyy(sourceKey) {
  const url = 'https://api-hot.imsyy.top/' + sourceKey + '?cache=true';
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 BCC2-Radar/2.3' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const data = await response.json();
  const raw = data.data || [];
  return raw.slice(0, 30).map((item, idx) => normalizeItem(item, idx));
}

async function fetchViki(sourceKey) {
  const url = 'https://60s.viki.moe/v2/' + sourceKey;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 BCC2-Radar/2.3' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const data = await response.json();
  const raw = data.data || [];
  const list = Array.isArray(raw) ? raw : (raw.list || []);
  return list.slice(0, 30).map((item, idx) => normalizeItem({
    title: item.title || item.word || item.name,
    hot: item.hot || item.hot_value || item.hot_num,
    url: item.link || item.url || item.mobile_url,
    desc: item.desc || item.description || ''
  }, idx));
}

async function fetchUapis(sourceKey) {
  const url = 'https://uapis.cn/api/v1/misc/hotboard?type=' + sourceKey;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 BCC2-Radar/2.3' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const data = await response.json();
  const raw = data.list || data.results || [];
  return raw.slice(0, 30).map((item, idx) => normalizeItem({
    title: item.title,
    hot: item.hot_value,
    url: item.url,
    desc: item.desc || ''
  }, idx));
}

function normalizeItem(item, idx) {
  const rank = idx + 1;
  const title = item.title || item.name || '未知标题';
  const hot = formatHot(item.hot);
  
  let status = null;
  if (rank <= 3) status = 'hot';
  else if (rank <= 10) status = 'rising';
  if (title.includes('爆') || title.includes('刷屏')) status = 'hot';
  if (title.includes('新') && !status) status = 'new';
  
  return {
    title: title,
    hot: hot,
    rank: rank,
    url: item.url || '',
    desc: item.desc || '',
    time: '',
    status: status,
    tags: extractTagsFromTitle(title)
  };
}

function formatHot(hot) {
  if (!hot) return '';
  const num = parseInt(hot);
  if (isNaN(num)) return String(hot);
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿';
  if (num >= 10000) return (num / 10000).toFixed(1) + '万';
  return String(num);
}

function extractTagsFromTitle(title) {
  const tags = [];
  const patterns = [
    { key: '联名', label: '联名' },
    { key: '×', label: '跨界' },
    { key: '合作', label: '合作' },
    { key: '快闪', label: '快闪' },
    { key: '限定', label: '限定' },
    { key: '新品', label: '新品' },
    { key: '代言', label: '代言人' },
    { key: 'CP', label: 'CP' },
    { key: '短剧', label: '短剧' },
    { key: 'IP', label: 'IP' },
    { key: '出圈', label: '出圈' },
    { key: '断货', label: '断货' },
    { key: '爆火', label: '爆火' }
  ];
  for (const p of patterns) {
    if (title.includes(p.key)) tags.push(p.label);
  }
  return [...new Set(tags)].slice(0, 3);
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
    .replace(/🔥/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getDemoData(source) {
  const now = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return [{
    title: '⚠️ 所有热搜源暂时不可用',
    hot: '',
    rank: 1,
    url: '#',
    desc: '3 个免费源都无响应,请几分钟后刷新',
    time: now,
    status: null,
    tags: ['系统提示']
  }];
}
