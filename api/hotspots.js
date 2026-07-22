// ============================================
// 热点抓取 API v2.1
// 多源自动切换,主源挂了自动切备源
// ============================================

const SOURCES_MAP = {
  'xhs': { imsyy: 'xhs', viki: 'xhs', uapis: 'xhs' },
  'douyin': { imsyy: 'douyin', viki: 'douyin', uapis: 'douyin' },
  'weibo': { imsyy: 'weibo', viki: 'weibo', uapis: 'weibo' },
  'bilibili': { imsyy: 'bilibili', viki: 'bili', uapis: 'bilibili' },
  'douban': { imsyy: 'douban-movie', viki: null, uapis: 'douban_movie' }
};

export default async function handler(req, res) {
  const source = req.query.source || 'weibo';
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

async function fetchImsyy(sourceKey) {
  const url = 'https://api-hot.imsyy.top/' + sourceKey + '?cache=true';
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 BCC2-Radar/2.1' },
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
    headers: { 'User-Agent': 'Mozilla/5.0 BCC2-Radar/2.1' },
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
    headers: { 'User-Agent': 'Mozilla/5.0 BCC2-Radar/2.1' },
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
