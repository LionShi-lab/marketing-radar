// ============================================
// 热点抓取 API v2
// 支持: 小红书、抖音、微博、B站、豆瓣
// v2 改动:
//   - 加"新登榜"/"上升"/"爆款"标签识别
//   - 去掉随机 AI 分数
//   - 保持缓存快速响应
// ============================================

const SOURCES = {
  'xhs': 'xhs',
  'douyin': 'douyin',
  'weibo': 'weibo',
  'bilibili': 'bilibili',
  'douban': 'douban-movie'
};

export default async function handler(req, res) {
  const source = req.query.source || 'xhs';
  const apiSource = SOURCES[source] || source;
  
  try {
    const upstream = `https://api-hot.imsyy.top/${apiSource}?cache=true`;
    
    const response = await fetch(upstream, {
      headers: { 'User-Agent': 'Mozilla/5.0 BCC2-Radar/2.0' },
      signal: AbortSignal.timeout(15000)
    });
    
    if (!response.ok) {
      throw new Error(`上游 API 返回 ${response.status}`);
    }
    
    const data = await response.json();
    const rawItems = data.data || [];
    
    // v2: 增加状态识别
    const items = rawItems.slice(0, 30).map((item, idx) => {
      const rank = idx + 1;
      const hot = formatHot(item.hot);
      const title = item.title || item.name || '未知标题';
      
      // 识别状态标签
      let status = null;
      if (rank <= 3) status = 'hot';
      else if (rank <= 10) status = 'rising';
      
      // 从标题识别"爆"、"新"等关键词
      if (title.includes('爆') || title.includes('刷屏')) status = 'hot';
      if (title.includes('新') && !status) status = 'new';
      
      return {
        title: title,
        hot: hot,
        rank: rank,
        url: item.url || item.mobileUrl || '',
        desc: item.desc || '',
        time: item.timestamp ? formatTime(item.timestamp) : '',
        status: status,
        tags: extractTagsFromTitle(title)
      };
    });
    
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
    res.status(200).json({
      source: source,
      updateTime: new Date().toISOString(),
      items: items
    });
  } catch (err) {
    res.status(200).json({
      source: source,
      updateTime: new Date().toISOString(),
      items: getDemoData(source),
      demo: true,
      note: '上游 API 暂时不可用,当前为演示数据: ' + err.message
    });
  }
}

function formatHot(hot) {
  if (!hot) return '';
  const num = parseInt(hot);
  if (isNaN(num)) return String(hot);
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿';
  if (num >= 10000) return (num / 10000).toFixed(1) + '万';
  return String(num);
}

function formatTime(ts) {
  try {
    const d = new Date(Number(ts));
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch(e) {
    return '';
  }
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
  const demos = {
    'xhs': [
      { title: '#此刻上游 API 暂时不可用#', hot: '演示', rank: 1, url: 'https://www.xiaohongshu.com/', desc: '正在使用演示数据,几分钟后自动恢复', time: now, status: 'hot', tags: ['演示'] }
    ],
    'douyin': [
      { title: '#此刻上游 API 暂时不可用#', hot: '演示', rank: 1, url: 'https://www.douyin.com/', desc: '', time: now, status: 'hot', tags: ['演示'] }
    ],
    'weibo': [
      { title: '#此刻上游 API 暂时不可用#', hot: '演示', rank: 1, url: 'https://weibo.com/', desc: '', time: now, status: 'hot', tags: ['演示'] }
    ],
    'bilibili': [
      { title: '此刻上游 API 暂时不可用', hot: '演示', rank: 1, url: 'https://www.bilibili.com/', desc: '', time: now, status: 'hot', tags: ['演示'] }
    ],
    'douban': [
      { title: '此刻上游 API 暂时不可用', hot: '演示', rank: 1, url: 'https://movie.douban.com/', desc: '', time: now, status: 'hot', tags: ['演示'] }
    ]
  };
  return demos[source] || demos['weibo'];
}
