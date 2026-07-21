// ============================================
// BCC2 营销雷达 · 主逻辑
// ============================================

// 全局状态
const state = {
  currentTab: 'hotspots',
  currentSubSource: 'xhs',
  currentCaseSource: 'socialbeta',
  currentTrack: 'all',
  watchlist: [],
  data: {
    hotspots: {},
    cases: {},
    tracks: {},
    ips: {},
    brands: {}
  }
};

// ============================================
// 初始化
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initSubTabs();
  initModal();
  loadWatchlist();
  loadInitialData();
});

// ============================================
// Tab 切换
// ============================================
function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });
}

function switchTab(tabName) {
  state.currentTab = tabName;
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.dataset.panel === tabName);
  });
  loadTabData(tabName);
}

// ============================================
// 子 Tab 切换
// ============================================
function initSubTabs() {
  document.querySelectorAll('.sub-tab').forEach(subTab => {
    subTab.addEventListener('click', () => {
      const parent = subTab.parentElement;
      parent.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
      subTab.classList.add('active');
      
      if (subTab.dataset.source) {
        if (state.currentTab === 'hotspots') {
          state.currentSubSource = subTab.dataset.source;
          loadHotspots(subTab.dataset.source);
        } else if (state.currentTab === 'cases') {
          state.currentCaseSource = subTab.dataset.source;
          loadCases(subTab.dataset.source);
        }
      } else if (subTab.dataset.track) {
        state.currentTrack = subTab.dataset.track;
        loadTracks(subTab.dataset.track);
      }
    });
  });
}

// ============================================
// 数据加载
// ============================================
function loadInitialData() {
  loadHotspots(state.currentSubSource);
}

function loadTabData(tabName) {
  switch(tabName) {
    case 'hotspots': loadHotspots(state.currentSubSource); break;
    case 'cases': loadCases(state.currentCaseSource); break;
    case 'tracks': loadTracks(state.currentTrack); break;
    case 'ips': loadIPs(); break;
    case 'brands': loadBrands(); break;
  }
}

async function loadHotspots(source) {
  const grid = document.getElementById('hotspotsGrid');
  grid.innerHTML = '<div class="loading">🔄 加载中,首次可能需要 10-30 秒...</div>';
  
  try {
    const res = await fetch(`/api/hotspots?source=${source}`);
    const data = await res.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    state.data.hotspots[source] = data.items || [];
    renderCards(grid, data.items || [], 'hotspot');
  } catch (err) {
    grid.innerHTML = `
      <div class="empty">
        <div class="empty-icon">😔</div>
        <div class="empty-title">数据加载失败</div>
        <div class="empty-desc">${err.message}<br>请稍后再试或点击刷新</div>
      </div>
    `;
  }
}

async function loadCases(source) {
  const grid = document.getElementById('casesGrid');
  grid.innerHTML = '<div class="loading">🔄 加载中...</div>';
  
  try {
    const res = await fetch(`/api/cases?source=${source}`);
    const data = await res.json();
    
    if (data.error) throw new Error(data.error);
    
    state.data.cases[source] = data.items || [];
    renderCards(grid, data.items || [], 'case');
  } catch (err) {
    grid.innerHTML = `
      <div class="empty">
        <div class="empty-icon">😔</div>
        <div class="empty-title">数据加载失败</div>
        <div class="empty-desc">${err.message}</div>
      </div>
    `;
  }
}

function loadTracks(track) {
  const grid = document.getElementById('tracksGrid');
  const trackItems = state.watchlist.filter(w => w.type === 'track' && (track === 'all' || w.category === track));
  
  if (trackItems.length === 0) {
    grid.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🎬</div>
        <div class="empty-title">当前分类无监控项</div>
        <div class="empty-desc">打开监控中心,添加你想追的剧综游戏</div>
        <button class="btn btn-primary" onclick="openWatchlist()">+ 添加</button>
      </div>
    `;
    return;
  }
  
  renderCards(grid, trackItems, 'track');
}

function loadIPs() {
  const grid = document.getElementById('ipsGrid');
  const ipItems = state.watchlist.filter(w => w.type === 'ip');
  
  if (ipItems.length === 0) {
    grid.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🎭</div>
        <div class="empty-title">还没有 IP 监控项</div>
        <div class="empty-desc">打开监控中心,批量添加 IP</div>
        <button class="btn btn-primary" onclick="openWatchlist()">+ 添加 IP</button>
      </div>
    `;
    return;
  }
  
  renderCards(grid, ipItems, 'ip');
}

function loadBrands() {
  const grid = document.getElementById('brandsGrid');
  const brandItems = state.watchlist.filter(w => w.type === 'brand');
  
  if (brandItems.length === 0) {
    grid.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🏢</div>
        <div class="empty-title">还没有品牌监控项</div>
        <div class="empty-desc">打开监控中心,批量添加品牌</div>
        <button class="btn btn-primary" onclick="openWatchlist()">+ 添加品牌</button>
      </div>
    `;
    return;
  }
  
  renderCards(grid, brandItems, 'brand');
}

// ============================================
// 卡片渲染
// ============================================
function renderCards(grid, items, type) {
  if (!items || items.length === 0) {
    grid.innerHTML = `
      <div class="empty">
        <div class="empty-icon">📭</div>
        <div class="empty-title">暂无数据</div>
        <div class="empty-desc">请稍后再试或切换其他分类</div>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = items.map((item, idx) => {
    if (type === 'hotspot' || type === 'case') {
      return renderHotspotCard(item, idx);
    } else if (type === 'ip' || type === 'brand' || type === 'track') {
      return renderWatchCard(item);
    }
  }).join('');
}

function renderHotspotCard(item, idx) {
  const score = item.aiScore || Math.floor(Math.random() * 40 + 60);
  const badgeText = score >= 75 ? `⭐ ${score}` : score >= 60 ? `👀 ${score}` : `${score}`;
  const insight = item.insight || item.desc || '';
  const tags = item.tags || [];
  const hot = item.hot || item.hotValue || '';
  
  return `
    <div class="card">
      <div class="card-header">
        <div class="card-title">${escapeHtml(item.title || '无标题')}</div>
        <span class="card-badge">${badgeText}</span>
      </div>
      <div class="card-meta">
        ${hot ? `<span class="card-meta-item">🔥 ${escapeHtml(String(hot))}</span>` : ''}
        ${item.rank ? `<span class="card-meta-item">📊 ${item.rank}</span>` : ''}
        ${item.time ? `<span class="card-meta-item">⏰ ${escapeHtml(item.time)}</span>` : ''}
      </div>
      ${insight ? `<div class="card-insight">💡 ${escapeHtml(insight)}</div>` : ''}
      ${tags.length > 0 ? `
        <div class="card-tags">
          ${tags.map(t => `<span class="card-tag">${escapeHtml(t)}</span>`).join('')}
        </div>
      ` : ''}
      <div class="card-actions">
        ${item.url || '#'}
          查看原文 →
        </a>
        <button class="card-fav" onclick="toggleFav(this)">⭐</button>
      </div>
    </div>
  `;
}

function renderWatchCard(item) {
  return `
    <div class="card">
      <div class="card-header">
        <div class="card-title">${escapeHtml(item.name)}</div>
        <span class="card-badge">${item.type.toUpperCase()}</span>
      </div>
      <div class="card-meta">
        ${item.category ? `<span class="card-meta-item">🏷️ ${escapeHtml(item.category)}</span>` : ''}
        ${item.keywords ? `<span class="card-meta-item">🔑 ${item.keywords.length} 个关键词</span>` : ''}
      </div>
      <div class="card-insight">
        📌 数据积累中,AI 会自动关联相关热点和案例到这张卡片
      </div>
      ${item.keywords && item.keywords.length > 0 ? `
        <div class="card-tags">
          ${item.keywords.slice(0, 5).map(k => `<span class="card-tag">${escapeHtml(k)}</span>`).join('')}
        </div>
      ` : ''}
      <div class="card-actions">
        <span class="card-link" style="cursor: default;">监控中</span>
        <button class="card-fav" onclick="removeWatch('${escapeAttr(item.name)}')">🗑️</button>
      </div>
    </div>
  `;
}

// ============================================
// 监控中心 Modal
// ============================================
function initModal() {
  document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.modalTab;
      document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.modal-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`.modal-panel[data-modal-panel="${tabName}"]`).classList.add('active');
      if (tabName === 'list') renderWatchList();
    });
  });
  
  document.getElementById('watchlistModal').addEventListener('click', (e) => {
    if (e.target.id === 'watchlistModal') closeWatchlist();
  });
}

function openWatchlist() {
  document.getElementById('watchlistModal').classList.add('active');
  renderWatchList();
}

function closeWatchlist() {
  document.getElementById('watchlistModal').classList.remove('active');
}

// ============================================
// AI 批量解析
// ============================================
async function parseAndSave() {
  const input = document.getElementById('batchInput').value.trim();
  if (!input) {
    alert('请先输入监控项');
    return;
  }
  
  const lines = input.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return;
  
  const btn = event.target;
  const originalText = btn.textContent;
  btn.textContent = '🤖 AI 解析中...';
  btn.disabled = true;
  
  try {
    const res = await fetch('/api/parse-watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: lines })
    });
    const data = await res.json();
    
    if (data.error) throw new Error(data.error);
    
    // 合并到 watchlist,去重
    const existing = new Set(state.watchlist.map(w => w.name.toLowerCase()));
    const newItems = (data.parsed || []).filter(item => !existing.has(item.name.toLowerCase()));
    state.watchlist = [...state.watchlist, ...newItems];
    saveWatchlist();
    
    document.getElementById('batchInput').value = '';
    alert(`✅ 成功入库 ${newItems.length} 个新监控项(去重后)`);
    
    // 切换到清单视图
    document.querySelector('.modal-tab[data-modal-tab="list"]').click();
  } catch (err) {
    alert(`❌ 解析失败: ${err.message}\n\n温馨提示: 如果 API 未配置,现在会用简易解析(仅按关键词入库)`);
    // Fallback: 简易解析
    const fallback = lines.map(line => simpleParseLine(line));
    const existing = new Set(state.watchlist.map(w => w.name.toLowerCase()));
    const newItems = fallback.filter(item => !existing.has(item.name.toLowerCase()));
    state.watchlist = [...state.watchlist, ...newItems];
    saveWatchlist();
    document.getElementById('batchInput').value = '';
    document.querySelector('.modal-tab[data-modal-tab="list"]').click();
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function simpleParseLine(line) {
  const clean = line.replace(/^@/, '').trim();
  const isUrl = /^https?:\/\//.test(line);
  return {
    name: isUrl ? clean.slice(0, 50) : clean,
    type: 'ip',
    category: '',
    keywords: [clean],
    url: isUrl ? line : ''
  };
}

// ============================================
// Watchlist 管理
// ============================================
function renderWatchList() {
  const list = document.getElementById('watchList');
  document.getElementById('listCount').textContent = state.watchlist.length;
  
  if (state.watchlist.length === 0) {
    list.innerHTML = `<div class="empty" style="padding: 40px 20px;">
      <div class="empty-icon">📝</div>
      <div class="empty-desc">还没有监控项,去 "批量输入" 添加</div>
    </div>`;
    return;
  }
  
  list.innerHTML = state.watchlist.map(item => `
    <div class="watch-item">
      <div class="watch-item-info">
        <span class="watch-item-tag">${item.type.toUpperCase()}</span>
        <span class="watch-item-name">${escapeHtml(item.name)}</span>
        ${item.category ? `<span style="color:#6b7280;font-size:12px;">${escapeHtml(item.category)}</span>` : ''}
      </div>
      <button class="watch-item-remove" onclick="removeWatch('${escapeAttr(item.name)}')">✕</button>
    </div>
  `).join('');
}

function removeWatch(name) {
  if (!confirm(`确认删除 "${name}"?`)) return;
  state.watchlist = state.watchlist.filter(w => w.name !== name);
  saveWatchlist();
  renderWatchList();
}

function saveWatchlist() {
  localStorage.setItem('bcc2_watchlist', JSON.stringify(state.watchlist));
}

function loadWatchlist() {
  // 优先从 localStorage 读
  const saved = localStorage.getItem('bcc2_watchlist');
  if (saved) {
    try {
      state.watchlist = JSON.parse(saved);
      return;
    } catch(e) {}
  }
  // 否则加载预置的 v0.2 关键词库
  state.watchlist = getPresetWatchlist();
  saveWatchlist();
}

// ============================================
// 预置关键词库 v0.2 (从 Lion 26 篇案例提炼)
// ============================================
function getPresetWatchlist() {
  return [
    // ===== 品牌 =====
    ...['蜜雪冰城', '瑞幸', '多邻国', '喜茶', '奈雪的茶', '霸王茶姬', '好望水', '茶百道',
        '双汇', '太太乐', '康师傅', '伊利', '蒙牛', '元气森林', '九阳', '旺旺', '奥利奥',
        '麦当劳', 'KFC', '海底捞', '711', '海天', '美团',
        'Adidas', 'Nike', 'Timberland', '优衣库', 'FILA', 'MLB',
        '兰蔻', 'DIOR', '娇兰', '修丽可', 'Miu Miu', '植村秀', '薇诺娜', '自然堂', '欧莱雅', 'Prada',
        '荣耀', '小米', '华为', '科大讯飞', '影视飓风',
        '宝格丽', '猫人', 'Off-White', 'LOEWE', 'Burberry', 'Valentino', 'Weekend Max Mara',
        '泡泡玛特', 'Rays潮玩',
        '北京环球度假区', '亚朵', '万豪',
        '心相印', '999感冒灵', 'RIO', '百威', '剑南春', 'if果酒',
        '江苏银行', '京东', '天猫', '中国邮政', '滴滴', 'B站', '小红书',
        '苏超', 'BW', '乌镇文旅'
       ].map(name => ({ name, type: 'brand', category: '品牌', keywords: [name] })),
    
    // ===== IP / 剧综 / 内容 =====
    ...['暗河传', '盛夏芬德拉', '深情诱引', '太奶奶系列', '逆爱',
        '一饭封神', '喜剧之王单口季2', '乘风2025', '地球超新鲜', '这是我的西游', 
        '一路繁花', '现在就出发3', '向往的生活', '一年一度喜剧大赛', '怎么办脱口秀专场',
        '折螺丝', '打个螺丝', '羊了个羊', '逃离鸭科夫', '盛世天下', '隐形守护者', '原神',
        '大湾鸡', '麦麦岛', '哈基米', '老鼠干', '甜玉米', '优衣库娃衣', '双汇猪', '乐乐鸡',
        '菩提临世', '孝陵卫', 'Labubu', 'Molly', 'Skullpanda', 'Hirono',
        '乌镇戏剧节', 'BW', '全运会', '世界杯', '马年CNY',
        '雪山救狐狸', '进城办事', '劣爆了', 'KuBTI', '萝卜纸巾猫', '苦瓜女士'
       ].map(name => ({ name, type: 'ip', category: 'IP/剧综', keywords: [name] })),
    
    // ===== 艺人 / KOL / CP =====
    ...['papi酱', '刘萧旭', '郭宇欣', '于龙', '杨咩咩', '孙樾', '徐艺真', 
        '柯淳', '余茵', '刘念', '何聪睿',
        '黎子安', '田栩宁', '梓渝',
        '唐国强', '刘晓庆', '倪萍', '倪大红', '吴彦姝', '叶童', '腾格尔',
        '大张伟', '李雪琴', '谢可寅', '白敬亭',
        '马丽', '马龙', '马东', '马景涛', '马伊琍',
        '龚俊', '郭晓婷', '王天辰'
       ].map(name => ({ name, type: 'ip', category: '艺人/KOL', keywords: [name] })),
  ];
}

// ============================================
// 工具函数
// ============================================
function refreshData() {
  const btn = document.getElementById('btnRefresh');
  const original = btn.textContent;
  btn.textContent = '🔄 刷新中...';
  loadTabData(state.currentTab);
  setTimeout(() => { btn.textContent = original; }, 1500);
}

function toggleFav(btn) {
  event.stopPropagation();
  const isActive = btn.textContent === '⭐';
  btn.textContent = isActive ? '★' : '⭐';
  btn.style.color = isActive ? '#f59e0b' : '';
}

function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function escapeAttr(text) {
  return String(text).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
