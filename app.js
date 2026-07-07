/**
 * AI人生档案馆 - 主应用逻辑
 * 核心能力：
 * 1. 真实照片导入（File API + Capacitor）
 * 2. AI图像分析（调用后端API / 本地模拟）
 * 3. AI回忆文案生成（调用后端大模型API）
 * 4. 时间轴视频生成（Canvas + MediaRecorder）
 * 5. 数据闭环（localStorage持久化）
 */

// ==================== 配置 ====================
function getApiBase() {
  // 优先从 localStorage 读取，其次 window.API_BASE，最后默认本地开发地址
  return localStorage.getItem('life_archive_api_base') || window.API_BASE || (location.hostname === 'localhost' ? 'http://localhost:3001' : '');
}

function setApiBase(url) {
  localStorage.setItem('life_archive_api_base', url || '');
}

const API_BASE = getApiBase();

// ==================== 数据模型 ====================
class RealPhoto {
  constructor(file, id) {
    this.id = id || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.file = file;
    this.src = URL.createObjectURL(file);
    this.name = file.name;
    this.date = new Date(file.lastModified || Date.now());
    this.size = file.size;
    this.analysis = null;
    this.analyzed = false;
  }
}

// 全局状态
let realPhotos = [];           // 用户导入的真实照片
let currentPage = 'home';
let selectedPhotos = 467;
let storyStyle = 'warm';
let storyScene = 'wechat';
let storyTone = 'warm';
let storySelectedPhotos = [];
let videoRange = 'all';
let videoDuration = 15;
let videoTheme = 'warm';
let videoMusic = 'soft';
let videoBlob = null;
let videoScript = null;
let photoSelectorCallback = null;
let photoSelectorMinCount = 1;
let photoSelectorMaxCount = 20;

// Demo数据（保留用于展示）
const demoPhotos = [
  { src: 'family_beach_400x300.png', title: '海边家庭合影', stars: 5, intent: 'emotion', intentLabel: '情感记忆 · 家庭合影', scores: {emotion:85,info:20,knowledge:10,life:90,future:60}, detections: {peopleCount:3,hasText:false,isScreenshot:false,location:'三亚',blurScore:0.92} },
  { src: 'travel_landscape_400x300.png', title: '三亚风景', stars: 4, intent: 'creative', intentLabel: '摄影创作 · 风景', scores: {emotion:60,info:10,knowledge:5,life:70,future:50}, detections: {peopleCount:0,hasText:false,isScreenshot:false,location:'三亚',blurScore:0.95} },
  { src: 'child_growth_400x300.png', title: '孩子成长', stars: 5, intent: 'emotion', intentLabel: '情感记忆 · 成长记录', scores: {emotion:95,info:10,knowledge:5,life:95,future:55}, detections: {peopleCount:1,hasText:false,isScreenshot:false,location:'本地',blurScore:0.88} },
  { src: 'food_photo_400x300.png', title: '美食记录', stars: 3, intent: 'creative', intentLabel: '摄影创作 · 美食', scores: {emotion:40,info:15,knowledge:10,life:35,future:30}, detections: {peopleCount:0,hasText:false,isScreenshot:false,location:'本地',blurScore:0.90} },
  { src: 'id_card_400x300.png', title: '身份证', stars: 5, intent: 'info', intentLabel: '信息留存 · 证件', scores: {emotion:5,info:95,knowledge:10,life:80,future:90}, detections: {peopleCount:1,hasText:true,isScreenshot:false,location:'本地',blurScore:0.98} },
  { src: 'course_ppt_400x300.png', title: '课程笔记', stars: 4, intent: 'learning', intentLabel: '知识学习 · 课程', scores: {emotion:10,info:70,knowledge:90,life:40,future:85}, detections: {peopleCount:0,hasText:true,isScreenshot:false,location:'本地',blurScore:0.96} },
  { src: 'work_doc_400x300.png', title: '工作文档', stars: 3, intent: 'work', intentLabel: '工作沟通 · 文档', scores: {emotion:15,info:75,knowledge:60,life:30,future:70}, detections: {peopleCount:0,hasText:true,isScreenshot:false,location:'本地',blurScore:0.97} },
  { src: 'blurry_photo_400x300.png', title: '模糊照片', stars: 1, intent: 'temp', intentLabel: '临时记录', scores: {emotion:20,info:10,knowledge:5,life:15,future:10}, detections: {peopleCount:0,hasText:false,isScreenshot:true,location:'本地',blurScore:0.15} },
];

const intentNames = {
  emotion: '情感记忆', info: '信息留存', learning: '知识学习',
  work: '工作沟通', creative: '摄影创作', temp: '临时记录'
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
  loadPhotosFromStorage();
  initUploadZone();
  updateImportCount();
  renderRealPhotoGrid();
  updateApiStatusBadge();
});

// ==================== localStorage持久化 ====================
function savePhotosToStorage() {
  const data = realPhotos.map(p => ({
    id: p.id,
    name: p.name,
    date: p.date.toISOString(),
    size: p.size,
    analysis: p.analysis,
    analyzed: p.analyzed
  }));
  localStorage.setItem('lifeArchivePhotos', JSON.stringify(data));
  localStorage.setItem('lifeArchivePhotoCount', realPhotos.length);
}

function loadPhotosFromStorage() {
  try {
    const data = localStorage.getItem('lifeArchivePhotos');
    if (data) {
      const arr = JSON.parse(data);
      // 注意：File对象无法序列化，重启后需要重新导入
      // 但我们保留分析结果
      console.log('已从localStorage加载', arr.length, '张照片的分析结果');
    }
  } catch (e) { console.error('加载存储失败', e); }
}

// ==================== 上传区域初始化 ====================
function triggerImport() {
  const input = document.getElementById('photoInput');
  if (input) input.click();
}

function initUploadZone() {
  // uploadZone 已从首页移除，但保留拖拽到页面的全局支持
  document.body.addEventListener('dragover', e => {
    e.preventDefault();
  });
  document.body.addEventListener('drop', e => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) handleFiles(imageFiles);
    }
  });
  // 确保 photoInput 的 change 事件已绑定
  const input = document.getElementById('photoInput');
  if (input && !input._bound) {
    input.addEventListener('change', e => {
      importLocalPhotos(e);
    });
    input._bound = true;
  }
}

// ==================== 照片导入 ====================

function handleFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  const imageFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  if (imageFiles.length === 0) {
    showToast('请选择图片文件');
    return;
  }

  const newPhotos = imageFiles.map(f => new RealPhoto(f));
  realPhotos.push(...newPhotos);

  updateImportCount();
  renderRealPhotoGrid();
  savePhotosToStorage();
  showToast(`已导入 ${newPhotos.length} 张照片，AI分析中...`);

  // 自动触发AI分析
  analyzePhotosBatch(newPhotos);
}

function importLocalPhotos(e) {
  handleFiles(e.currentTarget.files);
}

function updateImportCount() {
  const badge = document.getElementById('localBadge');
  if (badge && realPhotos.length > 0) {
    badge.textContent = '\u{1F4F7} 导入' + realPhotos.length;
  }
}

function renderRealPhotoGrid() {
  const grid = document.getElementById('realPhotoGrid');
  if (!grid) return;

  if (realPhotos.length === 0) {
    grid.innerHTML = '';
    return;
  }

  grid.innerHTML = realPhotos.slice(0, 9).map(p => `
    <div class="real-photo-item" onclick="showRealPhotoDetail('${p.id}')">
      <img src="${p.src}" alt="${p.name}">
      ${p.analyzed ? `<div class="ai-badge">${p.analysis.stars}★</div>` : ''}
      ${p.analyzed ? `<div class="ai-score">${p.analysis.avgScore}分</div>` : ''}
    </div>
  `).join('');

  if (realPhotos.length > 9) {
    grid.innerHTML += `<div class="real-photo-item" style="display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--muted)">+${realPhotos.length - 9}</div>`;
  }
}

// ==================== AI分析引擎 ====================
async function analyzePhotosBatch(photos) {
  const statusEl = document.getElementById('analysisStatus');
  const statusText = document.getElementById('analysisStatusText');
  if (statusEl) statusEl.style.display = 'flex';

  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    if (statusText) statusText.textContent = `AI正在分析第 ${i + 1}/${photos.length} 张照片...`;

    try {
      const result = await analyzeSinglePhoto(p);
      p.analysis = result;
      p.analyzed = true;
    } catch (err) {
      console.error('分析失败:', err);
      p.analysis = getFallbackAnalysis(p.name);
      p.analyzed = true;
    }

    renderRealPhotoGrid();
  }

  if (statusEl) {
    if (statusText) statusText.textContent = `✅ AI分析完成！共分析 ${photos.length} 张照片`;
    setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
  }

  savePhotosToStorage();
  showToast(`AI分析完成！发现 ${photos.filter(p => p.analysis.stars >= 4).length} 张高价值照片`);
}

async function analyzeSinglePhoto(photo) {
  // 优先调用后端API（JSON 元数据，不传输大文件）
  const apiBase = getApiBase();
  if (apiBase) {
    try {
      const res = await fetch(`${apiBase}/api/analyze-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: photo.name,
          size: photo.size,
          timestamp: photo.date.toISOString()
        })
      });
      const data = await res.json();
      if (data && data.stars) return normalizeBackendAnalysis(data, photo.name);
    } catch (e) {
      console.warn('后端API调用失败，使用本地模拟:', e.message);
    }
  }

  // 本地模拟分析（离线可用）
  return simulateLocalAnalysis(photo.name);
}

function normalizeBackendAnalysis(data, filename) {
  const intent = data.intent || 'emotion';
  const intentMap = {
    emotion: '情感记忆', info: '信息留存', learning: '知识学习',
    work: '工作沟通', creative: '摄影创作', temp: '临时记录', life: '生活记录'
  };
  const subMap = {
    emotion: '生活记录', info: '证件档案', learning: '学习笔记',
    work: '工作文档', creative: '摄影作品', temp: '临时截图', life: '生活记录'
  };
  const scores = data.scores || simulateLocalAnalysis(filename).scores;
  const total = data.total || Math.round(
    scores.emotion * 0.25 + scores.info * 0.2 + scores.knowledge * 0.15 +
    scores.life * 0.25 + scores.future * 0.15
  );
  return {
    intent,
    intentLabel: `${intentMap[intent] || '情感记忆'} · ${subMap[intent] || '生活记录'}`,
    intentCategory: intentMap[intent] || '情感记忆',
    subCategory: subMap[intent] || '生活记录',
    stars: data.stars || Math.min(5, Math.max(1, Math.round(total / 20))),
    scores,
    avgScore: total,
    suggestion: data.suggestion || '建议归档',
    detections: {
      peopleCount: intent === 'emotion' ? Math.floor(Math.random() * 5) + 1 : 0,
      hasText: ['info', 'work', 'learning'].includes(intent),
      isScreenshot: intent === 'temp',
      location: /travel|beach|sea|mountain|landscape/i.test(filename || '') ? '旅行地' : '本地',
      blurScore: /blur/i.test(filename || '') ? 0.15 : 0.92
    },
    analysisTime: `${(0.5 + Math.random() * 1.5).toFixed(2)}s`,
    modelVersion: 'backend-rule-v1'
  };
}

function simulateLocalAnalysis(filename) {
  const name = (filename || '').toLowerCase();

  const rules = [
    { k: ['family','people','group','birthday','wedding','party'], i:'emotion', l:'情感记忆', s:'家庭合影' },
    { k: ['child','baby','kid','growth'], i:'emotion', l:'情感记忆', s:'成长记录' },
    { k: ['travel','landscape','scenery','mountain','sea','beach'], i:'creative', l:'摄影创作', s:'风景摄影' },
    { k: ['food','meal','dinner','cafe','restaurant'], i:'creative', l:'摄影创作', s:'美食记录' },
    { k: ['id','card','passport','license','certificate'], i:'info', l:'信息留存', s:'证件档案' },
    { k: ['work','office','meeting','ppt','report'], i:'work', l:'工作沟通', s:'工作文档' },
    { k: ['course','book','note','study','class'], i:'learning', l:'知识学习', s:'学习笔记' },
    { k: ['screenshot','screen','blur','tmp'], i:'temp', l:'临时记录', s:'临时截图' }
  ];

  let matched = { i:'emotion', l:'情感记忆', s:'生活记录' };
  for (const r of rules) {
    if (r.k.some(k => name.includes(k))) { matched = r; break; }
  }

  const scoreMap = {
    emotion: { emotion:90, info:15, knowledge:10, life:95, future:60 },
    info:    { emotion:10, info:95, knowledge:15, life:70, future:85 },
    learning:{ emotion:15, info:65, knowledge:92, life:45, future:88 },
    work:    { emotion:20, info:80, knowledge:70, life:40, future:75 },
    creative:{ emotion:55, info:20, knowledge:15, life:65, future:50 },
    temp:    { emotion:15, info:20, knowledge:5,  life:10, future:8  }
  };

  const base = scoreMap[matched.i] || scoreMap.emotion;
  const scores = {
    emotion: clamp(base.emotion + rand(-10,10)),
    info:    clamp(base.info + rand(-10,10)),
    knowledge: clamp(base.knowledge + rand(-10,10)),
    life:    clamp(base.life + rand(-10,10)),
    future:  clamp(base.future + rand(-10,10))
  };

  const avg = (scores.emotion + scores.info + scores.knowledge + scores.life + scores.future) / 5;
  const stars = avg >= 85 ? 5 : avg >= 70 ? 4 : avg >= 55 ? 3 : avg >= 40 ? 2 : 1;

  const suggestions = {
    emotion: '长期归档到人生时间轴',
    info: '存入数字保险柜并设置到期提醒',
    learning: '归档到知识库，关联相关课程',
    work: '按项目归档，保留至项目结束+1年',
    creative: '精选最佳作品入摄影集',
    temp: '建议30天后自动清理'
  };

  return {
    intent: matched.i,
    intentLabel: `${matched.l} · ${matched.s}`,
    intentCategory: matched.l,
    subCategory: matched.s,
    stars,
    scores,
    avgScore: Math.round(avg),
    suggestion: suggestions[matched.i],
    detections: {
      peopleCount: matched.i === 'emotion' ? Math.floor(Math.random()*5)+1 : 0,
      hasText: ['info','work','learning'].includes(matched.i),
      isScreenshot: matched.i === 'temp',
      location: name.includes('travel') || name.includes('beach') ? '三亚' : '本地',
      blurScore: name.includes('blur') ? 0.15 : 0.92
    },
    analysisTime: `${(0.5+Math.random()*1.5).toFixed(2)}s`,
    modelVersion: 'local-sim-v1'
  };
}

function getFallbackAnalysis(filename) {
  return simulateLocalAnalysis(filename);
}

function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ==================== 真实照片详情弹窗 ====================
function showRealPhotoDetail(photoId) {
  const photo = realPhotos.find(p => p.id === photoId);
  if (!photo) return;

  const a = photo.analysis || getFallbackAnalysis(photo.name);

  document.getElementById('modalPhotoImg').src = photo.src;
  document.getElementById('modalPhotoTitle').textContent = photo.name;
  document.getElementById('modalStars').textContent = '⭐'.repeat(a.stars);
  document.getElementById('modalScore').textContent = a.avgScore + '分';

  document.getElementById('barEmotion').style.width = a.scores.emotion + '%';
  document.getElementById('scoreEmotion').textContent = a.scores.emotion + '%';
  document.getElementById('barInfo').style.width = a.scores.info + '%';
  document.getElementById('scoreInfo').textContent = a.scores.info + '%';
  document.getElementById('barKnowledge').style.width = a.scores.knowledge + '%';
  document.getElementById('scoreKnowledge').textContent = a.scores.knowledge + '%';
  document.getElementById('barLife').style.width = a.scores.life + '%';
  document.getElementById('scoreLife').textContent = a.scores.life + '%';
  document.getElementById('barFuture').style.width = a.scores.future + '%';
  document.getElementById('scoreFuture').textContent = a.scores.future + '%';

  document.getElementById('modalIntent').textContent = a.intentLabel;

  const d = a.detections;
  const detectionText = `含${d.peopleCount}人 · ${d.hasText ? '含文字' : '无文字'} · ${d.isScreenshot ? '截图' : '非截图'} · GPS: ${d.location} · 清晰度: ${Math.round(d.blurScore * 100)}%`;
  const detEl = document.querySelector('.modal-panel > div:nth-of-type(5)');
  if (detEl && detEl.querySelector('div:last-child')) {
    detEl.querySelector('div:last-child').textContent = detectionText;
  }

  const sugEl = document.querySelector('.modal-panel > div:nth-of-type(6)');
  if (sugEl && sugEl.querySelector('div:last-child')) {
    sugEl.querySelector('div:last-child').textContent = a.suggestion;
  }

  const pm = document.getElementById('photoModal');
  pm.style.display = 'flex';
  pm.style.pointerEvents = 'auto';
  pm.classList.add('active');
  document.body.style.overflow = 'hidden';
}

// ==================== 页面导航 ====================
function navigateTo(page) {
  try {
    // 确保所有全屏遮罩层关闭，防止它们拦截导航
    const overlays = document.querySelectorAll('.scan-progress.active, .modal-overlay.active, .photo-selector-overlay.active, .onboarding[style*="block"], .scan-progress[style*="flex"]');
    overlays.forEach(el => {
      el.classList.remove('active');
      el.style.display = 'none';
    });

    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
      p.style.display = 'none';
    });
    // 清除导航高亮
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const pageMap = {
      'home': { id: 'pageHome', title: 'AI人生档案馆', sub: '本地处理 · 隐私零风险', navIdx: 0 },
      'categories': { id: 'pageCategories', title: '照片分类', sub: '按意图浏览照片', navIdx: 1 },
      'timeline': { id: 'pageTimeline', title: '人生时间轴', sub: '48个关键节点', navIdx: 2 },
      'clean': { id: 'pageClean', title: '快捷清理', sub: '建议释放 1.2GB', navIdx: 3 },
      'vault': { id: 'pageVault', title: '数字保险柜', sub: '已加密 · 本地存储', navIdx: -1 },
      'settings': { id: 'pageSettings', title: '设置', sub: '偏好与隐私', navIdx: 4 }
    };

    const config = pageMap[page];
    if (!config) {
      console.warn('navigateTo: unknown page', page);
      return;
    }

    const pageEl = document.getElementById(config.id);
    const titleEl = document.getElementById('pageTitle');
    const subEl = document.getElementById('pageSub');

    if (!pageEl) {
      console.error('navigateTo: page element not found', config.id);
      showToast('页面加载失败，请刷新重试');
      return;
    }

    // 强制显示目标页面
    pageEl.classList.add('active');
    pageEl.style.cssText = 'display: block !important;';
    if (titleEl) titleEl.textContent = config.title;
    if (subEl) subEl.textContent = config.sub;

    // 确保header和bottomNav可见
    document.getElementById('mainHeader').style.display = 'flex';
    document.getElementById('bottomNav').style.display = 'flex';

    if (config.navIdx >= 0) {
      const navItems = document.querySelectorAll('.nav-item');
      if (navItems[config.navIdx]) navItems[config.navIdx].classList.add('active');
    }
    currentPage = page;
  } catch (err) {
    console.error('navigateTo error:', err);
    showToast('导航出错: ' + err.message);
  }
  window.scrollTo(0, 0);
}

// ==================== 欢迎引导 ====================
function startScan() {
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('onboarding').style.pointerEvents = 'none';
  const sp = document.getElementById('scanProgress');
  sp.classList.add('active');
  sp.style.display = 'flex';
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 8 + 2;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      setTimeout(() => {
        sp.classList.remove('active');
        sp.style.display = 'none';
        sp.style.pointerEvents = 'none';
        document.getElementById('mainHeader').style.display = 'flex';
        document.getElementById('bottomNav').style.display = 'flex';
        // 强制首页可见
        const homePage = document.getElementById('pageHome');
        if (homePage) {
          homePage.classList.add('active');
          homePage.style.cssText = 'display: block !important;';
        }
        showToast('分析完成！发现 48 个人生节点');
      }, 500);
    }
    document.getElementById('scanBarFill').style.width = progress + '%';
    const analyzed = Math.floor((progress / 100) * 50);
    document.getElementById('scanStats').textContent = `正在分析 ${analyzed}/50 张照片...`;
  }, 200);
}

// ==================== Toast ====================
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ==================== 照片详情弹窗（Demo照片）====================
function showPhotoDetail(src, title, stars, scores, intentLabel) {
  document.getElementById('modalPhotoImg').src = 'assets/' + src;
  document.getElementById('modalPhotoTitle').textContent = title;
  document.getElementById('modalStars').textContent = '⭐'.repeat(stars);
  document.getElementById('modalScore').textContent = stars + '.0分';

  document.getElementById('barEmotion').style.width = scores.emotion + '%';
  document.getElementById('scoreEmotion').textContent = scores.emotion + '%';
  document.getElementById('barInfo').style.width = scores.info + '%';
  document.getElementById('scoreInfo').textContent = scores.info + '%';
  document.getElementById('barKnowledge').style.width = scores.knowledge + '%';
  document.getElementById('scoreKnowledge').textContent = scores.knowledge + '%';
  document.getElementById('barLife').style.width = scores.life + '%';
  document.getElementById('scoreLife').textContent = scores.life + '%';
  document.getElementById('barFuture').style.width = scores.future + '%';
  document.getElementById('scoreFuture').textContent = scores.future + '%';

  document.getElementById('modalIntent').textContent = intentLabel;

  // 重置检测详情和AI建议（demo照片没有这些动态数据）
  const detEl = document.querySelector('.modal-panel > div:nth-of-type(5)');
  if (detEl && detEl.querySelector('div:last-child')) {
    detEl.querySelector('div:last-child').textContent = '含' + (Math.floor(Math.random()*3)+1) + '人 · 无文字 · 非截图 · GPS: 本地';
  }
  const sugEl = document.querySelector('.modal-panel > div:nth-of-type(6)');
  if (sugEl && sugEl.querySelector('div:last-child')) {
    sugEl.querySelector('div:last-child').textContent = '长期归档到人生时间轴';
  }

  const pm = document.getElementById('photoModal');
  pm.style.display = 'flex';
  pm.style.pointerEvents = 'auto';
  pm.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closePhotoModal() {
  const m = document.getElementById('photoModal');
  m.classList.remove('active');
  m.style.display = 'none';
  m.style.pointerEvents = 'none';
  document.body.style.overflow = '';
}

// ==================== 分类筛选 ====================
function filterPhotos(intent, el) {
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  showToast(intent === 'all' ? '显示全部分类' : `筛选: ${intentNames[intent] || intent}`);
}

function filterByStar(star, el) {
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  showToast(star === 'all' ? '显示全部星级' : `筛选: ${star}星照片`);
}

function showCategoryPhotos(intent) {
  const filtered = demoPhotos.filter(p => p.intent === intent);
  const grid = document.getElementById('photoListGrid');
  const titles = { emotion: '情感记忆', info: '信息留存', learning: '知识学习', work: '工作沟通', creative: '摄影创作', temp: '临时记录' };
  document.getElementById('photoListTitle').textContent = titles[intent] || '照片';

  grid.innerHTML = filtered.map(p => `
    <div class="photo-item" onclick="showPhotoDetail('${p.src}', '${p.title}', ${p.stars}, ${JSON.stringify(p.scores).replace(/"/g, '&quot;')}, '${p.intentLabel}')">
      <img src="assets/${p.src}" alt="">
      <span class="photo-star">${'⭐'.repeat(p.stars)}</span>
    </div>
  `).join('');

  document.getElementById('categoryGrid').style.display = 'none';
  document.getElementById('photoList').style.display = 'block';
}

function backToCategories() {
  document.getElementById('categoryGrid').style.display = 'grid';
  document.getElementById('photoList').style.display = 'none';
}

// ==================== 清理功能 ====================

function toggleSelect(el) {
  el.classList.toggle('selected');
  const hasCheck = el.querySelector('.clean-photo-check');
  if (el.classList.contains('selected')) {
    if (!hasCheck) {
      const check = document.createElement('div');
      check.className = 'clean-photo-check';
      check.textContent = '✓';
      el.appendChild(check);
    }
    selectedPhotos++;
  } else {
    if (hasCheck) hasCheck.remove();
    selectedPhotos--;
  }
  updateSelectedCount();
}

function selectAll(el, select) {
  const group = el.closest('.clean-group');
  group.querySelectorAll('.clean-photo').forEach(p => {
    if (select && !p.classList.contains('selected')) {
      p.classList.add('selected');
      if (!p.querySelector('.clean-photo-check')) {
        const check = document.createElement('div');
        check.className = 'clean-photo-check';
        check.textContent = '✓';
        p.appendChild(check);
      }
    } else if (!select && p.classList.contains('selected')) {
      p.classList.remove('selected');
      const check = p.querySelector('.clean-photo-check');
      if (check) check.remove();
    }
  });
  updateSelectedCount();
}

function updateSelectedCount() {
  const count = document.querySelectorAll('.clean-photo.selected').length;
  document.getElementById('selectedCount').textContent = count;
  const gb = (count * 2.4 / 1024).toFixed(1);
  const sizeEl = document.getElementById('selectedSize');
  if (sizeEl) sizeEl.textContent = gb + 'GB';
}

function openCleanLightbox(src) {
  const lb = document.getElementById('cleanLightbox');
  const img = document.getElementById('cleanLightboxImg');
  if (!lb || !img) return;
  img.src = src;
  lb.style.display = 'flex';
  lb.style.pointerEvents = 'auto';
  lb.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeCleanLightbox() {
  const lb = document.getElementById('cleanLightbox');
  if (!lb) return;
  lb.classList.remove('active');
  lb.style.display = 'none';
  lb.style.pointerEvents = 'none';
  document.body.style.overflow = '';
}

function confirmDelete() {
  const count = document.querySelectorAll('.clean-photo.selected').length;
  if (count === 0) {
    showToast('请先选择要删除的照片');
    return;
  }
  // 二次确认：照片删除是慎重操作
  if (confirm(`确定要删除已选中的 ${count} 张照片吗？\n\n删除后30秒内可撤销。`)) {
    showToast(`已删除 ${count} 张照片（30秒内可撤销）`);
    // 模拟删除效果：移除选中照片的DOM
    document.querySelectorAll('.clean-photo.selected').forEach(el => {
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      el.style.opacity = '0';
      el.style.transform = 'scale(0.8)';
      setTimeout(() => el.remove(), 300);
    });
    updateSelectedCount();
  }
}

// ==================== 时间轴 ====================
function selectYear(year, el) {
  el.parentElement.querySelectorAll('.year-chip').forEach(y => y.classList.remove('active'));
  el.classList.add('active');
  showToast(`切换到 ${year} 年`);
}

function toggleTimelineDetail(el) {
  const detail = el.querySelector('.timeline-detail');
  if (detail) detail.style.display = detail.style.display === 'block' ? 'none' : 'block';
}

// ==================== AI写文案（v3.0 多步骤流程）====================
function openStoryModal() {
  const m = document.getElementById('storyModal');
  m.style.display = 'flex';
  m.style.pointerEvents = 'auto';
  m.classList.add('active');
  resetStoryFlow();
  document.body.style.overflow = 'hidden';
}

function closeStoryModal() {
  const m = document.getElementById('storyModal');
  m.classList.remove('active');
  m.style.display = 'none';
  m.style.pointerEvents = 'none';
  document.body.style.overflow = '';
}

function resetStoryFlow() {
  storyScene = 'wechat';
  storyTone = 'warm';
  storySelectedPhotos = [];
  storyStyle = 'warm';

  ['storyStep1', 'storyStep2', 'storyStep3', 'storyResult'].forEach((id, i) => {
    document.getElementById(id).style.display = i === 0 ? 'block' : 'none';
  });

  // 重置UI选中状态
  document.querySelectorAll('.scene-card').forEach(c => c.classList.remove('active'));
  const defaultScene = document.querySelector('.scene-card[data-scene="wechat"]');
  if (defaultScene) defaultScene.classList.add('active');

  document.querySelectorAll('.tone-card').forEach(c => c.classList.remove('active'));
  const defaultTone = document.querySelector('.tone-card[data-tone="warm"]');
  if (defaultTone) defaultTone.classList.add('active');

  updateStorySelectedCount();
  renderStoryPreviewGrid();
  document.getElementById('storyContent').textContent = '';
  document.getElementById('storyLoading').style.display = 'none';

  const btn = document.getElementById('storyGenBtn');
  if (btn) btn.disabled = false;
}

function storyNextStep(step) {
  ['storyStep1', 'storyStep2', 'storyStep3', 'storyResult'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById(`storyStep${step}`).style.display = 'block';
}

function storyPrevStep(step) {
  storyNextStep(step);
}

function selectStoryScene(scene, el) {
  storyScene = scene;
  el.parentElement.querySelectorAll('.scene-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

function selectStoryTone(tone, el) {
  storyTone = tone;
  storyStyle = tone;
  el.parentElement.querySelectorAll('.tone-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

function openPhotoSelectorForStory() {
  photoSelectorCallback = (selected) => {
    storySelectedPhotos = selected;
    updateStorySelectedCount();
    renderStoryPreviewGrid();
  };
  photoSelectorMinCount = 1;
  photoSelectorMaxCount = 6;
  openPhotoSelector('选择照片（最多6张）');
}

function updateStorySelectedCount() {
  const el = document.getElementById('storySelectedCount');
  if (el) el.textContent = storySelectedPhotos.length;
}

function renderStoryPreviewGrid() {
  const grid = document.getElementById('storyPreviewGrid');
  if (!grid) return;
  grid.innerHTML = '';
  if (storySelectedPhotos.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:24px 0;font-size:13px">还没有选择照片，点击上方按钮从相册中选择</div>';
    return;
  }
  storySelectedPhotos.forEach(p => {
    const div = document.createElement('div');
    div.className = 'photo-selector-item';
    div.innerHTML = `<img src="${p.url || p.thumbnail}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`;
    grid.appendChild(div);
  });
}

async function generateStory() {
  if (storySelectedPhotos.length < 1) {
    showToast('请先选择至少1张照片');
    return;
  }

  const btn = document.getElementById('storyGenBtn');
  const loading = document.getElementById('storyLoading');
  const result = document.getElementById('storyResult');
  const content = document.getElementById('storyContent');

  if (btn) btn.disabled = true;

  // 切换到结果页
  ['storyStep1', 'storyStep2', 'storyStep3'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  result.style.display = 'block';
  loading.style.display = 'flex';
  content.textContent = '';

  try {
    let story = '';
    const apiBase = getApiBase();

    if (apiBase) {
      const res = await fetch(`${apiBase}/api/generate-story`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photos: storySelectedPhotos.map(p => ({
            title: p.title || p.name || '美好瞬间',
            tags: p.analysis?.tags || [],
            date: p.date ? (typeof p.date === 'string' ? p.date : p.date.toISOString().split('T')[0]) : ''
          })),
          scene: storyScene,
          tone: storyTone
        })
      });
      const data = await res.json();
      if (data.story) story = data.story;
    }

    if (!story) {
      story = generateLocalStory(storySelectedPhotos, storyTone, storyScene);
    }

    content.textContent = story;
    showToast('AI文案生成完成！');
  } catch (err) {
    console.error('generateStory error:', err);
    content.textContent = generateLocalStory(storySelectedPhotos, storyTone, storyScene);
    showToast('网络不可用，已使用本地文案');
  } finally {
    if (btn) btn.disabled = false;
    loading.style.display = 'none';
  }
}

function regenerateStory() {
  generateStory();
}

function generateLocalStory(photos, tone, scene) {
  const templates = {
    wechat: {
      warm: '这些照片记录了一段值得珍藏的时光。回头看，平凡的日子也有光。',
      poetic: '光影温柔，岁月无声。愿这些瞬间，成为日后怀念的理由。',
      funny: '翻相册才发现，当时的我原来是这个画风。快乐证据，已存档。',
      simple: '一组照片，一段记忆。'
    },
    xiaohongshu: {
      warm: '这组照片真的太有温度了 💕 每一张都是生活的小确幸，值得被好好记录 ✨',
      poetic: '把日子过成诗，把瞬间定格成永恒。这组照片就是我最近的心头好 🌙',
      funny: '救命！这些照片我真的会反复观看 😂 当时的快乐溢出屏幕了！',
      simple: '一组喜欢的照片 📸 记录一下最近的小美好 💕'
    },
    family: {
      warm: '家人们，看看这些照片，满满都是回忆。一家人在一起，就是最幸福的时光。',
      poetic: '家是永远的港湾，照片里的笑容是最珍贵的宝藏。',
      funny: '咱们家的快乐日常，每一张都长在笑点上！',
      simple: '发给家人们看看，都是温暖的回忆。'
    },
    moments: {
      warm: '时间会走远，影像能长存。这些照片，是送给未来的自己的礼物。',
      poetic: '把散落的时光串成线，这便是生活写给人间的诗。',
      funny: '人生就是一边翻车一边拍照，这些瞬间都值得被记住。',
      simple: '记录一下，留住此刻。'
    }
  };
  const sceneMap = templates[scene] || templates.moments;
  return sceneMap[tone] || sceneMap.warm;
}

function copyStory() {
  const text = document.getElementById('storyContent').textContent;
  if (!text) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('文案已复制到剪贴板'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('文案已复制到剪贴板');
  }
}

function shareStory() {
  const text = document.getElementById('storyContent').textContent;
  if (!text) return;
  if (navigator.share) {
    navigator.share({ title: 'AI写文案', text }).catch(() => {});
  } else {
    copyStory();
    showToast('已复制，可直接粘贴分享');
  }
}

// ==================== 时间轴视频生成 ====================
function openVideoGenerator() {
  const m = document.getElementById('videoModal');
  m.style.display = 'flex';
  m.style.pointerEvents = 'auto';
  m.classList.add('active');
  resetVideoFlow();
  document.body.style.overflow = 'hidden';
}

function closeVideoModal() {
  const m = document.getElementById('videoModal');
  m.classList.remove('active');
  m.style.display = 'none';
  m.style.pointerEvents = 'none';
  document.body.style.overflow = '';
}

function resetVideoFlow() {
  videoTheme = 'warm';
  videoMusic = 'soft';
  videoRange = 'all';
  videoDuration = 15;
  videoScript = null;

  ['videoStep1', 'videoStep2', 'videoStep3'].forEach((id, i) => {
    document.getElementById(id).style.display = i === 0 ? 'block' : 'none';
  });
  document.getElementById('videoResult').style.display = 'none';
  document.getElementById('videoLoading').style.display = 'none';
  document.getElementById('videoScriptPreview').style.display = 'none';
  document.querySelector('.video-canvas-container').style.display = 'block';

  const canvas = document.getElementById('videoCanvas');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  document.getElementById('videoPreview').style.display = 'none';
  document.getElementById('videoPreview').src = '';
  videoBlob = null;

  // 重置UI选中
  document.querySelectorAll('.template-card').forEach(c => c.classList.remove('active'));
  const defaultTheme = document.querySelector('.template-card[data-theme="warm"]');
  if (defaultTheme) defaultTheme.classList.add('active');

  document.querySelectorAll('.music-card').forEach(c => c.classList.remove('active'));
  const defaultMusic = document.querySelector('.music-card[data-music="soft"]');
  if (defaultMusic) defaultMusic.classList.add('active');
}

function videoNextStep(step) {
  ['videoStep1', 'videoStep2', 'videoStep3'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById(`videoStep${step}`).style.display = 'block';

  if (step === 3) {
    loadVideoScriptPreview();
  }
}

function videoPrevStep(step) {
  videoNextStep(step);
}

function selectVideoTheme(theme, el) {
  videoTheme = theme;
  el.parentElement.querySelectorAll('.template-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

function selectVideoMusic(music, el) {
  videoMusic = music;
  el.parentElement.querySelectorAll('.music-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

function selectVideoRange(range, el) {
  videoRange = range;
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

function selectVideoDuration(duration, el) {
  videoDuration = duration;
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

async function loadVideoScriptPreview() {
  const preview = document.getElementById('videoScriptPreview');
  const opening = document.getElementById('videoOpeningText');
  const captionList = document.getElementById('videoCaptionList');
  const loadingText = document.getElementById('videoLoadingText');

  opening.textContent = '正在生成旁白...';
  captionList.textContent = '';
  preview.style.display = 'block';

  try {
    const photos = getFilteredTimelinePhotos();
    const apiBase = getApiBase();

    if (apiBase && photos.length > 0) {
      const res = await fetch(`${apiBase}/api/generate-video-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photos: photos.slice(0, 8).map(p => ({
            title: p.title || p.name || '美好瞬间',
            date: p.date ? (typeof p.date === 'string' ? p.date : p.date.toISOString().split('T')[0]) : ''
          })),
          theme: videoTheme,
          music: videoMusic
        })
      });
      const data = await res.json();
      videoScript = data;
    }

    if (!videoScript || !videoScript.opening) {
      videoScript = generateLocalVideoScript(photos, videoTheme);
    }

    opening.textContent = videoScript.opening;
    captionList.textContent = '分镜字幕：' + (videoScript.captions || []).join(' / ');
    if (loadingText) loadingText.textContent = '正在生成回忆录...';
  } catch (err) {
    console.error('loadVideoScriptPreview error:', err);
    videoScript = generateLocalVideoScript(getFilteredTimelinePhotos(), videoTheme);
    opening.textContent = videoScript.opening;
    captionList.textContent = '分镜字幕：' + (videoScript.captions || []).join(' / ');
  }
}

function getFilteredTimelinePhotos() {
  const now = new Date();
  return realPhotos.filter(p => {
    if (videoRange === 'all') return true;
    const d = new Date(p.date);
    const diff = (now - d) / (1000 * 60 * 60 * 24);
    if (videoRange === 'year') return diff <= 365;
    if (videoRange === 'month') return diff <= 30;
    return true;
  });
}

function generateLocalVideoScript(photos, theme) {
  const titles = {
    warm: '每一段时光，都值得被温柔记录。',
    travel: '世界很大，脚步不停，这些风景成了最好的纪念品。',
    growth: '从懵懂到坚定，每一步成长，都值得被看见。',
    year: '这一年，有欢笑、有感动，也有闪闪发光的瞬间。'
  };
  const captions = (photos || []).slice(0, 5).map((p, i) => {
    const labels = ['那个瞬间', '难忘的一刻', '温暖的画面', '珍贵的回忆', '美好的时光'];
    return p.title || labels[i] || '美好瞬间';
  });
  while (captions.length < 3) captions.push('值得珍藏');
  return {
    opening: titles[theme] || titles.warm,
    captions: captions.slice(0, 5)
  };
}

async function generateTimelineVideo() {
  const btn = document.getElementById('videoGenBtn');
  const loading = document.getElementById('videoLoading');
  const result = document.getElementById('videoResult');
  const progressFill = document.getElementById('videoProgressFill');
  const canvas = document.getElementById('videoCanvas');
  const videoPreview = document.getElementById('videoPreview');

  // 选择照片
  let photos = getFilteredTimelinePhotos();
  if (photos.length === 0) {
    // 如果没有真实照片，使用示例数据生成演示视频
    photos = getDemoTimelinePhotos();
  }

  // 按日期排序
  photos = [...photos].sort((a, b) => new Date(a.date) - new Date(b.date));
  // 限制照片数量
  const maxPhotos = Math.min(photos.length, videoDuration <= 15 ? 8 : videoDuration <= 30 ? 15 : 25);
  photos = photos.slice(0, maxPhotos);

  // 确保有脚本
  if (!videoScript || !videoScript.opening) {
    videoScript = generateLocalVideoScript(photos, videoTheme);
  }

  btn.disabled = true;
  loading.style.display = 'flex';
  result.style.display = 'block';
  videoPreview.style.display = 'none';
  progressFill.style.width = '0%';

  try {
    // 使用Canvas + MediaRecorder生成视频
    const stream = canvas.captureStream(30);
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    const chunks = [];

    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = () => {
      videoBlob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(videoBlob);
      videoPreview.src = url;
      videoPreview.style.display = 'block';
      document.querySelector('.video-canvas-container').style.display = 'none';
      showToast('回忆视频生成完成！');
    };

    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    const frameDuration = (videoDuration * 1000) / photos.length;
    const transitionFrames = 15; // 过渡帧数
    let currentPhotoIdx = 0;
    let frameCount = 0;
    let inTransition = false;

    // 预加载所有图片
    const loadedImages = [];
    let loadCount = 0;
    await new Promise((resolve) => {
      photos.forEach((photo, idx) => {
        const img = new Image();
        img.onload = () => {
          loadedImages[idx] = img;
          loadCount++;
          if (loadCount === photos.length) resolve();
        };
        img.onerror = () => {
          loadedImages[idx] = null;
          loadCount++;
          if (loadCount === photos.length) resolve();
        };
        img.src = photo.src;
      });
      // 超时保护
      setTimeout(() => { if (loadCount < photos.length) resolve(); }, 5000);
    });

    mediaRecorder.start();

    const drawFrame = () => {
      if (currentPhotoIdx >= photos.length) {
        if (mediaRecorder.state === 'recording') mediaRecorder.stop();
        return;
      }

      const photo = photos[currentPhotoIdx];
      const img = loadedImages[currentPhotoIdx];

      const drawImageCover = (img, x, y, w, h) => {
        if (!img) {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(x, y, w, h);
          return;
        }
        const scale = Math.max(w / img.width, h / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        const dx = x + (w - dw) / 2;
        const dy = y + (h - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
      };

      // 背景
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, W, H);

      // 照片（带圆角裁剪）
      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(40, 120, W - 80, H - 280, 20);
      } else {
        const r = 20, x = 40, y = 120, w = W - 80, h = H - 280;
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
      }
      ctx.closePath();
      ctx.clip();
      drawImageCover(img, 40, 120, W - 80, H - 280);
      ctx.restore();

      // 顶部标题栏
      ctx.fillStyle = 'rgba(15,23,42,0.8)';
      ctx.fillRect(0, 0, W, 100);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AI人生档案馆', W / 2, 50);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '20px sans-serif';
      const yearText = photo.date ? (new Date(photo.date).getFullYear() || '') + '年' : '';
      ctx.fillText(`人生回忆录 · ${yearText || '珍藏时光'}`, W / 2, 85);

      // 开场白显示（前1秒）
      if (currentPhotoIdx === 0 && frameCount < 30) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        wrapText(ctx, videoScript.opening, W / 2, H / 2, W - 120, 52);
      }

      // 字幕显示
      const caption = videoScript.captions && videoScript.captions[currentPhotoIdx];
      if (caption) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(40, H - 240, W - 80, 60);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(caption, W / 2, H - 202);
      }

      // 底部信息
      ctx.fillStyle = 'rgba(15,23,42,0.8)';
      ctx.fillRect(0, H - 140, W, 140);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '24px sans-serif';
      ctx.fillText(photo.name || photo.title || '美好瞬间', W / 2, H - 100);

      if (photo.analysis) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = '22px sans-serif';
        ctx.fillText('⭐'.repeat(photo.analysis.stars || 3), W / 2, H - 65);
        ctx.fillStyle = '#38bdf8';
        ctx.font = '18px sans-serif';
        ctx.fillText(photo.analysis.intentLabel || '回忆', W / 2, H - 35);
      }

      // 进度条
      const progress = ((currentPhotoIdx + 1) / photos.length) * 100;
      progressFill.style.width = progress + '%';

      frameCount++;
      if (frameCount >= frameDuration / 33) {
        frameCount = 0;
        currentPhotoIdx++;
      }

      if (currentPhotoIdx < photos.length) {
        requestAnimationFrame(drawFrame);
      } else {
        // 最后一张照片显示结束后停止录制
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') mediaRecorder.stop();
        }, frameDuration);
      }
    };

    drawFrame();

    // 自动停止
    setTimeout(() => {
      if (mediaRecorder.state === 'recording') mediaRecorder.stop();
    }, videoDuration * 1000 + 500);

  } catch (err) {
    console.error('视频生成失败:', err);
    showToast('视频生成失败，请重试');
  } finally {
    btn.disabled = false;
    loading.style.display = 'none';
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split('');
  let line = '';
  let cy = y - lineHeight;
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = words[i];
      cy += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, cy);
}

function getDemoTimelinePhotos() {
  return [
    { src: 'assets/family_beach_400x300.png', name: '三亚家庭旅行', title: '三亚家庭旅行', date: '2026-06-15', analysis: { stars: 5, intentLabel: '家庭回忆' } },
    { src: 'assets/travel_landscape_400x300.png', name: '青海湖骑行', title: '青海湖骑行', date: '2025-08-20', analysis: { stars: 4, intentLabel: '旅行风景' } },
    { src: 'assets/child_growth_400x300.png', name: '宝贝三岁生日', title: '宝贝三岁生日', date: '2024-12-01', analysis: { stars: 5, intentLabel: '成长记录' } },
    { src: 'assets/food_photo_400x300.png', name: '周末聚餐', title: '周末聚餐', date: '2026-05-01', analysis: { stars: 3, intentLabel: '美食生活' } },
    { src: 'assets/family_beach_400x300.png', name: '海边日落', title: '海边日落', date: '2026-06-16', analysis: { stars: 4, intentLabel: '旅行风景' } },
    { src: 'assets/travel_landscape_400x300.png', name: '山间徒步', title: '山间徒步', date: '2025-10-05', analysis: { stars: 4, intentLabel: '旅行风景' } }
  ];
}

function downloadVideo() {
  if (!videoBlob) {
    showToast('请先生成视频');
    return;
  }
  const url = URL.createObjectURL(videoBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `人生时间轴_${new Date().toLocaleDateString()}.webm`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('视频已开始下载');
}

function regenerateVideo() {
  document.getElementById('videoResult').style.display = 'none';
  document.getElementById('videoLoading').style.display = 'none';
  document.querySelector('.video-canvas-container').style.display = 'block';
  const btn = document.getElementById('videoGenBtn');
  if (btn) btn.disabled = false;
  showToast('请重新选择参数并生成');
}

// ==================== 照片选择器 ====================
function openPhotoSelector(title) {
  const el = document.getElementById('photoSelectorOverlay');
  el.style.display = 'flex';
  el.style.pointerEvents = 'auto';
  el.classList.add('active');
  document.getElementById('selectorTitle').textContent = title || '选择照片';
  renderPhotoSelectorGrid();
}

function closePhotoSelector() {
  const el = document.getElementById('photoSelectorOverlay');
  el.classList.remove('active');
  el.style.display = 'none';
  el.style.pointerEvents = 'none';
}

function renderPhotoSelectorGrid() {
  const grid = document.getElementById('photoSelectorGrid');
  const allPhotos = [...realPhotos];

  if (allPhotos.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">请先导入照片</div>';
    return;
  }

  grid.innerHTML = allPhotos.map(p => {
    const isSelected = storySelectedPhotos.some(sp => sp.id === p.id);
    return `
      <div class="photo-selector-item ${isSelected ? 'selected' : ''}" onclick="toggleSelectorPhoto('${p.id}', this)">
        <img src="${p.src}" alt="${p.name}">
        <div class="photo-selector-check">✓</div>
      </div>
    `;
  }).join('');

  updateSelectorCount();
}

function toggleSelectorPhoto(id, el) {
  const photo = realPhotos.find(p => p.id === id);
  if (!photo) return;

  const isSelected = el.classList.contains('selected');
  if (!isSelected) {
    // 即将选中
    if (photoSelectorMaxCount && storySelectedPhotos.length >= photoSelectorMaxCount) {
      showToast(`最多只能选择 ${photoSelectorMaxCount} 张照片`);
      return;
    }
    el.classList.add('selected');
    if (!storySelectedPhotos.some(p => p.id === id)) {
      storySelectedPhotos.push(photo);
    }
  } else {
    el.classList.remove('selected');
    storySelectedPhotos = storySelectedPhotos.filter(p => p.id !== id);
  }
  updateSelectorCount();
}

function selectStoryPhoto(id, el) {
  toggleSelectorPhoto(id, el);
}

function updateSelectorCount() {
  const el = document.getElementById('selectorCount');
  if (el) el.textContent = `已选择 ${storySelectedPhotos.length} 张`;
}

function confirmPhotoSelection() {
  closePhotoSelector();
  if (photoSelectorCallback) {
    photoSelectorCallback(storySelectedPhotos);
  }
}

// ==================== 触摸滑动支持 ====================
let touchStartY = 0;
document.getElementById('photoModal')?.addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
});
document.getElementById('photoModal')?.addEventListener('touchend', e => {
  const diff = e.changedTouches[0].clientY - touchStartY;
  if (diff > 100) closePhotoModal();
});

// ==================== 搜索 ====================
let searchTimeout;
document.getElementById('searchInput')?.addEventListener('input', function(e) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    if (e.target.value) {
      showToast('搜索: ' + e.target.value);
    }
  }, 500);
});

// ==================== Service Worker ====================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      console.log('SW registered:', reg.scope);
    }).catch(err => {
      console.log('SW registration failed:', err);
    });
  });
}

// ==================== API 配置弹窗 ====================
function openApiConfigModal() {
  const modal = document.getElementById('apiConfigModal');
  const input = document.getElementById('apiBaseInput');
  const select = document.getElementById('apiProviderSelect');
  const result = document.getElementById('apiTestResult');

  if (input) input.value = getApiBase() || '';
  if (select) select.value = localStorage.getItem('life_archive_api_provider') || 'zhipu';
  if (result) result.textContent = '';

  if (modal) {
    modal.style.display = 'flex';
    modal.style.pointerEvents = 'auto';
    modal.classList.add('active');
  }
  document.body.style.overflow = 'hidden';
}

function closeApiConfigModal() {
  const modal = document.getElementById('apiConfigModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
    modal.style.pointerEvents = 'none';
  }
  document.body.style.overflow = '';
}

async function saveApiConfig() {
  const input = document.getElementById('apiBaseInput');
  const select = document.getElementById('apiProviderSelect');
  const result = document.getElementById('apiTestResult');

  let url = (input?.value || '').trim();
  // 移除末尾斜杠
  url = url.replace(/\/$/, '');

  if (url && !/^https?:\/\//i.test(url)) {
    if (result) result.textContent = '地址需以 http:// 或 https:// 开头';
    return;
  }

  setApiBase(url);
  if (select) localStorage.setItem('life_archive_api_provider', select.value);

  if (result) result.textContent = '正在探测服务状态...';
  await updateApiStatusBadge();

  const badge = document.getElementById('apiStatusBadge');
  if (badge && badge.dataset.status === 'connected') {
    if (result) result.textContent = '连接成功，AI 能力已就绪';
    setTimeout(closeApiConfigModal, 600);
  } else if (badge && badge.dataset.status === 'nok') {
    if (result) result.textContent = '服务已连通，但后端未配置 API Key，将使用本地文案';
  } else {
    if (result) result.textContent = '无法连接到该地址，请检查后端服务是否启动';
  }
}

async function updateApiStatusBadge() {
  const badge = document.getElementById('apiStatusBadge');
  if (!badge) return;

  badge.textContent = '⚙️ 检测中...';
  badge.dataset.status = 'checking';

  const apiBase = getApiBase();
  if (!apiBase) {
    badge.textContent = '⚙️ 未连接';
    badge.dataset.status = 'none';
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const healthRes = await fetch(`${apiBase}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!healthRes.ok) throw new Error('health not ok');

    const configRes = await fetch(`${apiBase}/api/config`);
    const config = await configRes.json();

    if (config.hasKey) {
      badge.textContent = '⚙️ 已连接';
      badge.dataset.status = 'connected';
      badge.style.color = 'var(--success)';
    } else {
      badge.textContent = '⚙️ 已连接(无Key)';
      badge.dataset.status = 'nok';
      badge.style.color = 'var(--warning)';
    }
  } catch (err) {
    badge.textContent = '⚙️ 未连接';
    badge.dataset.status = 'disconnected';
    badge.style.color = 'var(--muted)';
    console.warn('API 状态检测失败:', err.message);
  }
}
