/**
 * AI人生档案馆 - 后端代理服务
 * v3.0 真实模型版本
 * 支持：智谱AI / 硅基流动 / 阿里云百炼 / DeepSeek
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 静态资源：开发时直接服务前端
app.use(express.static(path.join(__dirname, 'www')));

const PORT = process.env.PORT || 3001;

// ==================== 健康检查 ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '3.0', time: new Date().toISOString() });
});

// ==================== 配置查询 ====================
app.get('/api/config', (req, res) => {
  const provider = process.env.LLM_PROVIDER || 'zhipu';
  res.json({
    provider,
    hasKey: !!getApiKey(provider),
    providers: ['zhipu', 'siliconflow', 'bailian', 'deepseek'],
    mock: process.env.USE_MOCK_ANALYSIS === 'true'
  });
});

// ==================== 工具函数 ====================
function getApiKey(provider) {
  const map = {
    zhipu: process.env.ZHIPU_API_KEY,
    siliconflow: process.env.SILICONFLOW_API_KEY,
    bailian: process.env.BAILIAN_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY
  };
  return map[provider] || map.zhipu;
}

function getProviderConfig(provider) {
  const configs = {
    zhipu: {
      url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      model: 'glm-4-flash',
      authHeader: key => ({ Authorization: `Bearer ${key}` })
    },
    siliconflow: {
      url: 'https://api.siliconflow.cn/v1/chat/completions',
      model: 'Qwen2.5-7B-Instruct',
      authHeader: key => ({ Authorization: `Bearer ${key}` })
    },
    bailian: {
      url: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
      model: 'qwen-turbo',
      authHeader: key => ({ Authorization: `Bearer ${key}` })
    },
    deepseek: {
      url: 'https://api.deepseek.com/chat/completions',
      model: 'deepseek-chat',
      authHeader: key => ({ Authorization: `Bearer ${key}` })
    }
  };
  return configs[provider] || configs.zhipu;
}

async function callLLM(prompt, provider = 'zhipu') {
  const key = getApiKey(provider);
  if (!key) {
    throw new Error(`未配置 ${provider} 的 API Key`);
  }
  const cfg = getProviderConfig(provider);

  let body;
  if (provider === 'bailian') {
    body = {
      model: cfg.model,
      input: { messages: [{ role: 'user', content: prompt }] }
    };
  } else {
    body = {
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 1024
    };
  }

  const response = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...cfg.authHeader(key)
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM请求失败: ${response.status} ${text}`);
  }

  const data = await response.json();

  if (provider === 'bailian') {
    return data.output?.text || data.output?.choices?.[0]?.message?.content || '';
  }
  return data.choices?.[0]?.message?.content || '';
}

// ==================== 生成回忆文案 ====================
app.post('/api/generate-story', async (req, res) => {
  try {
    const { photos, scene = 'moments', tone = 'warm' } = req.body;
    if (!photos || !photos.length) {
      return res.status(400).json({ error: '请至少选择一张照片' });
    }

    const provider = process.env.LLM_PROVIDER || 'zhipu';

    const sceneNames = {
      moments: '朋友圈动态',
      wechat: '微信朋友圈',
      xiaohongshu: '小红书笔记',
      family: '家庭群消息'
    };

    const toneNames = {
      warm: '温暖感人',
      poetic: '诗意文艺',
      funny: '轻松幽默',
      simple: '简洁直白'
    };

    const photoDesc = photos.map((p, i) => {
      return `${i + 1}. 标题：${p.title || '无标题'}，时间：${p.date || '未知'}，标签：${(p.tags || []).join('、') || '无'}`;
    }).join('\n');

    const prompt = `你是一位擅长用文字记录生活的朋友。请根据以下照片信息，为"${sceneNames[scene] || '朋友圈'}"生成一段${toneNames[tone] || '温暖'}的文案。

照片信息：
${photoDesc}

要求：
- 文案贴合照片主题，有真情实感，不空洞
- 字数控制在80-150字之间
- 根据场景调整风格：朋友圈简短有温度；小红书活泼带emoji和相关话题；家庭群亲切自然像跟家人说话
- 不要出现"AI"、"模型"等技术词汇
- 直接输出文案内容，不要带标题、序号或解释

文案：`;

    const story = await callLLM(prompt, provider);
    res.json({ story: story.trim(), provider, scene, tone });
  } catch (err) {
    console.error('generate-story error:', err.message);
    // 降级文案
    const fallback = generateFallbackStory(req.body.photos, req.body.scene, req.body.tone);
    res.json({ story: fallback, provider: 'fallback', error: err.message });
  }
});

function generateFallbackStory(photos, scene, tone) {
  const titles = photos.map(p => p.title || '美好瞬间').filter(Boolean);
  const title = titles[0] || '这段时光';
  const templates = {
    moments: `翻开相册，${title}的画面又浮现眼前。那些平凡的瞬间，回头看都是闪闪发光的记忆。`,
    wechat: `${title}，值得被记录。生活里的美好，往往就藏在这些不经意的瞬间里。`,
    xiaohongshu: `${title} ✨ 真的太治愈了！姐妹们谁懂啊，这种被美好包围的感觉 💕 #生活记录 #回忆录`,
    family: `家人们，看看这组照片，${title}的时候大家都好开心。这样的时光，就是最珍贵的。`,
    warm: `${title}，是记忆里柔软的一角。无论过多久，再看到都会会心一笑。`,
    poetic: `时光会走远，影像能长存。${title}，像一首温柔的诗，留在岁月的褶皱里。`,
    funny: `${title}，看完只想说：当时的我也太会拍了吧！快乐证据已存档 📸`
  };
  return templates[scene] || templates[tone] || templates.moments;
}

// ==================== 生成回忆录视频脚本 ====================
app.post('/api/generate-video-script', async (req, res) => {
  try {
    const { photos, theme = 'warm', music = 'soft' } = req.body;
    if (!photos || !photos.length) {
      return res.status(400).json({ error: '请至少选择一张照片' });
    }

    const provider = process.env.LLM_PROVIDER || 'zhipu';

    const themeNames = {
      warm: '温馨家庭',
      travel: '旅行足迹',
      growth: '成长记录',
      year: '年度总结'
    };

    const photoDesc = photos.slice(0, 8).map((p, i) => {
      return `${i + 1}. ${p.title || '照片'}（${p.date || '某时'}）`;
    }).join('\n');

    const prompt = `你是一位专业的回忆录旁白撰稿人。请为一段"${themeNames[theme] || '温馨'}"主题的回忆录视频生成一段开场旁白和3-5句分镜字幕。

照片信息：
${photoDesc}

要求：
- 开场旁白控制在60字以内，作为视频开头
- 分镜字幕每句8-15字，贴合对应照片
- 语言温暖、有画面感、不浮夸
- 只输出JSON格式：{"opening": "...", "captions": ["...", "..."]}

输出：`;

    const raw = await callLLM(prompt, provider);
    let script;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      script = jsonMatch ? JSON.parse(jsonMatch[0]) : { opening: raw.slice(0, 60), captions: ['美好瞬间', '值得珍藏'] };
    } catch (e) {
      script = { opening: raw.slice(0, 60), captions: ['美好瞬间', '值得珍藏'] };
    }

    res.json({ ...script, provider, theme, music });
  } catch (err) {
    console.error('generate-video-script error:', err.message);
    res.json({
      opening: '每一段时光，都值得被温柔记录。',
      captions: ['那些美好的瞬间', '组成了我们的人生', '值得被永远珍藏'],
      provider: 'fallback',
      error: err.message
    });
  }
});

// ==================== 生成照片命名建议 ====================
app.post('/api/photo-title', async (req, res) => {
  try {
    const { title, tags = [], date = '' } = req.body;
    const provider = process.env.LLM_PROVIDER || 'zhipu';

    const prompt = `请为一张照片生成一个简洁优美的中文标题，5-10个字。
原始标题：${title || '无'}
标签：${tags.join('、') || '无'}
时间：${date || '未知'}
要求：不要带标点，不要解释，直接输出标题。`;

    const result = await callLLM(prompt, provider);
    res.json({ title: result.trim().slice(0, 12), provider });
  } catch (err) {
    res.json({ title: req.body.title || '美好瞬间', provider: 'fallback', error: err.message });
  }
});

// ==================== 图片AI分析（模拟/真实切换）====================
app.post('/api/analyze-image', async (req, res) => {
  try {
    const { filename, size } = req.body;

    if (process.env.USE_MOCK_ANALYSIS === 'true') {
      return res.json(generateMockAnalysis(filename));
    }

    // v3.0 阶段：使用基于规则的本地模拟分析
    // 真实视觉AI需要接入阿里云/百度/腾讯云视觉API，后续扩展
    res.json(generateMockAnalysis(filename));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function generateMockAnalysis(filename) {
  const name = (filename || '').toLowerCase();
  const tagsMap = {
    'family_beach': ['海滩', '家庭', '旅行', '夏日'],
    'travel_landscape': ['风景', '旅行', '自然', '山川'],
    'child_growth': ['儿童', '成长', '家庭', '温馨'],
    'food_photo': ['美食', '生活', '聚餐'],
    'work_doc': ['工作', '文档', '屏幕截图'],
    'course_ppt': ['学习', '课程', 'PPT'],
    'blurry_photo': ['模糊', '低质量'],
    'id_card': ['证件', '身份证', '重要']
  };

  let tags = ['生活', '日常'];
  let intent = 'life';
  for (const [key, vals] of Object.entries(tagsMap)) {
    if (name.includes(key)) {
      tags = vals;
      break;
    }
  }

  if (name.includes('family') || name.includes('child')) intent = 'emotion';
  else if (name.includes('travel') || name.includes('landscape')) intent = 'life';
  else if (name.includes('work') || name.includes('course') || name.includes('ppt')) intent = 'work';
  else if (name.includes('id_card')) intent = 'info';
  else if (name.includes('food')) intent = 'life';

  const scores = {
    emotion: name.includes('family') || name.includes('child') ? 92 : 55,
    info: name.includes('id_card') || name.includes('work') ? 88 : 45,
    knowledge: name.includes('course') || name.includes('ppt') ? 80 : 30,
    life: name.includes('travel') || name.includes('food') ? 85 : 60,
    future: name.includes('id_card') ? 90 : 40
  };

  const total = Math.round(
    scores.emotion * 0.25 + scores.info * 0.2 + scores.knowledge * 0.15 +
    scores.life * 0.25 + scores.future * 0.15
  );

  return {
    tags,
    intent,
    scores,
    total,
    stars: Math.min(5, Math.max(1, Math.round(total / 20))),
    suggestion: total >= 80 ? '长期归档' : total >= 50 ? '普通归档' : '建议清理'
  };
}

// ==================== 启动服务 ====================
app.listen(PORT, () => {
  console.log(`AI人生档案馆后端代理服务已启动: http://localhost:${PORT}`);
  console.log(`当前模型供应商: ${process.env.LLM_PROVIDER || 'zhipu'}`);
  console.log(`API Key 已配置: ${!!getApiKey(process.env.LLM_PROVIDER || 'zhipu')}`);
});
