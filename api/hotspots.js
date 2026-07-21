// ============================================
// 热点抓取 API
// 支持: 小红书、抖音、微博、B站、豆瓣
// 数据源: 免费公开 API
// ============================================

const SOURCES = {
  'xhs': 'xhs',
  'xhs-ugc': 'xhs',
  'douyin': 'douyin',
  'weibo': 'weibo',
  'bilibili': 'bilibili',
  'douban': 'douban-movie'
};

export default async function handler(req, res) {
  const source = req.query.source || 'xhs';
  const apiSource = SOURCES[source] || source;
  
  try {
    // 尝试免费聚合 API (DailyHot 示例站)
    const upstream = `https://api-hot.imsyy.top/${apiSource}?cache=true`;
    
    const response = await fetch(upstream, {
      headers: { 'User-Agent': 'Mozilla/5.0 BCC2-Radar/1.0' },
      signal: AbortSignal.timeout(15000)
    });
    
    if (!response.ok) {
      throw new Error(`上游 API 返回 ${response.status}`);
    }
    
    const data = await response.json();
    const rawItems = data.data || [];
    
    // 转换为统一格式
    const items = rawItems.slice(0, 30).map((item, idx) => ({
      title: item.title || item.name || '未知标题',
      hot: formatHot(item.hot),
      rank: idx + 1,
      url: item.url || item.mobileUrl || '',
      desc: item.desc || '',
      time: item.timestamp ? formatTime(item.timestamp) : '',
      aiScore: null,     // 后续可以接 AI 打分
      insight: '',        // 后续可以接 AI 洞察
      tags: []
    }));
    
    // 简单过滤: xhs-ugc 优先"品牌可参与"关键词
    let filtered = items;
    if (source === 'xhs-ugc') {
      const brandKeywords = ['联名', '×', '合作', '快闪', '限定', '新品', '代言', 'CP', '出圈', '爆火'];
      filtered = items.filter(item => 
        brandKeywords.some(kw => (item.title + item.desc).includes(kw))
      );
      if (filtered.length < 5) filtered = items;
    }
    
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
    res.status(200).json({
      source: source,
      updateTime: new Date().toISOString(),
      items: filtered
    });
  } catch (err) {
    // 上游失败时返回演示数据
    res.status(200).json({
      source: source,
      updateTime: new Date().toISOString(),
      items: getDemoData(source),
      demo: true,
      note: '当前使用演示数据。上游 API 暂时不可用: ' + err.message
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

// 演示数据: 上游 API 失败时兜底
function getDemoData(source) {
  const demos = {
    'xhs': [
      { title: '#双汇粉猪表情包又火了#', hot: '2.3亿', rank: 1, url: 'https://www.xiaohongshu.com/', desc: '', insight: '品牌 IP 人格化经典案例', tags: ['品牌人格化', 'UGC'] },
      { title: '#Labubu 圣诞限定断货#', hot: '1.8亿', rank: 2, url: 'https://www.xiaohongshu.com/', desc: '', insight: 'Labubu 依然是流量密码', tags: ['潮玩', 'IP'] },
      { title: '#优衣库娃衣穿搭大赛#', hot: '9500万', rank: 3, url: 'https://www.xiaohongshu.com/', desc: '', insight: '非官方联名典范', tags: ['娃圈', '晒图'] }
    ],
    'xhs-ugc': [
      { title: '素人在小红书发的"新品测评"上了热搜', hot: '860万', rank: 1, url: 'https://www.xiaohongshu.com/', desc: '', insight: 'UGC 爆款苗头,值得追踪', tags: ['UGC', '测评'] }
    ],
    'douyin': [
      { title: '#大湾鸡赛博出勤打卡#', hot: '5.6亿', rank: 1, url: 'https://www.douyin.com/', desc: '', insight: '官方 IP × 草根表演', tags: ['吉祥物', '反差'] },
      { title: '#太奶奶4 预约#', hot: '3.2亿', rank: 2, url: 'https://www.douyin.com/', desc: '', insight: '短剧续集流量保险', tags: ['短剧'] }
    ],
    'weibo': [
      { title: '#伊利马年官宣马伊琍#', hot: '4.1亿', rank: 1, url: 'https://weibo.com/', desc: '', insight: '谐音梗 + 时令的完美结合', tags: ['CNY', '谐音梗'] },
      { title: '#盛夏芬德拉播放破 50 亿#', hot: '2.7亿', rank: 2, url: 'https://weibo.com/', desc: '', insight: '短剧细糠时代', tags: ['短剧'] }
    ],
    'bilibili': [
      { title: '逃离鸭科夫玩到深夜合集', hot: '820万播放', rank: 1, url: 'https://www.bilibili.com/', desc: '', insight: 'B站自研自发的黑马', tags: ['游戏', '独立'] }
    ],
    'douban': [
      { title: '盛夏芬德拉评分升至 8.9', hot: '9.2万', rank: 1, url: 'https://movie.douban.com/', desc: '', insight: '文艺短剧口碑发酵中', tags: ['短剧', '口碑'] }
    ]
  };
  return demos[source] || demos['weibo'];
}
