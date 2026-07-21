// ============================================
// 监控项 AI 智能解析
// 输入: 一批杂乱的文本行(关键词/URL/@账号)
// 输出: 结构化的监控项列表
// AI 引擎: DeepSeek (可切换 Claude/OpenAI/Azure)
// ============================================

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持 POST' });
  }
  
  const { items } = req.body || {};
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '请提供 items 数组' });
  }
  
  // 限制单次数量
  const inputs = items.slice(0, 100);
  
  try {
    // 优先走 AI 解析
    const apiKey = process.env.DEEPSEEK_API_KEY;
    
    if (apiKey) {
      const parsed = await parseByAI(inputs, apiKey);
      return res.status(200).json({ parsed, method: 'ai' });
    }
    
    // Fallback: 规则解析
    const parsed = inputs.map(parseByRule);
    return res.status(200).json({ 
      parsed, 
      method: 'rule',
      note: 'AI 未配置,当前使用规则解析。配置 DEEPSEEK_API_KEY 可启用 AI 智能识别'
    });
  } catch (err) {
    // AI 失败也走规则
    const parsed = inputs.map(parseByRule);
    res.status(200).json({ 
      parsed, 
      method: 'rule-fallback',
      note: 'AI 调用失败,回退到规则解析: ' + err.message
    });
  }
}

// ============================================
// AI 解析(DeepSeek)
// ============================================
async function parseByAI(inputs, apiKey) {
  const systemPrompt = `你是 BCC2 内容组的营销雷达助手,任务是把用户输入的杂乱清单结构化为监控项。

判断规则:
- 剧集/综艺/短剧/游戏/动漫 → type=track, category=剧/综/短剧/游戏/动漫等
- 品牌名(如蜜雪冰城、优衣库) → type=brand
- IP/角色/梗/文化符号(如 Labubu、大湾鸡、哈基米) → type=ip
- URL 网址 → type=url, 根据域名判断分类
- @开头的社交账号 → type=account
- 名人/艺人/KOL → type=ip, category=艺人

输出格式(严格 JSON):
{
  "items": [
    {"name": "Labubu", "type": "ip", "category": "潮玩", "keywords": ["Labubu","拉布布"], "url": ""},
    ...
  ]
}

注意:
- keywords 最多 5 个,包含常见别名
- category 用中文简短标签(如"热剧"/"短剧"/"食饮"/"美妆"/"潮玩"/"艺人")
- 无法判断的默认 type=ip`;

  const userPrompt = `请解析以下清单(每行一条):\n\n${inputs.join('\n')}`;
  
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4000
    }),
    signal: AbortSignal.timeout(30000)
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek API 返回 ${response.status}: ${errText.slice(0, 200)}`);
  }
  
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch(e) {
    throw new Error('AI 返回格式错误: ' + content.slice(0, 200));
  }
  
  const items = parsed.items || [];
  
  // 补齐字段
  return items.map(item => ({
    name: item.name || '',
    type: item.type || 'ip',
    category: item.category || '',
    keywords: Array.isArray(item.keywords) && item.keywords.length > 0 
      ? item.keywords 
      : [item.name],
    url: item.url || ''
  })).filter(item => item.name);
}

// ============================================
// 规则解析(AI 未配置时的兜底)
// ============================================
function parseByRule(raw) {
  const line = String(raw).trim();
  
  // URL 判断
  if (/^https?:\/\//.test(line)) {
    const category = detectUrlCategory(line);
    const name = extractNameFromUrl(line);
    return {
      name: name,
      type: 'url',
      category: category,
      keywords: [name],
      url: line
    };
  }
  
  // @ 开头 = 账号
  if (line.startsWith('@')) {
    const name = line.slice(1).trim();
    return {
      name: name,
      type: 'account',
      category: '社交账号',
      keywords: [name],
      url: ''
    };
  }
  
  // 结构化输入: "名称 分类 时间"
  const structMatch = line.match(/^(\S+)\s+(热剧|短剧|综艺|游戏|动漫|梗|文化事件|品牌|IP|艺人)\s*(.*)$/);
  if (structMatch) {
    return {
      name: structMatch[1],
      type: mapCategoryToType(structMatch[2]),
      category: structMatch[2],
      keywords: [structMatch[1]],
      url: ''
    };
  }
  
  // 关键词识别
  const type = detectTypeByKeyword(line);
  return {
    name: line,
    type: type,
    category: '',
    keywords: [line],
    url: ''
  };
}

function detectUrlCategory(url) {
  if (url.includes('douban.com/subject')) return '豆瓣影视';
  if (url.includes('bilibili.com/bangumi')) return 'B站番剧';
  if (url.includes('bilibili.com/video')) return 'B站视频';
  if (url.includes('weibo.com')) return '微博';
  if (url.includes('xiaohongshu.com')) return '小红书';
  if (url.includes('douyin.com')) return '抖音';
  return '网址';
}

function extractNameFromUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch(e) {
    return url.slice(0, 40);
  }
}

function mapCategoryToType(category) {
  const trackCats = ['热剧', '短剧', '综艺', '游戏', '动漫', '梗', '文化事件'];
  if (trackCats.includes(category)) return 'track';
  if (category === '品牌') return 'brand';
  return 'ip';
}

function detectTypeByKeyword(name) {
  // 品牌特征词
  const brandHints = ['集团', '股份', '公司', 'Inc', 'Corp'];
  if (brandHints.some(h => name.includes(h))) return 'brand';
  return 'ip';
}
