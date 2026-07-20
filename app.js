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

// ==================== 用户数据同步到后端 ====================
// 同步用户数据到后台
async function syncUserToBackend() {
  if (!currentUser) return;
  try {
    await fetch(`${API_BASE}/api/user/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: currentUser,
        photoCount: realPhotos.length,
        memoirCount: savedMemoirs.length,
        settings: { theme: localStorage.getItem('lifeArchiveTheme') || 'dark' }
      })
    });
  } catch(e) { console.error('同步失败', e); }
}

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
let recycleBin = [];           // 回收站照片
let currentPage = 'home';
let currentCategoryIntent = null;  // 当前正在查看的分类，用于星级筛选时限定范围
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
let currentUser = null;        // 当前登录用户手机号

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
// 深色/浅色主题切换
function toggleDarkTheme() {
  const toggle = document.getElementById('darkThemeToggle');
  const isDark = toggle.classList.contains('active');

  if (isDark) {
    // 切换到浅色
    document.documentElement.classList.add('light-theme');
    localStorage.setItem('lifeArchiveTheme', 'light');
    toggle.classList.remove('active');
    showToast('已切换到浅色主题');
  } else {
    // 切换到深色
    document.documentElement.classList.remove('light-theme');
    localStorage.setItem('lifeArchiveTheme', 'dark');
    toggle.classList.add('active');
    showToast('已切换到深色主题');
  }
}

// 页面加载时恢复主题
function initTheme() {
  const saved = localStorage.getItem('lifeArchiveTheme');
  const toggle = document.getElementById('darkThemeToggle');
  if (saved === 'light') {
    document.documentElement.classList.add('light-theme');
    if (toggle) toggle.classList.remove('active');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // 检查登录状态
  if (!checkLoginStatus()) {
    // 未登录，显示登录页，不加载其他内容
    return;
  }
  initTheme();
  loadPhotosFromStorage();
  // DOM就绪后立即刷新一次首页统计（即便localStorage未恢复File对象，也保证不会卡在0）
  updateHomeStats();
  initUploadZone();
  updateImportCount();
  renderRealPhotoGrid();
  updateApiStatusBadge();
  distributePhotosToPages();
  loadSavedMemoirs();
  initPhotoModalSwipe();
  syncUserToBackend();
});

// ==================== 用户登录系统 ====================
async function sendVerifyCode() {
  const phone = document.getElementById('loginPhone').value.trim();
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    showToast('请输入正确的11位手机号');
    return;
  }

  const btn = document.getElementById('sendCodeBtn');
  btn.disabled = true;
  btn.textContent = '发送中...';

  try {
    const resp = await fetch(`${API_BASE}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const result = await resp.json();

    if (!result.success) {
      showToast(result.message);
      btn.disabled = false;
      btn.textContent = '获取验证码';
      return;
    }

    // 开发模式下显示验证码
    if (result.devCode) {
      showToast(`验证码：${result.devCode}（开发模式，正式版将通过短信发送）`);
      // 自动填入验证码（开发模式方便测试）
      document.getElementById('loginCode').value = result.devCode;
    } else {
      showToast('验证码已发送到您的手机');
    }

    // 60秒倒计时
    let countdown = 60;
    btn.textContent = `${countdown}s 后重发`;
    const timer = setInterval(() => {
      countdown--;
      btn.textContent = `${countdown}s 后重发`;
      if (countdown <= 0) {
        clearInterval(timer);
        btn.disabled = false;
        btn.textContent = '获取验证码';
      }
    }, 1000);
  } catch(e) {
    showToast('网络错误，请检查服务是否启动');
    btn.disabled = false;
    btn.textContent = '获取验证码';
  }
}

async function doLogin() {
  const phone = document.getElementById('loginPhone').value.trim();
  const code = document.getElementById('loginCode').value.trim();

  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    showToast('请输入正确的11位手机号');
    return;
  }
  if (!code || code.length !== 6) {
    showToast('请输入6位验证码');
    return;
  }

  // 调用后端验证
  try {
    const resp = await fetch(`${API_BASE}/api/sms/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code })
    });
    const result = await resp.json();

    if (!result.success) {
      showToast(result.message);
      return;
    }
  } catch(e) {
    showToast('验证失败，请检查网络');
    return;
  }

  // 验证成功，执行登录
  currentUser = phone;
  localStorage.setItem('currentUser', phone);

  // 恢复该用户的数据
  switchUserData(phone);

  // 隐藏登录页
  document.getElementById('loginPage').style.display = 'none';

  // 更新设置页用户信息
  const phoneEl = document.getElementById('currentUserPhone');
  if (phoneEl) phoneEl.textContent = formatPhone(phone);

  showToast('登录成功！欢迎回来');

  // 刷新所有页面
  loadPhotosFromStorage();
  loadSavedMemoirs();
  distributePhotosToPages();
  updateHomeStats();
}

function logout() {
  if (!confirm('确定要退出登录吗？\n退出后可重新登录恢复数据')) return;

  currentUser = null;
  localStorage.removeItem('currentUser');

  // 清空当前显示
  realPhotos = [];
  recycleBin = [];
  savedMemoirs = [];

  // 显示登录页
  document.getElementById('loginPage').style.display = 'flex';

  // 清空输入
  document.getElementById('loginPhone').value = '';
  document.getElementById('loginCode').value = '';

  showToast('已退出登录');
}

function formatPhone(phone) {
  if (!phone || phone.length !== 11) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(7);
}

// 切换用户数据（按手机号隔离）
function switchUserData(phone) {
  // 保存当前用户数据（如果有）
  const oldUser = localStorage.getItem('currentUser');
  if (oldUser && oldUser !== phone) {
    saveUserDataForUser(oldUser);
  }

  // 加载新用户数据
  loadUserDataForUser(phone);
}

function saveUserDataForUser(phone) {
  const prefix = `user_${phone}_`;
  try {
    localStorage.setItem(prefix + 'photos', localStorage.getItem('lifeArchivePhotos') || '[]');
    localStorage.setItem(prefix + 'recycleBin', localStorage.getItem('lifeArchiveRecycleBin') || '[]');
    localStorage.setItem(prefix + 'memoirs', localStorage.getItem('lifeArchiveMemoirs') || '[]');
    localStorage.setItem(prefix + 'theme', localStorage.getItem('lifeArchiveTheme') || 'dark');
  } catch(e) { console.error('保存用户数据失败', e); }
}

function loadUserDataForUser(phone) {
  const prefix = `user_${phone}_`;
  try {
    const photos = localStorage.getItem(prefix + 'photos');
    if (photos) localStorage.setItem('lifeArchivePhotos', photos);
    else localStorage.setItem('lifeArchivePhotos', '[]');

    const recycle = localStorage.getItem(prefix + 'recycleBin');
    if (recycle) localStorage.setItem('lifeArchiveRecycleBin', recycle);
    else localStorage.setItem('lifeArchiveRecycleBin', '[]');

    const memoirs = localStorage.getItem(prefix + 'memoirs');
    if (memoirs) localStorage.setItem('lifeArchiveMemoirs', memoirs);
    else localStorage.setItem('lifeArchiveMemoirs', '[]');

    const theme = localStorage.getItem(prefix + 'theme');
    if (theme) localStorage.setItem('lifeArchiveTheme', theme);
  } catch(e) { console.error('加载用户数据失败', e); }
}

// 页面加载时检查登录状态（demo模式：跳过登录直接体验）
function checkLoginStatus() {
  // demo模式：不需要登录，直接隐藏登录页
  const loginPage = document.getElementById('loginPage');
  if (loginPage) loginPage.style.display = 'none';
  currentUser = 'demo_user';
  const phoneEl = document.getElementById('currentUserPhone');
  if (phoneEl) phoneEl.textContent = '体验模式';
  return true;
}

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
  if (currentUser) saveUserDataForUser(currentUser);
  syncUserToBackend();
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

// 清除旧的分析缓存（用于调试/修复后重新分析）
function clearAnalysisCache() {
  localStorage.removeItem('lifeArchivePhotos');
  localStorage.removeItem('lifeArchivePhotoCount');
  localStorage.removeItem('lifeArchiveRecycleBin');
  realPhotos = [];
  recycleBin = [];
  console.log('已清除分析缓存和回收站');
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
  // 更新首页统计
  updateHomeStats();
}

function updateHomeStats() {
  const totalEl = document.getElementById('statTotal');
  const analyzedEl = document.getElementById('statAnalyzed');
  const sizeEl = document.getElementById('statSize');

  const total = realPhotos.length;
  const analyzed = realPhotos.filter(p => p.analyzed).length;
  // 估算占用空间：每张照片平均约3MB
  const sizeMB = realPhotos.reduce((sum, p) => sum + (p.size || 3 * 1024 * 1024), 0);
  const sizeGB = (sizeMB / (1024 * 1024 * 1024)).toFixed(1);

  if (totalEl) totalEl.textContent = total.toLocaleString();
  if (analyzedEl) analyzedEl.textContent = analyzed.toLocaleString();
  if (sizeEl) sizeEl.textContent = total > 0 ? sizeGB : '0.0';
}

function renderRealPhotoGrid() {
  const grid = document.getElementById('realPhotoGrid');
  if (!grid) return;

  if (realPhotos.length === 0) {
    grid.innerHTML = '';
    return;
  }

  const analyzed = realPhotos.filter(p => p.analyzed);
  const unanalyzed = realPhotos.filter(p => !p.analyzed);

  let html = '';

  // 确定性分级（仅分析完成的照片）
  if (analyzed.length > 0) {
    const highCertainty = analyzed.filter(p => p.analysis.avgScore >= 50 || ['emotion', 'info', 'learning'].includes(p.analysis.intent));
    const midCertainty = analyzed.filter(p => p.analysis.avgScore < 50 && !['emotion', 'info', 'learning'].includes(p.analysis.intent) && p.analysis.intent !== 'temp');

    // 高确定性区域
    if (highCertainty.length > 0) {
      html += `<div style="grid-column:1/-1;font-size:13px;font-weight:600;color:var(--success);margin-bottom:4px;display:flex;align-items:center;gap:6px">`;
      html += `<span>✅ 高确定性（${highCertainty.length}张，建议保留）</span>`;
      html += `</div>`;
      html += highCertainty.slice(0, 9).map(p => renderPhotoCard(p)).join('');
      if (highCertainty.length > 9) {
        html += `<div class="real-photo-item" style="display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--muted)">+${highCertainty.length - 9}</div>`;
      }
    }

    // 中确定性区域
    if (midCertainty.length > 0) {
      html += `<div style="grid-column:1/-1;font-size:13px;font-weight:600;color:var(--warning);margin-bottom:4px;margin-top:8px;display:flex;align-items:center;gap:6px">`;
      html += `<span>⚠️ 中确定性（${midCertainty.length}张，建议清理）</span>`;
      html += `<button class="btn btn-outline" style="min-height:28px;font-size:11px;padding:2px 10px" onclick="deleteLowScorePhotos()">一键清理</button>`;
      html += `</div>`;
      html += midCertainty.slice(0, 9).map(p => renderPhotoCard(p)).join('');
      if (midCertainty.length > 9) {
        html += `<div class="real-photo-item" style="display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--muted)">+${midCertainty.length - 9}</div>`;
      }
    }
  }

  // 未分析的照片
  if (unanalyzed.length > 0) {
    html += `<div style="grid-column:1/-1;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:4px;margin-top:8px">`;
    html += `⏳ 分析中（${unanalyzed.length}张）`;
    html += `</div>`;
    html += unanalyzed.slice(0, 9).map(p => renderPhotoCard(p)).join('');
  }

  // 回收站入口
  if (recycleBin.length > 0) {
    html += `<div style="grid-column:1/-1;margin-top:8px;text-align:center">`;
    html += `<button class="btn btn-outline" style="min-height:36px;font-size:12px" onclick="showRecycleBin()">🗑️ 回收站（${recycleBin.length}）</button>`;
    html += `</div>`;
  }

  grid.innerHTML = html;
}

// 渲染单个照片卡片
function renderPhotoCard(p) {
  const intentColors = {
    emotion: '#34d399', creative: '#818cf8', info: '#38bdf8',
    work: '#fbbf24', learning: '#a78bfa', temp: '#94a3b8', life: '#fb923c'
  };
  const color = intentColors[p.analysis?.intent] || 'var(--muted)';
  return `
    <div class="real-photo-item" onclick="showRealPhotoDetail('${p.id}')" ontouchstart="onPhotoLongPress('${p.id}')" ontouchend="onPhotoLongPressEnd()" onmousedown="onPhotoLongPress('${p.id}')" onmouseup="onPhotoLongPressEnd()" onmouseleave="onPhotoLongPressEnd()">
      <img src="${p.src}" alt="${p.name}">
      ${p.analyzed ? `<div class="ai-badge" style="background:${color}">${p.analysis.stars}★</div>` : ''}
      ${p.analyzed ? `<div class="ai-score">${p.analysis.avgScore}分</div>` : ''}
      ${p.analyzed ? `<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);font-size:9px;color:#fff;padding:1px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.analysis.intentLabel || ''}</div>` : ''}
    </div>
  `;
}

// 显示回收站弹窗
function showRecycleBin() {
  const existing = document.getElementById('recycleBinModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'recycleBinModal';
  modal.className = 'modal-overlay active';
  modal.style.cssText = 'display:flex;pointer-events:auto';

  const items = recycleBin.map(p => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--rule)">
      <div style="width:40px;height:40px;border-radius:var(--radius-sm);background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:20px">🖼️</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
        <div style="font-size:11px;color:var(--muted)">${p.analysis?.intentLabel || '未分析'} · 删除于 ${p.deletedAt ? new Date(p.deletedAt).toLocaleDateString() : ''}</div>
      </div>
      <button class="btn btn-outline" style="min-height:32px;font-size:12px;padding:2px 10px" onclick="restoreFromRecycleBin('${p.id}')">恢复</button>
      <button class="btn btn-danger" style="min-height:32px;font-size:12px;padding:2px 10px" onclick="permanentlyDelete('${p.id}')">删除</button>
    </div>
  `).join('');

  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--radius);max-width:500px;width:90%;max-height:80vh;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid var(--rule)">
        <span style="font-size:16px;font-weight:700">🗑️ 回收站（${recycleBin.length}）</span>
        <span style="cursor:pointer;font-size:18px" onclick="document.getElementById('recycleBinModal').remove()">✕</span>
      </div>
      <div style="flex:1;overflow-y:auto;padding:0 16px">
        ${items || '<div style="text-align:center;padding:40px;color:var(--muted)">回收站为空</div>'}
      </div>
      <div style="padding:12px 16px;border-top:1px solid var(--rule);display:flex;gap:8px">
        <button class="btn btn-danger" style="flex:1;min-height:40px" onclick="emptyRecycleBin()">清空回收站</button>
        <button class="btn btn-outline" style="flex:1;min-height:40px" onclick="document.getElementById('recycleBinModal').remove()">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// ==================== 照片自动归类分发 ====================
function distributePhotosToPages() {
  // 先刷新首页统计，避免导入后"总照片/已分析/占用"仍显示0
  updateHomeStats();
  renderHomeTimelineCard();
  renderHomeVaultCard();
  renderTodayMemoryCard();
  renderCategoriesPage();
  renderTimelinePage();
  renderCleanPage();
  renderVaultPage();
  updateImportCount();
}

// 首页时间轴卡片
function renderHomeTimelineCard() {
  const grid = document.getElementById('homeTimelineGrid');
  const info = document.getElementById('homeTimelineInfo');
  const stats = document.getElementById('homeTimelineStats');
  if (!grid) return;

  const analyzed = realPhotos.filter(p => p.analyzed).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (analyzed.length === 0) {
    grid.innerHTML = '';
    if (info) info.textContent = '暂无照片，点击导入';
    if (stats) stats.innerHTML = '';
    return;
  }

  const top5 = analyzed.slice(0, 5);
  grid.innerHTML = top5.map(p => `
    <div class="photo-item" onclick="showRealPhotoDetail('${p.id}')" style="cursor:pointer">
      <img src="${p.src}" alt="${p.name}">
    </div>
  `).join('');
  if (analyzed.length > 5) {
    grid.innerHTML += `<div class="photo-item" style="background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--muted)" onclick="navigateTo('timeline')">+${analyzed.length - 5}</div>`;
  }

  const latest = analyzed[0];
  const dateStr = latest.date ? new Date(latest.date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' }) : '未知时间';
  if (info) info.textContent = `最近：${dateStr} · ${latest.analysis?.intentLabel || ''}`;
  if (stats) stats.innerHTML = `<span class="stars">${'⭐'.repeat(latest.analysis?.stars || 1)}</span> 共${analyzed.length}张`;
}

// 首页保险柜卡片
function renderHomeVaultCard() {
  const grid = document.getElementById('homeVaultGrid');
  const tagsEl = document.getElementById('homeVaultTags');
  const emptyEl = document.getElementById('homeVaultEmpty');
  if (!grid) return;

  const vaultPhotos = realPhotos.filter(p => p.analyzed && p.analysis?.intent === 'info');
  if (vaultPhotos.length === 0) {
    grid.innerHTML = '';
    if (tagsEl) tagsEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (tagsEl) {
    const subCats = [...new Set(vaultPhotos.map(p => p.analysis.subCategory || '证件'))];
    tagsEl.innerHTML = subCats.map(s => `<span class="tag tag-blue">${s}</span>`).join('');
  }

  grid.innerHTML = vaultPhotos.slice(0, 8).map(p => `
    <div class="photo-item" onclick="showRealPhotoDetail('${p.id}')" style="cursor:pointer">
      <img src="${p.src}" alt="${p.name}">
    </div>
  `).join('');
}

// 保险柜页面（动态渲染）
function renderVaultPage() {
  const container = document.getElementById('vaultContent');
  if (!container) return;

  const vaultPhotos = realPhotos.filter(p => p.analyzed && p.analysis?.intent === 'info');

  if (vaultPhotos.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--muted)">
        <div style="font-size:40px;margin-bottom:12px">🔒</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:8px">保险柜为空</div>
        <div style="font-size:13px">导入证件类照片（身份证、证书、合同等）后将自动归入保险柜</div>
      </div>
    `;
    return;
  }

  // 按 subCategory 分组
  const groups = {};
  vaultPhotos.forEach(p => {
    const sub = p.analysis?.detections?.subCategory || p.analysis?.intentLabel?.split('·')[1]?.trim() || '证件档案';
    if (!groups[sub]) groups[sub] = [];
    groups[sub].push(p);
  });

  let html = '';
  Object.entries(groups).forEach(([subName, photos]) => {
    html += `
      <div class="vault-category" style="margin-bottom:20px">
        <div class="vault-category-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span class="vault-category-title" style="font-size:14px;font-weight:600">${subName}</span>
          <span class="vault-category-count" style="font-size:12px;color:var(--muted)">共 ${photos.length} 张</span>
        </div>
        <div class="vault-items" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
          ${photos.map(p => `
            <div class="vault-item" onclick="showRealPhotoDetail('${p.id}')" style="cursor:pointer">
              <img src="${p.src}" class="vault-item-img" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--radius-sm)" alt="${p.name}">
              <div class="vault-item-name" style="font-size:11px;text-align:center;margin-top:4px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// 首页"今日回忆"卡片
function renderTodayMemoryCard() {
  const card = document.getElementById('todayMemoryCard');
  const body = document.getElementById('todayMemoryBody');
  if (!card || !body) return;

  const analyzed = realPhotos.filter(p => p.analyzed);
  if (analyzed.length === 0) {
    card.style.display = 'none';
    return;
  }

  // 找到最老的一张照片作为"回忆"
  const oldest = [...analyzed].sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  const daysAgo = Math.floor((Date.now() - new Date(oldest.date)) / (1000 * 60 * 60 * 24));
  const dateStr = new Date(oldest.date).toLocaleDateString('zh-CN');

  card.style.display = 'block';
  card.onclick = () => showRealPhotoDetail(oldest.id);
  body.innerHTML = `
    <div style="display:flex;gap:12px;align-items:center">
      <img src="${oldest.src}" style="width:80px;height:80px;border-radius:10px;object-fit:cover">
      <div>
        <div style="font-size:14px;margin-bottom:4px">${oldest.analysis?.description || oldest.name || '一段珍贵的回忆'}</div>
        <div style="font-size:12px;color:var(--muted)">${dateStr} · ${oldest.analysis?.intentLabel || ''} · ${daysAgo}天前</div>
      </div>
    </div>
  `;
}

// intent 归一化：把后端/本地可能返回的各种别名统一映射到7个标准分类之一
// 标准分类：emotion, info, learning, work, creative, temp, life
// 未知值统一归入 life（生活记录），确保任何已分析照片都不会在分类页"丢失"
function normalizeIntent(intent) {
  const map = {
    emotion: 'emotion', emotion_memory: 'emotion', emotional: 'emotion', memory: 'emotion',
    info: 'info', information: 'info', certificate: 'info', id: 'info', document: 'info',
    learning: 'learning', knowledge: 'learning', study: 'learning', education: 'learning',
    work: 'work', working: 'work', office: 'work', business: 'work',
    creative: 'creative', photography: 'creative', photo: 'creative', art: 'creative',
    temp: 'temp', temporary: 'temp', screenshot: 'temp', screenshot_temp: 'temp', blur: 'temp',
    life: 'life', daily: 'life', lifestyle: 'life', other: 'life', unknown: 'life'
  };
  const key = String(intent || '').toLowerCase().trim();
  return map[key] || 'life';
}

// 分类页
function renderCategoriesPage() {
  const grid = document.getElementById('categoryGrid');
  if (!grid) return;

  // 进入分类页时重置为分类网格视图：显示分类网格，隐藏照片列表与星级筛选栏
  currentCategoryIntent = null;
  grid.style.display = 'grid';
  const photoList = document.getElementById('photoList');
  if (photoList) photoList.style.display = 'none';
  const starBar = document.getElementById('starFilterBar');
  if (starBar) starBar.style.display = 'none';
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';

  const cats = [
    { intent: 'emotion', icon: '❤️', name: '情感记忆' },
    { intent: 'info', icon: '📋', name: '信息留存' },
    { intent: 'learning', icon: '📚', name: '知识学习' },
    { intent: 'work', icon: '💼', name: '工作沟通' },
    { intent: 'creative', icon: '📸', name: '摄影创作' },
    { intent: 'temp', icon: '⏱️', name: '临时记录' },
    { intent: 'life', icon: '🏠', name: '生活记录' }
  ];

  grid.innerHTML = `<div class="category-grid">` + cats.map(c => {
    // 统计所有已分析照片（无论是否出现在清理页），按归一化后的intent匹配
    // 这样即使后端/本地分析返回了别名（如 temporary/screenshot），也能正确归入7个分类之一
    const matched = realPhotos.filter(p => p.analyzed && p.analysis && normalizeIntent(p.analysis.intent) === c.intent);
    const count = matched.length;
    const catPhotos = matched.slice(0, 4);

    return `
      <div class="category-card" onclick="showCategoryPhotos('${c.intent}')" style="display:flex;align-items:center;gap:10px;padding:14px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--ink);line-height:1.4">${c.name}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px">${count} 张</div>
        </div>
        <div style="width:56px;height:56px;flex-shrink:0;display:grid;grid-template-columns:1fr 1fr;gap:2px;border-radius:8px;overflow:hidden">
          ${catPhotos.length > 0 
            ? catPhotos.map(p => `<img src="${p.src}" style="width:100%;height:100%;object-fit:cover" alt="${p.name}">`).join('') 
            : Array(4).fill(`<div style="background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:13px;opacity:0.2">${c.icon}</div>`).join('')}
        </div>
      </div>
    `;
  }).join('') + `</div>`;
}

// 搜索照片
function searchPhotos(keyword) {
  if (!keyword || !keyword.trim()) {
    backToCategories();
    return;
  }
  const kw = keyword.trim().toLowerCase();
  const results = realPhotos.filter(p => {
    const name = (p.name || '').toLowerCase();
    const desc = (p.analysis?.description || '').toLowerCase();
    const intent = (p.analysis?.intentLabel || '').toLowerCase();
    return name.includes(kw) || desc.includes(kw) || intent.includes(kw);
  });

  const grid = document.getElementById('photoListGrid');
  const titleEl = document.getElementById('photoListTitle');
  if (titleEl) titleEl.textContent = `搜索"${keyword}" · ${results.length}张`;
  if (grid) {
    grid.innerHTML = results.length > 0 ? results.map(p => `
      <div class="photo-item" onclick="showRealPhotoDetail('${p.id}')" style="cursor:pointer">
        <img src="${p.src}" alt="${p.name}">
        ${p.analyzed ? `<span class="photo-star">${'⭐'.repeat(p.analysis.stars || 1)}</span>` : ''}
      </div>
    `).join('') : '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px">未找到匹配的照片</div>';
  }
  // 搜索不属于分类浏览，隐藏星级筛选栏并清空当前分类
  currentCategoryIntent = null;
  const starBar = document.getElementById('starFilterBar');
  if (starBar) starBar.style.display = 'none';
  document.getElementById('categoryGrid').style.display = 'none';
  document.getElementById('photoList').style.display = 'block';
}

// 时间轴页
function renderTimelinePage() {
  const container = document.getElementById('timelineContent');
  if (!container) return;

  const analyzed = realPhotos.filter(p => p.analyzed);
  if (analyzed.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">暂无照片，导入照片后将自动生成时间轴</div>';
    renderTimelineMemoirCard();
    return;
  }

  // 按年月分组
  const groups = {};
  analyzed.forEach(p => {
    const d = new Date(p.date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const key = `${year}-${month}`;
    if (!groups[key]) groups[key] = { year, month, photos: [] };
    groups[key].photos.push(p);
  });

  // 按时间倒序排列
  const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  let currentYear = '';
  let html = '';

  sortedKeys.forEach(key => {
    const g = groups[key];
    if (g.year !== currentYear) {
      currentYear = g.year;
      html += `<div class="timeline-year">${g.year}年</div>`;
    }

    const topPhoto = g.photos[0];
    const avgStars = Math.round(g.photos.reduce((s, p) => s + (p.analysis?.stars || 1), 0) / g.photos.length);
    const monthPhotos = g.photos;

    html += `
      <div class="timeline-item ${avgStars >= 4 ? 'highlight' : ''}" onclick="showRealPhotoDetail('${topPhoto.id}')">
        <div class="timeline-item-header">
          <span class="timeline-item-title">${g.month}月 · ${topPhoto.analysis?.intentLabel || '照片'}</span>
          <span class="timeline-item-date">${g.month}月</span>
        </div>
        <div class="timeline-item-meta">${g.photos.length}张照片 · <span class="stars">${'⭐'.repeat(avgStars)}</span></div>
        ${monthPhotos.length > 0 ? `<div class="timeline-photos">${monthPhotos.map(p => `<img src="${p.src}" alt="${p.name}" onclick="event.stopPropagation();showRealPhotoDetail('${p.id}')">`).join('')}</div>` : ''}
      </div>
    `;
  });

  container.innerHTML = html + `<div style="text-align:center;padding:20px;color:var(--muted);font-size:14px">共 ${analyzed.length} 张照片</div>`;
  renderTimelineMemoirCard();
}

// 清理页
function renderCleanPage() {
  const container = document.getElementById('cleanContent');
  if (!container) return;

  const lowScore = realPhotos.filter(p => {
    if (!p.analyzed || !p.analysis) return false;
    const a = p.analysis;
    const intent = normalizeIntent(a.intent);
    // 临时截图类：建议清理（使用归一化后的intent，兼容 temporary/screenshot 等别名）
    if (intent === 'temp') return true;
    // 高价值分类（情感、信息、知识）不清理
    if (['emotion', 'info', 'learning'].includes(intent)) return false;
    // 其他分类：综合分值低于30才建议清理
    return a.avgScore < 30;
  });

  if (lowScore.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--muted)">
        <div style="font-size:40px;margin-bottom:12px">✨</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:8px">暂无需要清理的照片</div>
        <div style="font-size:13px">所有照片评分均高于50分，无需清理</div>
      </div>
    `;
    return;
  }

  let html = `
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:24px;font-weight:700;color:var(--warning)">${lowScore.length} 张</div>
      <div style="color:var(--muted);font-size:14px">建议清理（综合分值低于50）</div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--rule);border-radius:var(--radius);padding:10px 12px;margin-bottom:14px;font-size:12px;color:var(--muted);line-height:1.6">
      ℹ️ 以下照片建议清理（仍在对应分类中可见，清理只是建议，不会从分类中移除；确认删除后才会进入回收站，可在回收站恢复）。
    </div>
    <div class="clean-group">
      <div class="clean-group-header">
        <span class="tag tag-yellow">⚠️ 中确定性</span>
        <span class="clean-group-count">${lowScore.length}张</span>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px">建议清理：低分照片、截图、模糊照片</div>
      <div class="clean-photos">
  `;

  lowScore.forEach(p => {
    html += `
      <div class="clean-photo" onclick="toggleCleanPhoto(this, '${p.id}')">
        <img src="${p.src}" alt="${p.name}">
        <div class="clean-photo-overlay">${p.analysis.avgScore}分</div>
      </div>
    `;
  });

  html += `
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-sm btn-outline" style="flex:1" onclick="selectAllClean(true)">全选</button>
        <button class="btn btn-sm btn-outline" style="flex:1" onclick="selectAllClean(false)">全不选</button>
        <button class="btn btn-sm btn-danger" style="flex:1" onclick="deleteSelectedClean()">删除选中</button>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// 清理页交互
let cleanSelectedIds = new Set();
function toggleCleanPhoto(el, photoId) {
  el.classList.toggle('selected');
  if (el.classList.contains('selected')) {
    cleanSelectedIds.add(photoId);
    if (!el.querySelector('.clean-photo-check')) {
      const check = document.createElement('div');
      check.className = 'clean-photo-check';
      check.textContent = '✓';
      el.appendChild(check);
    }
  } else {
    cleanSelectedIds.delete(photoId);
    const check = el.querySelector('.clean-photo-check');
    if (check) check.remove();
  }
}

function selectAllClean(select) {
  document.querySelectorAll('#cleanContent .clean-photo').forEach(el => {
    const photoId = el.getAttribute('onclick').match(/'([^']+)'/)[1];
    if (select && !el.classList.contains('selected')) {
      el.classList.add('selected');
      cleanSelectedIds.add(photoId);
      const check = document.createElement('div');
      check.className = 'clean-photo-check';
      check.textContent = '✓';
      el.appendChild(check);
    } else if (!select && el.classList.contains('selected')) {
      el.classList.remove('selected');
      cleanSelectedIds.delete(photoId);
      const check = el.querySelector('.clean-photo-check');
      if (check) check.remove();
    }
  });
}

function deleteSelectedClean() {
  if (cleanSelectedIds.size === 0) {
    showToast('请先选择要清理的照片');
    return;
  }
  if (!confirm(`确定要将 ${cleanSelectedIds.size} 张照片移入回收站吗？\n可在回收站恢复。`)) return;

  const count = cleanSelectedIds.size;
  cleanSelectedIds.forEach(photoId => {
    const idx = realPhotos.findIndex(p => p.id === photoId);
    if (idx !== -1) {
      const photo = realPhotos[idx];
      photo.deletedAt = new Date().toISOString();
      recycleBin.push(photo);
      realPhotos.splice(idx, 1);
    }
  });

  saveRecycleBin();
  savePhotosToStorage();
  cleanSelectedIds.clear();
  distributePhotosToPages();
  showToast(`已将 ${count} 张照片移入回收站`);
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
  distributePhotosToPages();
  // 分析完成后再次刷新首页统计（已分析数会更新）
  updateHomeStats();
  const highCount = photos.filter(p => p.analysis && p.analysis.avgScore >= 50).length;
  const midCount = photos.filter(p => p.analysis && p.analysis.avgScore < 50).length;
  showToast(`AI分析完成！高确定性${highCount}张，中确定性${midCount}张`);
}

async function analyzeSinglePhoto(photo) {
  // 先做 Canvas 像素级分析（作为辅助信号 + 降级方案）
  let canvasSignals = null;
  try {
    canvasSignals = await analyzeImageCanvas(photo.src);
    console.log('[分析] Canvas 信号:', photo.name, canvasSignals);
  } catch (e) {
    console.warn('[分析] Canvas 失败:', photo.name, e.message);
  }

  // 将照片转为 base64（压缩到最大 800px，控制大小）
  let imageBase64 = null;
  try {
    imageBase64 = await compressPhotoToBase64(photo.src, 800);
    console.log('[分析] 图片base64大小:', photo.name, Math.round(imageBase64.length / 1024) + 'KB');
  } catch (e) {
    console.warn('[分析] 图片转base64失败:', photo.name, e.message);
  }

  // 优先调用后端API（带上 base64 图片 + canvas 信号）
  const apiBase = getApiBase();
  if (apiBase) {
    try {
      const res = await fetch(`${apiBase}/api/analyze-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: photo.name,
          size: photo.size,
          timestamp: photo.date.toISOString(),
          canvas: canvasSignals,
          imageBase64: imageBase64
        })
      });
      const data = await res.json();
      console.log('[分析] 后端返回:', photo.name, {
        intent: data.intent,
        isScreenshot: data.detections?.isScreenshot,
        peopleCount: data.detections?.peopleCount,
        emotion: data.scores?.emotion,
        estimated: data.estimated,
        provider: data.provider
      });
      if (data && data.stars) return normalizeBackendAnalysis(data, photo.name, canvasSignals);
    } catch (e) {
      console.warn('[分析] 后端调用失败:', photo.name, e.message);
    }
  }

  // 本地分析（使用 canvas 信号提升准确度）
  const result = simulateLocalAnalysis(photo.name, canvasSignals);
  console.log('[分析] 本地结果:', photo.name, { intent: result.intent, isScreenshot: result.detections.isScreenshot, emotion: result.scores.emotion, hasCanvas: !!canvasSignals });
  return result;
}

// 将照片压缩为 base64（控制大小，避免请求过大）
async function compressPhotoToBase64(src, maxSize = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('blob:') && !src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      try {
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxSize || h > maxSize) {
          const scale = maxSize / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        // 用 JPEG 压缩，质量 0.7，控制大小
        const base64 = canvas.toDataURL('image/jpeg', 0.7);
        resolve(base64);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

// ==================== Canvas 像素级图像分析 ====================
async function analyzeImageCanvas(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // blob: 和 data: URL 不会有跨域问题，不设 crossOrigin 避免触发 file:// 安全限制
    if (!src.startsWith('blob:') && !src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      try {
        // 缩放到最大 200px 以提升性能
        const maxSide = 200;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxSide || h > maxSide) {
          const scale = maxSide / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        // 尝试读取像素数据，如果被安全策略阻止则降级
        let imgData;
        try {
          imgData = ctx.getImageData(0, 0, w, h);
        } catch (e) {
          // Canvas 被污染（file:// 或跨域），尝试用 willReadFrequently
          const canvas2 = document.createElement('canvas');
          canvas2.width = w;
          canvas2.height = h;
          const ctx2 = canvas2.getContext('2d', { willReadFrequently: true });
          ctx2.drawImage(img, 0, 0, w, h);
          imgData = ctx2.getImageData(0, 0, w, h);
        }
        const signals = computeCanvasSignals(imgData, w, h);
        resolve(signals);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

function computeCanvasSignals(imgData, w, h) {
  const data = imgData.data;
  const totalPixels = w * h;

  // 亮度数组
  const lumas = new Float32Array(totalPixels);
  let sumLuma = 0;
  for (let i = 0; i < totalPixels; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    lumas[i] = luma;
    sumLuma += luma;
  }
  const brightness = sumLuma / totalPixels / 255;

  // 1. 文字密度：分块计算亮度标准差
  const blockSize = 10;
  const blocksX = Math.floor(w / blockSize);
  const blocksY = Math.floor(h / blockSize);
  let highVarBlocks = 0;
  let totalBlocks = 0;
  let uniformBlocks = 0;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const blockLumas = [];
      for (let dy = 0; dy < blockSize; dy++) {
        for (let dx = 0; dx < blockSize; dx++) {
          const px = bx * blockSize + dx;
          const py = by * blockSize + dy;
          blockLumas.push(lumas[py * w + px]);
        }
      }
      const mean = blockLumas.reduce((a, b) => a + b, 0) / blockLumas.length;
      const variance = blockLumas.reduce((a, b) => a + (b - mean) ** 2, 0) / blockLumas.length;
      const stddev = Math.sqrt(variance);
      totalBlocks++;
      if (stddev > 25) highVarBlocks++;       // 高方差 = 文字/图表
      if (stddev < 3) uniformBlocks++;         // 极低方差 = 纯色区域
    }
  }
  const textDensity = totalBlocks > 0 ? highVarBlocks / totalBlocks : 0;
  const uniformRatio = totalBlocks > 0 ? uniformBlocks / totalBlocks : 0;

  // 2. 色彩丰富度：量化后的唯一色彩数
  const colorSet = new Set();
  for (let i = 0; i < totalPixels; i += 3) { // 采样，每3个像素取1个
    const r = data[i * 4] >> 4;   // 量化到16级
    const g = data[i * 4 + 1] >> 4;
    const b = data[i * 4 + 2] >> 4;
    colorSet.add((r << 8) | (g << 4) | b);
  }
  const colorVariety = colorSet.size;

  // 3. 肤色占比（HSV 肤色检测，排除棕色/金色/木质）
  // 旧的 RGB 检测会把棕色木质底座、金色装饰误判为肤色
  // 改用 HSV 色彩空间：真实肤色 H 在 0-50（0-25 偏红，25-50 偏黄），
  // S 在 0.1-0.6，V > 0.2；棕色/金色 H 虽相似但 S 更高、V 更低
  let skinPixels = 0;
  let brownGoldPixels = 0; // 棕色/金色像素（木质、金属装饰）
  for (let i = 0; i < totalPixels; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];

    // 转 HSV
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const v = max / 255;
    const s = max === 0 ? 0 : delta / max;
    let h = 0;
    if (delta !== 0) {
      if (max === r) h = 60 * (((g - b) / delta) % 6);
      else if (max === g) h = 60 * ((b - r) / delta + 2);
      else h = 60 * ((r - g) / delta + 4);
    }
    if (h < 0) h += 360;

    // 真实肤色判定（HSV）：H 0-50, S 0.1-0.6, V > 0.3
    // 关键排除条件：棕色木质（S>0.5 且 V<0.5）、金色装饰（S>0.6 且 H>35）
    const isSkin = h >= 0 && h <= 50 && s >= 0.1 && s <= 0.6 && v >= 0.3 &&
                   // 排除棕色木质：棕色虽然 H 在肤色范围内，但 S 偏高 V 偏低
                   !(s > 0.45 && v < 0.55) &&
                   // 排除深棕色木头
                   !(v < 0.4 && s > 0.3) &&
                   // 排除金色（H>35 且 S>0.5 且 V>0.6 是金色不是肤色）
                   !(h > 35 && s > 0.5 && v > 0.6);

    if (isSkin) {
      skinPixels++;
    }
    // 统计棕色/金色像素（用于证书检测）
    if ((h >= 20 && h <= 50 && s > 0.4 && v < 0.6) || // 棕色
        (h >= 35 && h <= 60 && s > 0.5 && v > 0.5)) { // 金色
      brownGoldPixels++;
    }
  }
  const skinRatio = skinPixels / totalPixels;
  const brownGoldRatio = brownGoldPixels / totalPixels;

  // 4. 清晰度（边缘密度）
  let edgeSum = 0;
  let edgeCount = 0;
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      const idx = y * w + x;
      const gx = Math.abs(lumas[idx + 1] - lumas[idx - 1]);
      const gy = Math.abs(lumas[idx + w] - lumas[idx - w]);
      const edge = Math.sqrt(gx * gx + gy * gy);
      edgeSum += edge;
      edgeCount++;
    }
  }
  const avgEdge = edgeCount > 0 ? edgeSum / edgeCount : 0;
  const blurScore = Math.min(1, avgEdge / 30);

  // 5. 截图特征分：清晰度高 + 文字密度高 + 纯色区域
  // 截图的本质：数字图像（高清晰度）+ 含大量UI文字 + 无人物
  const clarityBoost = blurScore > 0.85 ? 0.35 : blurScore > 0.7 ? 0.15 : 0;
  const textBoost = textDensity > 0.15 ? 0.35 : textDensity > 0.08 ? 0.2 : 0.05;
  const uniformBoost = Math.min(0.3, uniformRatio * 0.6);
  const screenshotScore = Math.min(1, clarityBoost + textBoost + uniformBoost);

  return {
    textDensity: Math.round(textDensity * 100) / 100,
    colorVariety,
    skinRatio: Math.round(skinRatio * 10000) / 10000,
    brownGoldRatio: Math.round(brownGoldRatio * 10000) / 10000,
    screenshotScore: Math.round(screenshotScore * 100) / 100,
    blurScore: Math.round(blurScore * 100) / 100,
    brightness: Math.round(brightness * 100) / 100,
    uniformRatio: Math.round(uniformRatio * 100) / 100,
    width: imgData.width,
    height: imgData.height
  };
}

function normalizeBackendAnalysis(data, filename, canvasSignals) {
  const intent = data.intent || 'emotion';
  const intentMap = {
    emotion: '情感记忆', info: '信息留存', learning: '知识学习',
    work: '工作沟通', creative: '摄影创作', temp: '临时记录', life: '生活记录'
  };
  const subMap = {
    emotion: '家庭合影', info: '证件档案', learning: '学习资料',
    work: '工作文档', creative: '摄影作品', temp: '临时截图', life: '生活记录'
  };
  const scores = data.scores || {};
  const total = data.total || Math.round(
    (scores.emotion || 50) * 0.25 + (scores.info || 50) * 0.2 + (scores.knowledge || 50) * 0.15 +
    (scores.life || 50) * 0.25 + (scores.future || 50) * 0.15
  );

  // 如果后端返回了视觉模型的分析结果（非估算），直接使用
  const isVisionResult = data.estimated === false && data.detections;

  const cs = canvasSignals || {};
  // 视觉模型结果优先；否则用 canvas 信号降级估算
  const hasText = isVisionResult
    ? data.detections.hasText
    : (cs.textDensity != null ? cs.textDensity > 0.12 : ['info', 'work', 'learning'].includes(intent));
  const peopleCount = isVisionResult
    ? (data.detections.peopleCount || 0)
    : 0;
  const isScreenshot = isVisionResult
    ? data.detections.isScreenshot
    : (cs.textDensity != null
      ? (cs.textDensity > 0.12 && (cs.blurScore || 0.9) > 0.8 && (cs.skinRatio || 0) < 0.05)
      : intent === 'temp');
  const blurScore = isVisionResult
    ? data.detections.blurScore
    : (cs.blurScore != null ? cs.blurScore : (/blur/i.test(filename || '') ? 0.15 : 0.92));

  // 如果后端已经给出了 intentLabel，直接用
  const intentLabel = data.intentLabel || `${intentMap[intent] || '情感记忆'} · ${subMap[intent] || '生活记录'}`;

  return {
    intent,
    intentLabel,
    intentCategory: intentMap[intent] || '情感记忆',
    subCategory: isVisionResult && data.detections.subCategory ? data.detections.subCategory : (subMap[intent] || '生活记录'),
    stars: data.stars || Math.min(5, Math.max(1, Math.round(total / 20))),
    scores,
    avgScore: total,
    suggestion: data.suggestion || '建议归档',
    description: data.description || generateLocalDescription(intent, subMap[intent] || '生活记录', canvasSignals, filename),
    detections: {
      peopleCount,
      hasText,
      isScreenshot,
      location: /travel|beach|sea|mountain|landscape/i.test(filename || '') ? '旅行地' : '本地',
      blurScore
    },
    analysisTime: `${(0.5 + Math.random() * 1.5).toFixed(2)}s`,
    modelVersion: data.modelVersion || (isVisionResult ? 'vision-v1' : 'canvas-signal-v2'),
    estimated: data.estimated !== false  // false = 视觉模型真实分析，true = 估算
  };
}

// 本地生成一句话描述
function generateLocalDescription(intent, subCategory, cs, filename) {
  const name = filename || '';
  const descs = {
    learning: () => {
      let d = '一张知识信息图';
      if (cs && cs.textDensity > 0.4) d += '，包含大量文字和专业内容';
      if (cs && cs.colorVariety > 1000) d += '，色彩丰富';
      return d;
    },
    work: () => '一张工作文档截图，包含工作相关信息',
    info: () => {
      if (cs && (cs.brownGoldRatio || 0) > 0.08) return '一张荣誉证书或奖状，记录了重要的成就时刻';
      return '一张证件或重要信息照片，建议妥善保管';
    },
    emotion: () => {
      const ppl = cs && cs.skinRatio ? Math.min(8, Math.round(cs.skinRatio * 50)) : 1;
      return `一张包含${ppl}位人物的照片，记录了温馨的情感瞬间`;
    },
    creative: () => {
      if (name.includes('food')) return '一张美食照片，记录了生活中的美味时刻';
      return '一张风景或摄影作品，展现了美好的画面';
    },
    temp: () => {
      if (cs && cs.blurScore < 0.3) return '一张模糊不清的照片，建议清理';
      return '一张应用截图，包含界面信息';
    },
    life: () => '一张日常生活的照片'
  };
  return (descs[intent] || descs.life)();
}

function simulateLocalAnalysis(filename, canvasSignals) {
  const name = (filename || '').toLowerCase();
  const cs = canvasSignals || {};
  const hasCanvas = cs.textDensity != null;

  // 文件名规则匹配（作为辅助信号）
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

  // 文件名是否匹配到明确规则
  let nameMatched = null;
  for (const r of rules) {
    if (r.k.some(k => name.includes(k))) { nameMatched = r; break; }
  }

  // 没有 canvas 信号且文件名也没匹配时，默认为 temp（而不是 emotion）
  // 因为大多数未知照片更可能是截图/临时内容，而非情感记忆
  let intent = nameMatched ? nameMatched.i : (hasCanvas ? 'life' : 'temp');
  let subCategory = nameMatched ? nameMatched.s : (hasCanvas ? '生活记录' : '未识别');
  let intentLabel = nameMatched ? nameMatched.l : (hasCanvas ? '生活记录' : '临时记录');

  // 特殊：微信图片/QQ图片/IMG_ 开头的文件名通常是截图或转发图片，默认 temp
  if (!nameMatched && !hasCanvas) {
    if (name.startsWith('微信图片') || name.startsWith('qq图片') || name.startsWith('img_') ||
        name.startsWith('screenshot') || name.startsWith('image') || name.match(/\d{8,}/)) {
      intent = 'temp';
      intentLabel = '临时记录';
      subCategory = '应用截图';
    }
  }

  // Canvas 信号优先：根据像素分析结果重新判定 intent
  if (hasCanvas) {
    const td = cs.textDensity;
    const sr = cs.skinRatio || 0;
    const cv = cs.colorVariety || 0;
    const ss = cs.screenshotScore || 0;
    const bs = cs.blurScore || 0.9;

    // 优先级1：模糊照片 → 临时记录
    if (bs < 0.3) {
      intent = 'temp';
      intentLabel = '临时记录';
      subCategory = '模糊照片';
    }
    // 优先级1.5：证书/奖状（高文字 + 含棕色/金色装饰 + 低真实肤色）→ 信息留存
    // 证书、奖状通常有文字 + 木质底座/金色边框，但没有真实人物
    else if (td > 0.15 && (cs.brownGoldRatio || 0) > 0.08 && sr < 0.06) {
      intent = 'info';
      intentLabel = '信息留存';
      subCategory = '证书奖状';
    }
    // 优先级2：含人物（高肤色 + 低文字）→ 情感记忆
    else if (sr > 0.08 && td < 0.2) {
      intent = 'emotion';
      intentLabel = '情感记忆';
      subCategory = '人物合影';
    }
    // 优先级3：知识信息图（高文字 + 丰富色彩 + 无人物）→ 知识学习
    else if (td > 0.25 && cv > 800 && sr < 0.03) {
      intent = 'learning';
      intentLabel = '知识学习';
      subCategory = '信息图表';
    }
    // 优先级4：截图（高文字 + 高清晰度 + 无人物）→ 临时记录
    else if (td > 0.15 && bs > 0.8 && sr < 0.05) {
      intent = 'temp';
      intentLabel = '临时记录';
      subCategory = '应用截图';
    }
    // 优先级5：工作文档（中等文字 + 截图特征）→ 工作沟通
    else if (td > 0.1 && ss > 0.5 && sr < 0.03) {
      intent = 'work';
      intentLabel = '工作沟通';
      subCategory = '文档截图';
    }
    // 优先级6：风景摄影（低文字 + 低肤色 + 低色彩）→ 摄影创作
    else if (td < 0.08 && sr < 0.02 && cv < 300) {
      intent = 'creative';
      intentLabel = '摄影创作';
      subCategory = '风景摄影';
    }
    // 优先级7：其余含人物的 → 情感记忆
    else if (sr > 0.03) {
      intent = 'emotion';
      intentLabel = '情感记忆';
      subCategory = '人物合影';
    }
  }

  // 根据真实 canvas 信号计算五维评分
  const scores = computeScoresFromSignals(intent, cs);

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

  // 检测结果：canvas 信号优先，无信号时不猜测
  const hasText = cs.textDensity != null ? cs.textDensity > 0.12 : ['info','work','learning'].includes(intent);
  // 人数估算：更保守
  const peopleCount = cs.skinRatio != null
    ? (cs.skinRatio > 0.08 ? Math.min(5, Math.floor((cs.skinRatio - 0.05) / 0.04) + 1) : 0)
    : 0;  // 无 canvas 信号时不猜测人数
  // 截图检测：高清晰度 + 高文字密度 + 无人物 = 截图
  const isScreenshot = cs.textDensity != null
    ? (cs.textDensity > 0.12 && (cs.blurScore || 0.9) > 0.8 && (cs.skinRatio || 0) < 0.05)
    : (intent === 'temp');  // 无 canvas 信号时，temp intent 也算截图
  const blurScore = cs.blurScore != null ? cs.blurScore : (name.includes('blur') ? 0.15 : null);

  return {
    intent,
    intentLabel: `${intentLabel} · ${subCategory}`,
    intentCategory: intentLabel,
    subCategory,
    stars,
    scores,
    avgScore: Math.round(avg),
    suggestion: suggestions[intent],
    description: generateLocalDescription(intent, subCategory, canvasSignals, filename),
    detections: {
      peopleCount,
      hasText,
      isScreenshot,
      location: name.includes('travel') || name.includes('beach') ? '三亚' : '本地',
      blurScore: blurScore != null ? blurScore : 0.9
    },
    analysisTime: `${(0.5+Math.random()*1.5).toFixed(2)}s`,
    modelVersion: hasCanvas ? 'canvas-signal-v2' : 'filename-only-v2'
  };
}

// 根据 canvas 信号 + intent 计算五维评分
function computeScoresFromSignals(intent, cs) {
  const td = cs.textDensity != null ? cs.textDensity : 0.1;   // textDensity
  const cv = cs.colorVariety != null ? cs.colorVariety : 500; // colorVariety
  const sr = cs.skinRatio != null ? cs.skinRatio : 0;         // skinRatio
  const ss = cs.screenshotScore != null ? cs.screenshotScore : 0.2;
  const bs = cs.blurScore != null ? cs.blurScore : 0.9;       // blurScore

  // 基础分由 canvas 信号驱动
  let emotion, info, knowledge, life, future;

  switch (intent) {
    case 'learning':
      // 知识学习：信息高、知识高、情感低
      info    = clamp(Math.round(60 + td * 35 + Math.min(20, cv / 100)));
      knowledge = clamp(Math.round(65 + td * 30 + Math.min(15, cv / 120)));
      emotion = clamp(Math.round(15 + sr * 100 - td * 10));
      life    = clamp(Math.round(30 + sr * 30));
      future  = clamp(Math.round(70 + td * 20));
      break;
    case 'work':
      // 工作文档：信息高、知识中、情感低
      info    = clamp(Math.round(65 + td * 30 + ss * 10));
      knowledge = clamp(Math.round(45 + td * 25));
      emotion = clamp(Math.round(15 + sr * 80));
      life    = clamp(Math.round(25 + ss * 20));
      future  = clamp(Math.round(55 + td * 20));
      break;
    case 'info':
      // 信息留存/证书奖状：信息极高、未来高，情感适当（荣誉感）
      info    = clamp(Math.round(75 + td * 20 + ss * 10));
      knowledge = clamp(Math.round(30 + td * 20));
      emotion = clamp(Math.round(45 + sr * 30));  // 证书有荣誉感，情感适当高
      life    = clamp(Math.round(70 + ss * 15));  // 人生价值高（里程碑）
      future  = clamp(Math.round(75 + td * 15));
      break;
    case 'emotion':
      // 情感记忆：情感高、人生高
      emotion = clamp(Math.round(60 + sr * 40 + (1 - td) * 15));
      info    = clamp(Math.round(20 + td * 25));
      knowledge = clamp(Math.round(10 + td * 20));
      life    = clamp(Math.round(70 + sr * 25));
      future  = clamp(Math.round(45 + sr * 30));
      break;
    case 'creative':
      // 摄影创作：人生中、情感低
      emotion = clamp(Math.round(20 + sr * 30));
      info    = clamp(Math.round(15 + td * 15));
      knowledge = clamp(Math.round(10 + td * 15));
      life    = clamp(Math.round(45 + (1 - ss) * 20));
      future  = clamp(Math.round(30 + cv / 50));
      break;
    case 'temp':
      // 临时记录/截图：全部偏低，情感极低
      emotion = clamp(Math.round(5 + sr * 15));
      info    = clamp(Math.round(20 + td * 20));
      knowledge = clamp(Math.round(5 + td * 10));
      life    = clamp(Math.round(8 + ss * 12));
      future  = clamp(Math.round(5 + td * 8));
      break;
    default:
      // 生活记录：情感低（不是人物照就没有情感价值）
      emotion = clamp(Math.round(15 + sr * 40));
      info    = clamp(Math.round(25 + td * 20));
      knowledge = clamp(Math.round(15 + td * 20));
      life    = clamp(Math.round(25 + sr * 25));
      future  = clamp(Math.round(20 + td * 15));
  }

  // 模糊照片降低所有分数
  if (bs < 0.3) {
    emotion = clamp(emotion - 30);
    info = clamp(info - 20);
    knowledge = clamp(knowledge - 25);
    life = clamp(life - 35);
    future = clamp(future - 30);
  }

  return { emotion, info, knowledge, life, future };
}

function getFallbackAnalysis(filename) {
  return simulateLocalAnalysis(filename);
}

function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ==================== 照片删除与回收站 ====================
function deletePhoto(photoId) {
  const idx = realPhotos.findIndex(p => p.id === photoId);
  if (idx === -1) return;
  const photo = realPhotos[idx];

  // 弹出确认
  if (!confirm(`确定要删除「${photo.name}」吗？\n删除后可在回收站恢复。`)) return;

  // 移入回收站
  photo.deletedAt = new Date().toISOString();
  recycleBin.push(photo);
  saveRecycleBin();

  realPhotos.splice(idx, 1);
  savePhotosToStorage();
  updateImportCount();
  renderRealPhotoGrid();
  closePhotoModal();
  showToast(`已移入回收站：「${photo.name}」`);
}

// 批量删除低分照片（中确定性）
function deleteLowScorePhotos() {
  const lowScorePhotos = realPhotos.filter(p => {
    if (!p.analyzed || !p.analysis) return false;
    const a = p.analysis;
    if (a.intent === 'temp') return true;
    if (['emotion', 'info', 'learning'].includes(a.intent)) return false;
    return a.avgScore < 30;
  });
  if (lowScorePhotos.length === 0) {
    showToast('没有需要清理的低分照片');
    return;
  }
  if (!confirm(`确定要将 ${lowScorePhotos.length} 张低分照片移入回收站吗？\n可在回收站恢复。`)) return;

  lowScorePhotos.forEach(photo => {
    photo.deletedAt = new Date().toISOString();
    recycleBin.push(photo);
    const idx = realPhotos.findIndex(p => p.id === photo.id);
    if (idx !== -1) realPhotos.splice(idx, 1);
  });

  saveRecycleBin();
  savePhotosToStorage();
  updateImportCount();
  renderRealPhotoGrid();
  showToast(`已将 ${lowScorePhotos.length} 张照片移入回收站`);
}

// 从回收站恢复
function restoreFromRecycleBin(photoId) {
  const idx = recycleBin.findIndex(p => p.id === photoId);
  if (idx === -1) return;
  const photo = recycleBin[idx];
  delete photo.deletedAt;
  realPhotos.push(photo);
  recycleBin.splice(idx, 1);
  saveRecycleBin();
  savePhotosToStorage();
  updateImportCount();
  renderRealPhotoGrid();
  showToast(`已恢复：「${photo.name}」`);
}

// 彻底删除
function permanentlyDelete(photoId) {
  const idx = recycleBin.findIndex(p => p.id === photoId);
  if (idx === -1) return;
  const photo = recycleBin[idx];
  if (!confirm(`确定要彻底删除「${photo.name}」吗？\n此操作不可恢复！`)) return;
  recycleBin.splice(idx, 1);
  saveRecycleBin();
  showToast(`已彻底删除：「${photo.name}」`);
}

// 清空回收站
function emptyRecycleBin() {
  if (recycleBin.length === 0) {
    showToast('回收站为空');
    return;
  }
  if (!confirm(`确定要清空回收站吗？\n${recycleBin.length} 张照片将被彻底删除，不可恢复！`)) return;
  recycleBin = [];
  saveRecycleBin();
  showToast('回收站已清空');
}

function saveRecycleBin() {
  try {
    localStorage.setItem('lifeArchiveRecycleBin', JSON.stringify(recycleBin.map(p => ({
      id: p.id, name: p.name, date: p.date, size: p.size,
      analysis: p.analysis, analyzed: p.analyzed, deletedAt: p.deletedAt
    }))));
  } catch (e) { console.error('保存回收站失败', e); }
}

// 长按删除
let longPressTimer = null;
function onPhotoLongPress(photoId) {
  longPressTimer = setTimeout(() => {
    if (navigator.vibrate) navigator.vibrate(50);
    deletePhoto(photoId);
  }, 600);
}
function onPhotoLongPressEnd() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
}

// ==================== 真实照片详情弹窗 ====================
let currentPhotoId = null;

function showRealPhotoDetail(photoId) {
  const photo = realPhotos.find(p => p.id === photoId);
  if (!photo) return;
  currentPhotoId = photoId;

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

  // 显示估算标记（视觉模型分析 vs 估算）
  const estEl = document.getElementById('modalEstimated');
  if (estEl) estEl.style.display = a.estimated ? 'inline' : 'none';

  // AI 描述
  const descEl = document.getElementById('modalDescription');
  if (descEl) descEl.textContent = a.description || '暂无描述';

  const d = a.detections;
  const detectionText = `含${d.peopleCount}人 · ${d.hasText ? '含文字' : '无文字'} · ${d.isScreenshot ? '截图' : '非截图'} · GPS: ${d.location} · 清晰度: ${Math.round(d.blurScore * 100)}%`;
  const detEl = document.getElementById('modalDetections');
  if (detEl) detEl.textContent = detectionText;

  const sugEl = document.getElementById('modalSuggestion');
  if (sugEl) sugEl.textContent = a.suggestion;

  const pm = document.getElementById('photoModal');
  pm.style.display = 'flex';
  pm.style.pointerEvents = 'auto';
  pm.classList.add('active');
  document.body.style.overflow = 'hidden';

  // 更新导航按钮状态
  updatePhotoNavButtons();
}

// 导航到前一张照片
function prevPhoto() {
  const idx = realPhotos.findIndex(p => p.id === currentPhotoId);
  if (idx <= 0) {
    showToast('已是第一张');
    return;
  }
  showRealPhotoDetail(realPhotos[idx - 1].id);
}

// 导航到后一张照片
function nextPhoto() {
  const idx = realPhotos.findIndex(p => p.id === currentPhotoId);
  if (idx >= realPhotos.length - 1) {
    showToast('已是最后一张');
    return;
  }
  showRealPhotoDetail(realPhotos[idx + 1].id);
}

// 更新导航按钮状态
function updatePhotoNavButtons() {
  const idx = realPhotos.findIndex(p => p.id === currentPhotoId);
  const prevBtn = document.getElementById('photoNavPrev');
  const nextBtn = document.getElementById('photoNavNext');
  const counter = document.getElementById('photoNavCounter');

  if (prevBtn) prevBtn.style.opacity = idx <= 0 ? '0.3' : '1';
  if (nextBtn) nextBtn.style.opacity = idx >= realPhotos.length - 1 ? '0.3' : '1';
  if (counter) counter.textContent = `${idx + 1} / ${realPhotos.length}`;
}

// ==================== 照片详情触摸滑动 ====================
let touchStartX = 0;
let touchEndX = 0;

function initPhotoModalSwipe() {
  const pm = document.getElementById('photoModal');
  if (!pm) return;

  pm.addEventListener('touchstart', function(e) {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  pm.addEventListener('touchend', function(e) {
    touchEndX = e.changedTouches[0].screenX;
    handlePhotoSwipe();
  }, { passive: true });
}

function handlePhotoSwipe() {
  const diff = touchEndX - touchStartX;
  if (Math.abs(diff) < 50) return; // 滑动距离太短，忽略

  if (diff > 0) {
    prevPhoto(); // 向右滑，看前一张
  } else {
    nextPhoto(); // 向左滑，看后一张
  }
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
      'home': { id: 'pageHome', title: 'AI人生档案馆', sub: '照片不上传云端 · AI视觉分析', navIdx: 0 },
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

    // 导航到各页面时刷新对应内容
    if (page === 'categories') renderCategoriesPage();
    if (page === 'timeline') { renderTimelinePage(); renderTimelineMemoirCard(); }
    if (page === 'clean') renderCleanPage();
    if (page === 'vault') renderVaultPage();
    if (page === 'home') { renderHomeTimelineCard(); renderHomeVaultCard(); }
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

  const grid = document.getElementById('photoListGrid');
  if (!grid) return;
  const titleEl = document.getElementById('photoListTitle');

  let filtered;
  if (intent === 'all') {
    filtered = realPhotos.filter(p => p.analyzed);
    if (titleEl) titleEl.textContent = `全部照片 · ${filtered.length}张`;
  } else {
    filtered = realPhotos.filter(p => p.analyzed && p.analysis && normalizeIntent(p.analysis.intent) === intent);
    const names = { emotion: '情感记忆', info: '信息留存', learning: '知识学习', work: '工作沟通', creative: '摄影创作', temp: '临时记录', life: '生活记录' };
    if (titleEl) titleEl.textContent = `${names[intent] || intent} · ${filtered.length}张`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px">该分类暂无照片</div>';
  } else {
    grid.innerHTML = filtered.map(p => `
      <div class="photo-item" onclick="showRealPhotoDetail('${p.id}')" style="cursor:pointer">
        <img src="${p.src}" alt="${p.name}">
        <span class="photo-star">${'⭐'.repeat(p.analysis?.stars || 1)}</span>
      </div>
    `).join('');
  }
}

function filterByStar(star, el) {
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');

  const grid = document.getElementById('photoListGrid');
  if (!grid) return;
  const titleEl = document.getElementById('photoListTitle');

  // 仅在当前所在分类内筛选
  const inCategory = realPhotos.filter(p => p.analyzed && p.analysis && currentCategoryIntent && normalizeIntent(p.analysis.intent) === currentCategoryIntent);

  let filtered;
  const titles = { emotion: '情感记忆', info: '信息留存', learning: '知识学习', work: '工作沟通', creative: '摄影创作', temp: '临时记录', life: '生活记录' };
  const baseName = titles[currentCategoryIntent] || '照片';
  if (star === 'all') {
    filtered = inCategory;
    if (titleEl) titleEl.textContent = `${baseName} · ${filtered.length}张`;
  } else {
    filtered = inCategory.filter(p => p.analysis?.stars === parseInt(star));
    if (titleEl) titleEl.textContent = `${baseName} · ${star}星 · ${filtered.length}张`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px">暂无照片</div>';
  } else {
    grid.innerHTML = filtered.map(p => `
      <div class="photo-item" onclick="showRealPhotoDetail('${p.id}')" style="cursor:pointer">
        <img src="${p.src}" alt="${p.name}">
        <span class="photo-star">${'⭐'.repeat(p.analysis?.stars || 1)}</span>
      </div>
    `).join('');
  }
}

function showCategoryPhotos(intent) {
  // 记录当前所在分类，供星级筛选使用
  currentCategoryIntent = intent;

  const titles = { emotion: '情感记忆', info: '信息留存', learning: '知识学习', work: '工作沟通', creative: '摄影创作', temp: '临时记录', life: '生活记录' };
  const filtered = realPhotos.filter(p => p.analyzed && p.analysis && normalizeIntent(p.analysis.intent) === intent);
  const grid = document.getElementById('photoListGrid');
  document.getElementById('photoListTitle').textContent = `${titles[intent] || '照片'} · ${filtered.length}张`;

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px">该分类暂无照片</div>';
  } else {
    grid.innerHTML = filtered.map(p => `
      <div class="photo-item" onclick="showRealPhotoDetail('${p.id}')" style="cursor:pointer">
        <img src="${p.src}" alt="${p.name}">
        <span class="photo-star">${'⭐'.repeat(p.analysis?.stars || 1)}</span>
      </div>
    `).join('');
  }

  // 显示星级筛选栏，并默认选中"全部"
  const starBar = document.getElementById('starFilterBar');
  if (starBar) {
    starBar.style.display = 'flex';
    starBar.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    const allChip = starBar.querySelector('.chip');
    if (allChip) allChip.classList.add('active');
  }

  document.getElementById('categoryGrid').style.display = 'none';
  document.getElementById('photoList').style.display = 'block';
}

function backToCategories() {
  // 返回分类网格时清空当前分类并隐藏星级筛选栏
  currentCategoryIntent = null;
  const starBar = document.getElementById('starFilterBar');
  if (starBar) {
    starBar.style.display = 'none';
    starBar.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    const allChip = starBar.querySelector('.chip');
    if (allChip) allChip.classList.add('active');
  }
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
            description: p.analysis?.description || '',
            intentLabel: p.analysis?.intentLabel || '',
            tags: p.analysis?.tags || [],
            scores: p.analysis?.scores || {},
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

// ==================== 自传式回忆录生成 ====================
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
  videoScript = null;
  memoirSelectedPhotos.clear();

  ['videoStep1', 'videoStep2', 'videoStep3'].forEach((id, i) => {
    document.getElementById(id).style.display = i === 0 ? 'block' : 'none';
  });

  const loading = document.getElementById('memoirLoading');
  const content = document.getElementById('memoirContent');
  if (loading) loading.style.display = 'none';
  if (content) content.style.display = 'none';

  document.querySelectorAll('.template-card').forEach(c => c.classList.remove('active'));
  const defaultTheme = document.querySelector('.template-card[data-theme="warm"]');
  if (defaultTheme) defaultTheme.classList.add('active');
}

function videoNextStep(step) {
  ['videoStep1', 'videoStep2', 'videoStep3'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById(`videoStep${step}`).style.display = 'block';

  if (step === 2) {
    renderMemoirPhotoSelector();
  }
  if (step === 3) {
    generateMemoir();
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

// 回忆录照片选择
let memoirSelectedPhotos = new Set();

function renderMemoirPhotoSelector() {
  const container = document.getElementById('memoirPhotoSelector');
  if (!container) return;

  if (realPhotos.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">请先导入照片</div>';
    updateSelectedCount();
    return;
  }

  // 按时间排序
  const sorted = [...realPhotos].sort((a, b) => new Date(a.date) - new Date(b.date));

  container.innerHTML = sorted.map(p => {
    const checked = memoirSelectedPhotos.has(p.id);
    const a = p.analysis || {};
    const intentLabel = a.intentLabel || '未分析';
    const stars = a.stars ? `${a.stars}★` : '';
    const desc = a.description || '';
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--rule);cursor:pointer" onclick="toggleMemoirPhoto('${p.id}')">
        <div style="width:20px;height:20px;border-radius:4px;border:2px solid ${checked ? 'var(--accent)' : 'var(--rule)'};background:${checked ? 'var(--accent)' : 'transparent'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${checked ? '<span style="color:#fff;font-size:12px">✓</span>' : ''}
        </div>
        <img src="${p.src}" style="width:48px;height:48px;border-radius:var(--radius-sm);object-fit:cover;flex-shrink:0">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
          <div style="font-size:11px;color:var(--muted)">${intentLabel} ${stars}</div>
          ${desc ? `<div style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${desc}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  updateSelectedCount();
}

function toggleMemoirPhoto(photoId) {
  if (memoirSelectedPhotos.has(photoId)) {
    memoirSelectedPhotos.delete(photoId);
  } else {
    if (memoirSelectedPhotos.size >= 9) {
      showToast('单次回忆录最多选择9张照片');
      return;
    }
    memoirSelectedPhotos.add(photoId);
  }
  renderMemoirPhotoSelector();
}

function selectAllMemoirPhotos(selectAll) {
  if (selectAll) {
    realPhotos.forEach(p => memoirSelectedPhotos.add(p.id));
  } else {
    memoirSelectedPhotos.clear();
  }
  renderMemoirPhotoSelector();
}

function updateSelectedCount() {
  const el = document.getElementById('selectedPhotoCount');
  if (el) el.textContent = memoirSelectedPhotos.size;
}

function getSelectedMemoirPhotos() {
  return realPhotos.filter(p => memoirSelectedPhotos.has(p.id))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// 生成自传
async function generateMemoir() {
  const loading = document.getElementById('memoirLoading');
  const content = document.getElementById('memoirContent');
  const loadingText = document.getElementById('memoirLoadingText');

  let photos = getSelectedMemoirPhotos();
  if (photos.length === 0) {
    showToast('请至少勾选一张照片');
    videoPrevStep(2);
    return;
  }

  if (loading) loading.style.display = 'flex';
  if (content) content.style.display = 'none';

  // 最多9张
  photos = photos.slice(0, 9);

  // 构建发给后端的照片数据（含完整分析信息）
  const photoData = photos.map(p => ({
    title: p.name || '美好瞬间',
    date: p.date ? (typeof p.date === 'string' ? p.date : p.date.toISOString().split('T')[0]) : '',
    description: p.analysis?.description || '',
    naturalLanguageDesc: p.analysis?.description || '',
    intent: p.analysis?.intentLabel || '',
    intentLabel: p.analysis?.intentLabel || '',
    scores: p.analysis?.scores || {}
  }));

  if (loadingText) loadingText.textContent = `AI 正在根据 ${photos.length} 张照片撰写自传故事...`;

  try {
    const apiBase = getApiBase();
    if (apiBase) {
      const res = await fetch(`${apiBase}/api/generate-memoir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: photoData, theme: videoTheme })
      });
      const data = await res.json();
      videoScript = data;
    }

    if (!videoScript || !videoScript.chapters) {
      videoScript = generateFallbackMemoirLocal(photoData, videoTheme);
    }

    renderMemoir(videoScript, photos);
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';
  } catch (err) {
    console.error('generateMemoir error:', err);
    videoScript = generateFallbackMemoirLocal(photoData, videoTheme);
    renderMemoir(videoScript, photos);
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';
    showToast('AI 生成失败，已使用本地模板');
  }
}

function generateFallbackMemoirLocal(photos, theme) {
  const titles = {
    warm: '温暖岁月：我的家庭记忆',
    travel: '在路上：我的旅行故事',
    growth: '成长之路：每一步都算数',
    year: '这一年：我的年度回忆'
  };
  const openings = {
    warm: '翻开这些照片，那些温暖的瞬间扑面而来。家庭是我最坚实的港湾。',
    travel: '每次出发，都是一次与自己对话的旅程。这些照片，是路上的风景，也是内心的印记。',
    growth: '成长不是一瞬间的事，而是无数个平凡日子的累积。这些照片记录了我的蜕变。',
    year: '这一年过得很快，但回头看，原来经历了这么多值得记住的时刻。'
  };
  const endings = {
    warm: '家是永远的归宿。这些照片，是我最珍贵的家庭记忆。',
    travel: '旅途永无止境，但每一段路都值得被记住。',
    growth: '成长还在继续，未来的每一步，我都想好好记录。',
    year: '感谢这一年的所有经历，期待下一个精彩的365天。'
  };

  const chapters = photos.slice(0, 10).map((p, i) => ({
    photoIndex: i + 1,
    story: `那是${p.date || '某天'}的事。${p.description || p.title || '这张照片'}定格了一个值得回味的瞬间。现在翻看起来，当时的场景依然历历在目——那些平凡却真实的日子，正是人生最珍贵的部分。`
  }));

  return {
    title: titles[theme] || titles.warm,
    opening: openings[theme] || openings.warm,
    chapters,
    ending: endings[theme] || endings.warm
  };
}

// 渲染自传内容
function renderMemoir(memoir, photos) {
  const titleEl = document.getElementById('memoirTitle');
  const openingEl = document.getElementById('memoirOpening');
  const endingEl = document.getElementById('memoirEnding');
  const chaptersEl = document.getElementById('memoirChapters');

  if (titleEl) titleEl.value = memoir.title || '我的回忆录';
  if (openingEl) openingEl.value = memoir.opening || '';
  if (endingEl) endingEl.value = memoir.ending || '';

  if (chaptersEl) {
    chaptersEl.innerHTML = (memoir.chapters || []).map((ch, i) => {
      const photo = photos[ch.photoIndex - 1] || photos[i];
      const photoSrc = photo?.src || '';
      const photoName = photo?.name || `照片${ch.photoIndex}`;
      const date = photo?.date ? (typeof photo.date === 'string' ? photo.date : photo.date.toISOString().split('T')[0]) : '';

      return `
        <div style="background:var(--bg2);border:1px solid var(--rule);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            ${photoSrc ? `<img src="${photoSrc}" style="width:48px;height:48px;border-radius:var(--radius-sm);object-fit:cover">` : ''}
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--ink)">${photoName}</div>
              <div style="font-size:11px;color:var(--muted)">${date}</div>
            </div>
          </div>
          <textarea id="chapter_${i}" style="width:100%;min-height:100px;background:transparent;border:none;color:var(--ink);font-size:14px;line-height:1.7;resize:vertical" placeholder="AI 撰写的故事...">${ch.story || ''}</textarea>
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn btn-outline" style="min-height:36px;font-size:12px;padding:4px 12px" onclick="voiceInputStory(${i})">🎙️ 语音录入</button>
          </div>
        </div>
      `;
    }).join('');
  }
}

// 语音录入故事
let recognition = null;
function voiceInputStory(chapterIndex) {
  const textarea = document.getElementById(`chapter_${chapterIndex}`);
  if (!textarea) return;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showToast('当前浏览器不支持语音识别，请使用 Chrome');
    return;
  }

  if (recognition) {
    recognition.stop();
    recognition = null;
    showToast('已停止语音录入');
    return;
  }

  recognition = new SR();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => showToast('开始语音录入，请讲述...');
  recognition.onresult = (event) => {
    let final = '';
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += transcript;
      else interim += transcript;
    }
    if (final) {
      const cur = textarea.value;
      textarea.value = cur + (cur && !cur.endsWith('。') ? '。' : '') + final;
    }
  };
  recognition.onerror = (e) => {
    showToast('语音识别出错: ' + e.error);
    recognition = null;
  };
  recognition.onend = () => {
    recognition = null;
    showToast('语音录入结束');
  };

  recognition.start();
}

// 朗读故事
function readStory(chapterIndex) {
  const textarea = document.getElementById(`chapter_${chapterIndex}`);
  if (!textarea || !textarea.value) {
    showToast('暂无内容可朗读');
    return;
  }

  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(textarea.value);
    utter.lang = 'zh-CN';
    utter.rate = 0.9;
    speechSynthesis.speak(utter);
    showToast('开始朗读');
  } else {
    showToast('当前浏览器不支持语音合成');
  }
}

// 导出自传
function exportMemoir() {
  const title = document.getElementById('memoirTitle')?.value || '我的回忆录';
  const opening = document.getElementById('memoirOpening')?.value || '';
  const ending = document.getElementById('memoirEnding')?.value || '';

  const chapters = (videoScript?.chapters || []).map((ch, i) => {
    const el = document.getElementById(`chapter_${i}`);
    return el ? el.value : (ch.story || '');
  });

  let text = `${title}\n\n${opening}\n\n`;
  chapters.forEach((story, i) => {
    text += `--- 第${i + 1}章 ---\n${story}\n\n`;
  });
  text += `${ending}\n`;

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('自传已导出');
}

// 重新生成
function regenerateMemoir() {
  videoScript = null;
  generateMemoir();
}

// ==================== 回忆录保存与管理 ====================
// 保存回忆录到 localStorage
let savedMemoirs = [];

function saveMemoir() {
  const title = document.getElementById('memoirTitle')?.value || '我的回忆录';
  const opening = document.getElementById('memoirOpening')?.value || '';
  const ending = document.getElementById('memoirEnding')?.value || '';

  const chapters = (videoScript?.chapters || []).map((ch, i) => {
    const el = document.getElementById(`chapter_${i}`);
    const photo = getSelectedMemoirPhotos()[ch.photoIndex - 1] || getSelectedMemoirPhotos()[i];
    return {
      photoIndex: ch.photoIndex,
      story: el ? el.value : (ch.story || ''),
      photoName: photo?.name || '',
      photoSrc: photo?.src || '',
      photoDate: photo?.date ? (typeof photo.date === 'string' ? photo.date : photo.date.toISOString().split('T')[0]) : ''
    };
  });

  const memoir = {
    id: 'memoir_' + Date.now(),
    title,
    opening,
    ending,
    chapters,
    theme: videoTheme,
    createdAt: new Date().toISOString(),
    photoCount: getSelectedMemoirPhotos().length
  };

  savedMemoirs.push(memoir);
  try {
    // 注意：photoSrc 是 blob URL，刷新后失效，所以不保存 src
    const toSave = savedMemoirs.map(m => ({
      ...m,
      chapters: m.chapters.map(ch => ({ ...ch, photoSrc: '' })) // 不保存 blob URL
    }));
    localStorage.setItem('lifeArchiveMemoirs', JSON.stringify(toSave));
  } catch(e) { console.error('保存回忆录失败', e); }

  showToast('回忆录已保存！可在时间轴页面查看');
  renderTimelineMemoirCard();
  syncUserToBackend();
}

// 加载已保存的回忆录
function loadSavedMemoirs() {
  try {
    const data = localStorage.getItem('lifeArchiveMemoirs');
    if (data) savedMemoirs = JSON.parse(data);
  } catch(e) { savedMemoirs = []; }
}

// 在时间轴页面渲染回忆录卡片
function renderTimelineMemoirCard() {
  let container = document.getElementById('timelineMemoirSection');
  if (!container) return;

  if (savedMemoirs.length === 0) {
    container.innerHTML = '';
    return;
  }

  let html = '<div class="card" style="margin-bottom:16px"><div class="card-title" style="margin-bottom:12px"><span class="icon">📖</span>我的回忆录</div>';
  html += '<div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:8px">';

  savedMemoirs.forEach(m => {
    const date = new Date(m.createdAt).toLocaleDateString('zh-CN');
    const preview = m.chapters[0]?.story?.substring(0, 40) || '';
    html += `
      <div style="min-width:160px;background:var(--bg2);border:1px solid var(--rule);border-radius:var(--radius-sm);padding:12px;cursor:pointer" onclick="viewMemoirDetail('${m.id}')">
        <div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.title}</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:6px">${date} · ${m.photoCount}张照片</div>
        <div style="font-size:11px;color:var(--muted);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${preview}...</div>
      </div>
    `;
  });

  html += '</div>';
  html += `<button class="btn btn-primary" style="width:100%;margin-top:10px;min-height:44px" onclick="generateAutobiography()">📚 生成个人自传（合并${savedMemoirs.length}篇回忆录）</button>`;
  html += '</div>';

  container.innerHTML = html;
}

// 查看回忆录详情（图文结合）
function viewMemoirDetail(memoirId) {
  const memoir = savedMemoirs.find(m => m.id === memoirId);
  if (!memoir) return;

  const existing = document.getElementById('memoirViewerModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'memoirViewerModal';
  modal.className = 'modal-overlay active';
  modal.style.cssText = 'display:flex;pointer-events:auto;z-index:1001';

  let chaptersHtml = (memoir.chapters || []).map((ch, i) => {
    // 尝试从 realPhotos 找到对应照片的 src
    const photo = realPhotos.find(p => p.name === ch.photoName);
    const photoSrc = photo?.src || ch.photoSrc || '';
    return `
      <div style="background:var(--bg2);border:1px solid var(--rule);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
        ${photoSrc ? `<img src="${photoSrc}" style="width:100%;max-height:200px;object-fit:cover;border-radius:var(--radius-sm);margin-bottom:8px">` : ''}
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">📷 ${ch.photoName || '照片' + (i+1)} · ${ch.photoDate || ''}</div>
        <div style="font-size:14px;line-height:1.8;color:var(--ink)">${ch.story || ''}</div>
      </div>
    `;
  }).join('');

  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--radius);max-width:600px;width:95%;max-height:85vh;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid var(--rule)">
        <span style="font-size:18px;font-weight:700">${memoir.title}</span>
        <span style="cursor:pointer;font-size:20px" onclick="document.getElementById('memoirViewerModal').remove()">✕</span>
      </div>
      <div style="flex:1;overflow-y:auto;padding:16px">
        ${memoir.opening ? `<div style="font-size:14px;color:var(--muted);line-height:1.8;margin-bottom:16px;font-style:italic">${memoir.opening}</div>` : ''}
        ${chaptersHtml}
        ${memoir.ending ? `<div style="font-size:14px;color:var(--muted);line-height:1.8;margin-top:16px;font-style:italic">${memoir.ending}</div>` : ''}
      </div>
      <div style="padding:12px 16px;border-top:1px solid var(--rule);display:flex;gap:8px">
        <button class="btn btn-outline" style="flex:1;min-height:40px" onclick="deleteMemoir('${memoir.id}')">删除</button>
        <button class="btn btn-primary" style="flex:1;min-height:40px" onclick="exportSingleMemoir('${memoir.id}')">导出</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// 删除回忆录
function deleteMemoir(memoirId) {
  if (!confirm('确定要删除这篇回忆录吗？')) return;
  savedMemoirs = savedMemoirs.filter(m => m.id !== memoirId);
  localStorage.setItem('lifeArchiveMemoirs', JSON.stringify(savedMemoirs.map(m => ({...m, chapters: m.chapters.map(ch => ({...ch, photoSrc: ''}))}))));
  document.getElementById('memoirViewerModal')?.remove();
  renderTimelineMemoirCard();
  showToast('回忆录已删除');
}

// 导出单篇回忆录
function exportSingleMemoir(memoirId) {
  const memoir = savedMemoirs.find(m => m.id === memoirId);
  if (!memoir) return;

  let text = `${memoir.title}\n\n${memoir.opening || ''}\n\n`;
  (memoir.chapters || []).forEach((ch, i) => {
    text += `--- 第${i + 1}章 ${ch.photoName || ''} ---\n${ch.story || ''}\n\n`;
  });
  text += `${memoir.ending || ''}\n`;

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${memoir.title}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('回忆录已导出');
}

// 生成个人自传（合并所有回忆录）
function generateAutobiography() {
  showToast('📚 个人自传功能开发中，敬请期待');
  return;
  // 以下原有代码保留但不执行
  if (savedMemoirs.length === 0) {
    showToast('请先保存至少一篇回忆录');
    return;
  }

  let text = '我的自传\n\n';
  text += `${new Date().toLocaleDateString('zh-CN')} 生成\n\n`;
  text += '——— 开篇 ———\n\n';

  // 使用第一篇回忆录的开场白作为开篇
  if (savedMemoirs[0].opening) {
    text += savedMemoirs[0].opening + '\n\n';
  }

  savedMemoirs.forEach((m, idx) => {
    text += `========== 第${idx + 1}章：${m.title} ==========\n\n`;
    (m.chapters || []).forEach((ch, i) => {
      text += `【${ch.photoName || '照片' + (i+1)}】${ch.photoDate || ''}\n${ch.story || ''}\n\n`;
    });
    if (m.ending && idx === savedMemoirs.length - 1) {
      text += `——— 结语 ———\n\n${m.ending}\n\n`;
    }
  });

  text += `\n——— 全文完 ———\n`;
  text += `共 ${savedMemoirs.length} 篇回忆录，${savedMemoirs.reduce((s, m) => s + (m.chapters?.length || 0), 0)} 个章节\n`;

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `我的自传_${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`个人自传已生成！合并了${savedMemoirs.length}篇回忆录`);
}

function getDemoTimelinePhotos() {
  return [];
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
