/**
 * AI人生档案馆 - 后端代理服务
 * 功能：
 * 1. 图像AI分析（预留阿里云视觉智能接口）
 * 2. AI回忆文案生成（预留通义千问接口）
 * 3. 照片上传与临时存储
 * 4. 健康检查与配置接口
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 上传目录
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer配置
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ==========================================
// 1. 健康检查
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'life-archive-ai-server',
    version: '1.0.0',
    features: ['image-analysis', 'story-generation', 'timeline-video'],
    aiBackend: 'mock-mode',
    note: '当前为演示模式，AI结果由本地算法模拟生成。生产环境可接入阿里云视觉智能 + 通义千问API'
  });
});

// ==========================================
// 2. 图像AI分析（模拟真实AI能力）
// ==========================================
/**
 * 分析逻辑（模拟真实AI pipeline）：
 * 1. 图像标签识别 -> 判断场景类型（人物/风景/文档/食物等）
 * 2. 人脸检测 -> 判断人数
 * 3. 五维价值评分 -> 基于场景类型计算情感/信息/知识/人生/未来值
 * 4. 意图分类 -> 映射到6大人生意图
 * 5. 星级评分 -> 综合计算
 */
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    const { filename, timestamp } = req.body;
    const imageBuffer = req.file ? req.file.buffer : null;

    // 模拟AI分析延迟（真实环境此处调用阿里云视觉智能API）
    await simulateDelay(800 + Math.random() * 1200);

    // 基于文件名/内容特征进行模拟分类（演示用）
    const analysisResult = simulateAIAnalysis(filename, imageBuffer);

    res.json({
      success: true,
      data: analysisResult,
      processingTime: Date.now() - (req.body._startTime || Date.now()),
      aiModel: 'simulated-v1.0 (生产环境: 阿里云视觉智能)'
    });
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 批量分析接口
app.post('/api/analyze-batch', async (req, res) => {
  try {
    const { photos } = req.body; // [{filename, base64}, ...]
    const results = [];

    for (let i = 0; i < photos.length; i++) {
      await simulateDelay(300 + Math.random() * 500);
      const result = simulateAIAnalysis(photos[i].filename || `photo_${i}.jpg`);
      results.push({
        index: i,
        filename: photos[i].filename,
        ...result
      });
    }

    res.json({
      success: true,
      data: results,
      total: results.length,
      aiModel: 'simulated-v1.0 (生产环境: 阿里云视觉智能)'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 3. AI回忆文案生成
// ==========================================
app.post('/api/generate-story', async (req, res) => {
  try {
    const { photos, style = 'warm', length = 'medium' } = req.body;

    // 模拟大模型生成延迟
    await simulateDelay(1500 + Math.random() * 2000);

    const story = generateStoryByPhotos(photos, style, length);

    res.json({
      success: true,
      data: {
        story,
        style,
        wordCount: story.length,
        generatedAt: new Date().toISOString()
      },
      aiModel: 'simulated-qwen (生产环境: 通义千问Qwen-Max)'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 4. 时间轴视频生成状态
// ==========================================
app.post('/api/timeline-video', async (req, res) => {
  try {
    const { photos, music, duration = 15 } = req.body;

    // 模拟视频生成 pipeline
    await simulateDelay(2000);

    res.json({
      success: true,
      data: {
        status: 'completed',
        videoUrl: null, // 真实环境返回视频URL
        frames: photos.length,
        duration,
        message: '时间轴视频已生成（演示模式：视频生成在前端Canvas完成）',
        frontendMode: true
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 5. 系统配置接口（供前端查询AI能力）
// ==========================================
app.get('/api/config', (req, res) => {
  res.json({
    aiEnabled: true,
    localAI: true,  // TensorFlow.js本地运行
    cloudAI: false, // 云端API（需配置AK/SK）
    features: {
      imageClassification: true,
      faceDetection: true,
      ocr: true,
      storyGeneration: true,
      timelineVideo: true
    },
    models: {
      classification: 'MobileNet-v3 (TensorFlow.js)',
      faceDetection: 'BlazeFace (TensorFlow.js)',
      story: 'Qwen-Max (via API)',
      ocr: 'PaddleOCR-lite'
    }
  });
});

// ==========================================
// 辅助函数
// ==========================================

function simulateDelay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function simulateAIAnalysis(filename, buffer) {
  // 基于文件名关键词进行智能分类（模拟真实AI识别结果）
  const name = (filename || '').toLowerCase();

  // 意图映射规则
  const intentRules = [
    { keywords: ['family', 'people', 'group', 'birthday', 'wedding', 'party', 'gathering'], intent: 'emotion', intentLabel: '情感记忆', subLabel: '家庭合影' },
    { keywords: ['child', 'baby', 'kid', 'growth', 'son', 'daughter'], intent: 'emotion', intentLabel: '情感记忆', subLabel: '成长记录' },
    { keywords: ['travel', 'landscape', 'scenery', 'mountain', 'sea', 'beach', 'sunset'], intent: 'creative', intentLabel: '摄影创作', subLabel: '风景摄影' },
    { keywords: ['food', 'meal', 'dinner', 'lunch', 'cafe', 'restaurant'], intent: 'creative', intentLabel: '摄影创作', subLabel: '美食记录' },
    { keywords: ['id', 'card', 'passport', 'license', 'certificate', 'document'], intent: 'info', intentLabel: '信息留存', subLabel: '证件档案' },
    { keywords: ['work', 'office', 'meeting', 'ppt', 'slide', 'report'], intent: 'work', intentLabel: '工作沟通', subLabel: '工作文档' },
    { keywords: ['course', 'book', 'note', 'study', 'class', 'lecture'], intent: 'learning', intentLabel: '知识学习', subLabel: '学习笔记' },
    { keywords: ['screenshot', 'screen', 'blur', 'tmp', 'temp'], intent: 'temp', intentLabel: '临时记录', subLabel: '临时截图' }
  ];

  let matchedIntent = { intent: 'emotion', intentLabel: '情感记忆', subLabel: '生活记录' };
  for (const rule of intentRules) {
    if (rule.keywords.some(k => name.includes(k))) {
      matchedIntent = rule;
      break;
    }
  }

  // 五维价值评分（基于意图类型计算）
  const scoreMap = {
    emotion: { emotion: 90, info: 15, knowledge: 10, life: 95, future: 60 },
    info:    { emotion: 10, info: 95, knowledge: 15, life: 70, future: 85 },
    learning:{ emotion: 15, info: 65, knowledge: 92, life: 45, future: 88 },
    work:    { emotion: 20, info: 80, knowledge: 70, life: 40, future: 75 },
    creative:{ emotion: 55, info: 20, knowledge: 15, life: 65, future: 50 },
    temp:    { emotion: 15, info: 20, knowledge: 5,  life: 10, future: 8  }
  };

  const baseScores = scoreMap[matchedIntent.intent] || scoreMap.emotion;
  // 添加随机波动（模拟真实AI的不确定性）
  const scores = {
    emotion: clamp(baseScores.emotion + rand(-10, 10)),
    info:    clamp(baseScores.info + rand(-10, 10)),
    knowledge: clamp(baseScores.knowledge + rand(-10, 10)),
    life:    clamp(baseScores.life + rand(-10, 10)),
    future:  clamp(baseScores.future + rand(-10, 10))
  };

  // 综合星级
  const avgScore = (scores.emotion + scores.info + scores.knowledge + scores.life + scores.future) / 5;
  const stars = avgScore >= 85 ? 5 : avgScore >= 70 ? 4 : avgScore >= 55 ? 3 : avgScore >= 40 ? 2 : 1;

  // AI建议
  const suggestions = {
    emotion: '长期归档到人生时间轴',
    info: '存入数字保险柜并设置到期提醒',
    learning: '归档到知识库，关联相关课程',
    work: '按项目归档，保留至项目结束+1年',
    creative: '精选最佳作品入摄影集',
    temp: '建议30天后自动清理'
  };

  // 检测结果
  const hasPeople = matchedIntent.intent === 'emotion' || name.includes('people') || name.includes('group');
  const detections = {
    peopleCount: hasPeople ? Math.floor(Math.random() * 5) + 1 : 0,
    hasText: matchedIntent.intent === 'info' || matchedIntent.intent === 'work' || matchedIntent.intent === 'learning',
    isScreenshot: matchedIntent.intent === 'temp' || name.includes('screenshot'),
    location: name.includes('travel') || name.includes('beach') ? '三亚' : '本地',
    blurScore: name.includes('blur') ? 0.15 : 0.92
  };

  return {
    intent: matchedIntent.intent,
    intentLabel: `${matchedIntent.intentLabel} · ${matchedIntent.subLabel}`,
    intentCategory: matchedIntent.intentLabel,
    subCategory: matchedIntent.subLabel,
    stars,
    scores,
    avgScore: Math.round(avgScore),
    suggestion: suggestions[matchedIntent.intent],
    detections,
    analysisTime: `${(0.5 + Math.random() * 1.5).toFixed(2)}s`,
    modelVersion: 'simulated-v1.0'
  };
}

function generateStoryByPhotos(photos, style, length) {
  const styleMap = {
    warm: '温暖的、怀旧的',
    poetic: '诗意的、抒情的',
    funny: '幽默的、轻松的',
    concise: '简洁的、有力的'
  };

  const templates = {
    warm: [
      '翻开相册，那些定格的瞬间依然鲜活。{count}张照片，串联起一段珍贵的记忆。',
      '时间是最好的滤镜，让这些照片越发动人。每一张背后，都有一个值得珍藏的故事。',
      '这些照片像一串珍珠，串联起生命中最柔软的时光。感谢相机，让我们得以和过去重逢。'
    ],
    poetic: [
      '光影流转，岁月如歌。{count}个瞬间，在快门声中永恒。',
      '照片是时间的琥珀，将散落的时光凝结成诗。',
      '按下快门的刹那，风停了，光驻了，那一刻被永远留住在方寸之间。'
    ],
    funny: [
      '别看我现在一本正经，翻起这些照片可是笑到肚子疼！{count}张黑历史，张张精彩。',
      '摄影师同志，你的拍照技术有待提高啊！不过好在回忆是满分。',
      '这些照片证明了：当时的我们真的以为这样很酷。'
    ],
    concise: [
      '{count}张照片，一段记忆，一生珍藏。',
      '最好的时光，都在这些照片里。',
      '快门之下，皆是人生。'
    ]
  };

  const styleText = styleMap[style] || styleMap.warm;
  const pool = templates[style] || templates.warm;
  const base = pool[Math.floor(Math.random() * pool.length)];

  let story = base.replace('{count}', photos.length);

  // 根据照片内容追加细节
  const intents = [...new Set(photos.map(p => p.intent || 'emotion'))];
  if (intents.includes('emotion')) {
    story += '\n\n那些关于家人的照片，总是让人心头一暖。时间带走了很多，却带不走相片里的笑容。';
  }
  if (intents.includes('travel')) {
    story += '\n\n旅途中的风景或许会被遗忘，但照片帮我们记住了那时的风、那时的阳光，还有那时的心情。';
  }

  // 根据length调整
  if (length === 'short') {
    story = story.split('\n')[0];
  } else if (length === 'long') {
    story += '\n\n人生是一场漫长的旅行，照片是我们的行李。每一次回望，都是为了更好地前行。愿这些被AI珍藏的记忆，在未来的某一天，能带给你同样的温暖和力量。';
  }

  return story;
}

function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ==========================================
// 启动服务器
// ==========================================
app.listen(PORT, () => {
  console.log(`\n🚀 AI人生档案馆 后端服务已启动`);
  console.log(`📡 API地址: http://localhost:${PORT}/api`);
  console.log(`📋 可用接口:`);
  console.log(`   GET  /api/health          - 健康检查`);
  console.log(`   GET  /api/config          - AI能力配置`);
  console.log(`   POST /api/analyze-image   - 单张图片AI分析`);
  console.log(`   POST /api/analyze-batch   - 批量图片AI分析`);
  console.log(`   POST /api/generate-story  - AI生成回忆文案`);
  console.log(`   POST /api/timeline-video  - 时间轴视频生成`);
  console.log(`\n⚠️  当前为演示模式，AI结果由本地算法模拟生成。`);
  console.log(`   生产环境可接入阿里云视觉智能API + 通义千问API。\n`);
});
