/**
 * AI人生档案馆 - 后端代理服务
 * v3.3 视觉大模型版本
 * 支持：智谱AI (GLM-4V视觉 + GLM-4-Flash文本) / 硅基流动 / 阿里云百炼 / DeepSeek
 *
 * 隐私策略：照片不上传云端永久存储，照片文件始终存储在用户本地浏览器中。
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 静态资源：直接服务根目录下的前端文件
app.use(express.static(__dirname));

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

// ==================== 视觉大模型调用 ====================
async function callVisionLLM(imageBase64, prompt, provider = 'zhipu') {
  const key = getApiKey(provider);
  if (!key) throw new Error(`未配置 ${provider} 的 API Key`);

  // 确保图片格式正确
  const imageUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

  // 各供应商的视觉模型配置
  const visionConfigs = {
    zhipu: {
      url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      model: 'glm-4v-flash',  // 智谱免费视觉模型
      authHeader: k => ({ Authorization: `Bearer ${k}` }),
      body: {
        model: 'glm-4v-flash',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }],
        temperature: 0.3,
        max_tokens: 1024
      },
      extract: data => data.choices?.[0]?.message?.content || ''
    },
    siliconflow: {
      url: 'https://api.siliconflow.cn/v1/chat/completions',
      model: 'Qwen/Qwen2-VL-7B-Instruct',
      authHeader: k => ({ Authorization: `Bearer ${k}` }),
      body: {
        model: 'Qwen/Qwen2-VL-7B-Instruct',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }],
        temperature: 0.3,
        max_tokens: 1024
      },
      extract: data => data.choices?.[0]?.message?.content || ''
    },
    bailian: {
      url: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      model: 'qwen-vl-plus',
      authHeader: k => ({ Authorization: `Bearer ${k}` }),
      body: {
        model: 'qwen-vl-plus',
        input: {
          messages: [{
            role: 'user',
            content: [
              { text: prompt },
              { image: imageUrl }
            ]
          }]
        }
      },
      extract: data => data.output?.choices?.[0]?.message?.content?.[0]?.text || data.output?.text || ''
    }
  };

  const cfg = visionConfigs[provider] || visionConfigs.zhipu;
  console.log(`[视觉分析] 调用 ${provider} 视觉模型: ${cfg.model}`);

  const response = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...cfg.authHeader(key)
    },
    body: JSON.stringify(cfg.body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`视觉模型请求失败: ${response.status} ${text.substring(0, 200)}`);
  }

  const data = await response.json();
  const result = cfg.extract(data);
  if (!result) throw new Error('视觉模型返回空结果');
  return result;
}

// 使用视觉大模型分析照片
async function analyzeWithVisionModel(imageBase64, filename, canvasSignals) {
  const provider = process.env.LLM_PROVIDER || 'zhipu';

  const prompt = `请仔细看这张照片，分析以下信息并以JSON格式返回（不要有其他文字）：

{
  "description": "用一句中文描述这张照片的内容（15-30字）",
  "peopleCount": 照片中可见的人物数量（整数，0表示无人）,
  "hasText": 照片是否包含明显文字（true/false）,
  "isScreenshot": 这是否是手机/电脑屏幕截图（true/false）,
  "isCertificate": 这是否是证书、奖状、身份证、护照、合同、票据等证件类（true/false）,
  "isBlurry": 照片是否模糊（true/false）,
  "photoType": 照片类型，从以下选择：
  - info(信息留存): 证书、奖状、身份证、护照、银行卡、合同、票据、收据、门禁卡、驾驶证等具有法律效力或身份凭证性质的证件类照片
  - learning(知识学习): 知识卡片、信息图表、学习笔记、PPT课件、教程截图、思维导图、读书摘录等学习资料类照片
  - emotion(情感记忆): 人物合影、家庭照片、朋友聚会、旅行合影等有情感价值的人物照片
  - creative(摄影创作): 风景摄影、美食摄影、艺术创作等注重审美表达的照片
  - work(工作沟通): 工作文档、会议记录、工作截图、项目管理等职场相关照片
  - temp(临时记录): 临时截图、扫码记录、快递单号等临时性记录照片
  - life(生活记录): 日常生活照、购物记录、宠物、家居等不属于以上类别的照片,
  "emotion": 情感价值评分0-100（人物合影高、证书适当高、截图极低）,
  "info": 信息价值评分0-100,
  "knowledge": 知识价值评分0-100,
  "life": 人生价值评分0-100,
  "future": 未来参考价值0-100,
  "tags": ["标签1", "标签2", "标签3"]
}

注意：
- peopleCount 必须是你实际看到的人物数量，不要猜测
- 如果是证书奖状，emotion 给 40-55（荣誉感），life 给 70-85（里程碑）
- 如果是截图，emotion 给 5-15，peopleCount 给 0
- 如果是风景照，emotion 给 15-30
- 分类判定示例：
  · 荣誉证书、获奖证书 → info（信息留存·证书奖状）
  · 身份证、护照、驾驶证 → info（信息留存·证件档案）
  · 合同、收据、发票 → info（信息留存·票据文件）
  · 知识信息图、行业分析图 → learning（知识学习·信息图表）
  · 学习笔记、PPT课件截图 → learning（知识学习·学习资料）
  · 思维导图、读书摘录 → learning（知识学习·学习资料）
  · 注意：有文字不等于是信息留存，知识卡片虽然有文字但应归为learning
- 如果是知识学习类（PPT课件、知识卡片、信息图表），knowledge 给 65-85，future 给 60-80，info 给 50-70（知识有长期参考价值）
- 如果是工作文档，info 给 50-70，future 给 40-60
- 如果是生活记录类，emotion 给 40-60，life 给 50-70
- 评分原则：任何照片的综合分值（emotion*0.25+info*0.2+knowledge*0.15+life*0.25+future*0.15）低于30分才可能被建议清理，高价值照片（情感、知识、证件类）综合分值应≥50
- 只返回JSON，不要有任何解释文字`;

  const raw = await callVisionLLM(imageBase64, prompt, provider);
  console.log('[视觉分析] 原始返回:', raw.substring(0, 300));

  // 解析 JSON
  let analysis;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (e) {
    throw new Error('视觉模型返回格式解析失败: ' + e.message);
  }

  if (!analysis) throw new Error('视觉模型未返回有效JSON');

  // 映射到统一格式
  const intent = analysis.photoType || 'life';
  const intentMap = {
    emotion: '情感记忆', info: '信息留存', learning: '知识学习',
    work: '工作沟通', creative: '摄影创作', temp: '临时记录', life: '生活记录'
  };
  const subMap = {
    emotion: analysis.isCertificate ? '高光时刻' : '人物合影',
    info: analysis.isCertificate ? '证书奖状' : '证件档案',
    learning: '学习资料', work: '工作文档',
    creative: '摄影作品', temp: '应用截图', life: '生活记录'
  };

  const scores = {
    emotion: clamp(analysis.emotion ?? 30),
    info: clamp(analysis.info ?? 30),
    knowledge: clamp(analysis.knowledge ?? 20),
    life: clamp(analysis.life ?? 40),
    future: clamp(analysis.future ?? 30)
  };

  // 分类加权评分：不同分类使用不同权重，突出该分类最核心的价值维度
  const categoryWeights = {
    info:     { emotion: 0.10, info: 0.40, knowledge: 0.10, life: 0.15, future: 0.25 },
    learning: { emotion: 0.10, info: 0.20, knowledge: 0.35, life: 0.10, future: 0.25 },
    emotion:  { emotion: 0.35, info: 0.15, knowledge: 0.10, life: 0.25, future: 0.15 },
    creative: { emotion: 0.25, info: 0.20, knowledge: 0.15, life: 0.25, future: 0.15 },
    work:     { emotion: 0.10, info: 0.30, knowledge: 0.25, life: 0.15, future: 0.20 },
    temp:     { emotion: 0.20, info: 0.20, knowledge: 0.15, life: 0.25, future: 0.20 },
    life:     { emotion: 0.25, info: 0.15, knowledge: 0.10, life: 0.30, future: 0.20 }
  };

  const weights = categoryWeights[intent] || categoryWeights.life;

  // 高价值分类保底：提升核心维度分数
  // 证书检测：AI的isCertificate + 描述/标签关键词双重判断
  const certKeywords = /证书|奖状|荣誉|勋章|资质|执照|护照|身份证|驾驶证|毕业证|学位证/;
  const isCertPhoto = analysis.isCertificate || certKeywords.test(analysis.description || '') || 
    (analysis.tags || []).some(t => certKeywords.test(t));

  if (intent === 'learning') {
    scores.knowledge = Math.max(scores.knowledge, 75);
    scores.future = Math.max(scores.future, 70);
    scores.info = Math.max(scores.info, 55);
  } else if (intent === 'info') {
    // 证书证件类：信息维度极高价值
    if (isCertPhoto) {
      scores.info = Math.max(scores.info, 90);
      scores.future = Math.max(scores.future, 80);
      scores.life = Math.max(scores.life, 65);
    } else {
      scores.info = Math.max(scores.info, 80);
      scores.future = Math.max(scores.future, 70);
      scores.life = Math.max(scores.life, 50);
    }
  } else if (intent === 'emotion') {
    scores.emotion = Math.max(scores.emotion, 70);
    scores.life = Math.max(scores.life, 60);
  }

  let total = Math.round(
    scores.emotion * weights.emotion + scores.info * weights.info +
    scores.knowledge * weights.knowledge + scores.life * weights.life +
    scores.future * weights.future
  );

  // 分类保底分：确保高价值照片不会因弱维度拖累而评分过低
  if (intent === 'info' && isCertPhoto) {
    if (total < 90) total = 90;  // 证书类保底90
  } else if (intent === 'info') {
    if (total < 75) total = 75;  // 证件类保底75
  } else if (intent === 'learning') {
    if (total < 75) total = 75;  // 知识类保底75
  } else if (intent === 'emotion') {
    if (total < 70) total = 70;  // 情感类保底70
  }

  // 自然语言描述（供回忆录用）
  const nlDesc = `视觉模型分析：${analysis.description || '未知照片'}；人物${analysis.peopleCount || 0}人；${analysis.hasText ? '含文字' : '无文字'}；${analysis.isScreenshot ? '截图' : '非截图'}；${analysis.isCertificate ? '证书奖状' : '非证书'}；${analysis.isBlurry ? '模糊' : '清晰'}`;

  return {
    tags: analysis.tags || ['照片'],
    intent,
    scores,
    total,
    stars: Math.min(5, Math.max(1, Math.round(total / 20))),
    suggestion: total >= 80 ? '长期归档' : total >= 50 ? '普通归档' : '建议清理',
    description: analysis.description || '未知照片',
    naturalLanguageDesc: nlDesc,
    estimated: false,  // 视觉模型分析，非估算
    detections: {
      peopleCount: analysis.peopleCount || 0,
      hasText: !!analysis.hasText,
      isScreenshot: !!analysis.isScreenshot,
      isCertificate: !!analysis.isCertificate,
      blurScore: analysis.isBlurry ? 0.2 : 0.9,
      subCategory: subMap[intent] || '生活记录'
    },
    intentLabel: `${intentMap[intent] || '生活记录'} · ${subMap[intent] || '生活记录'}`,
    provider: `${provider}-vision`,
    modelVersion: 'vision-v1'
  };
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
      const desc = p.description || '无描述';
      const intent = p.intentLabel || '未分类';
      const scores = p.scores ? `（情感${p.scores.emotion||0}/信息${p.scores.info||0}/人生${p.scores.life||0}）` : '';
      return `${i + 1}. ${p.title || '无标题'}（${p.date || '未知'}）\n   AI描述：${desc}\n   分类：${intent}${scores}`;
    }).join('\n');

    const prompt = `你是一位擅长用文字记录生活的朋友。请根据以下照片信息，为"${sceneNames[scene] || '朋友圈'}"生成一段${toneNames[tone] || '温暖'}的文案。

照片信息：
${photoDesc}

以上每张照片的AI描述和分类是真实的图像分析结果，文案内容必须贴合这些信息，不要泛泛而谈。

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
  // 优先使用照片的 AI 描述，让降级文案更贴合照片内容
  const descs = photos.map(p => p.description).filter(Boolean);
  const descText = descs[0] || '';
  const subject = descText || title;
  const templates = {
    moments: `翻开相册，${subject}的画面又浮现眼前。${descText ? descText + '，' : ''}那些平凡的瞬间，回头看都是闪闪发光的记忆。`,
    wechat: `${subject}，值得被记录。${descText ? descText + '。' : ''}生活里的美好，往往就藏在这些不经意的瞬间里。`,
    xiaohongshu: `${subject} ✨ 真的太治愈了！${descText ? descText + '。' : ''}姐妹们谁懂啊，这种被美好包围的感觉 💕 #生活记录 #回忆录`,
    family: `家人们，看看这组照片，${subject}的时候大家都好开心。${descText ? descText + '。' : ''}这样的时光，就是最珍贵的。`,
    warm: `${subject}，是记忆里柔软的一角。${descText ? descText + '。' : ''}无论过多久，再看到都会会心一笑。`,
    poetic: `时光会走远，影像能长存。${subject}，${descText ? descText + '，' : ''}像一首温柔的诗，留在岁月的褶皱里。`,
    funny: `${subject}，看完只想说：当时的我也太会拍了吧！${descText ? descText + '。' : ''}快乐证据已存档 📸`
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

// ==================== 图片AI分析（视觉大模型 + Canvas 信号降级）====================
app.post('/api/analyze-image', async (req, res) => {
  try {
    const { filename, size, canvas, imageBase64 } = req.body;

    // 如果前端传了图片 base64 且配置了 API Key，使用视觉大模型真正分析
    if (imageBase64 && getApiKey(process.env.LLM_PROVIDER || 'zhipu')) {
      try {
        const visionResult = await analyzeWithVisionModel(imageBase64, filename, canvas);
        return res.json(visionResult);
      } catch (err) {
        console.error('视觉模型分析失败，降级到 Canvas 信号:', err.message);
        // 降级到 Canvas 信号分析
      }
    }

    // 降级：使用 Canvas 像素信号分析（标记为 estimated）
    const result = analyzeWithCanvasSignals(filename, canvas);
    result.estimated = true;  // 标记为估算结果
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 基于 Canvas 像素信号的分析
function analyzeWithCanvasSignals(filename, cs) {
  const name = (filename || '').toLowerCase();
  cs = cs || {};

  const td = cs.textDensity != null ? cs.textDensity : null;   // 文字密度
  const cv = cs.colorVariety != null ? cs.colorVariety : null; // 色彩丰富度
  const sr = cs.skinRatio != null ? cs.skinRatio : null;       // 肤色占比
  const ss = cs.screenshotScore != null ? cs.screenshotScore : null;
  const bs = cs.blurScore != null ? cs.blurScore : null;

  // 文件名辅助匹配
  const nameRules = {
    emotion: ['family', 'people', 'group', 'birthday', 'wedding', 'party', 'child', 'baby', 'kid'],
    creative: ['travel', 'landscape', 'scenery', 'mountain', 'sea', 'beach', 'food', 'meal', 'dinner'],
    info: ['id', 'card', 'passport', 'license', 'certificate'],
    work: ['work', 'office', 'meeting', 'ppt', 'report', 'doc'],
    learning: ['course', 'book', 'note', 'study', 'class', 'knowledge', 'invest', 'tech', 'science'],
    temp: ['screenshot', 'screen', 'blur', 'tmp']
  };

  // 1. 判定 intent
  let intent = 'life';
  let subCategory = '生活记录';

  // 无 canvas 信号时：用文件名推断
  if (td === null) {
    // 检查文件名规则
    for (const [cat, keywords] of Object.entries(nameRules)) {
      if (keywords.some(k => name.includes(k))) {
        intent = cat;
        if (cat === 'emotion') subCategory = name.includes('child') ? '成长记录' : '家庭合影';
        else if (cat === 'creative') subCategory = name.includes('food') ? '美食记录' : '风景摄影';
        else if (cat === 'info') subCategory = '证件档案';
        else if (cat === 'work') subCategory = '工作文档';
        else if (cat === 'learning') subCategory = '学习资料';
        else if (cat === 'temp') subCategory = '临时截图';
        break;
      }
    }
    // 微信图片/QQ图片/IMG_ 等常见截图文件名 → temp
    if (intent === 'life' && (
      name.startsWith('微信图片') || name.startsWith('qq图片') || name.startsWith('img_') ||
      name.startsWith('screenshot') || name.startsWith('image') || /\d{8,}/.test(name)
    )) {
      intent = 'temp';
      subCategory = '应用截图';
    }
  }
  // Canvas 信号优先判定（优先级从高到低）
  else {
    const _sr = sr || 0;
    const _cv = cv || 0;
    const _ss = ss || 0;
    const _bs = bs || 0.9;

    // 优先级1：模糊照片 → 临时记录
    if (_bs < 0.3) {
      intent = 'temp';
      subCategory = '模糊照片';
    }
    // 优先级1.5：知识信息图（高文字 + 丰富色彩 + 无人物）→ 知识学习
    // 优先于证书判定，避免知识卡片被误归为信息留存
    else if (td > 0.15 && _cv > 800 && _sr < 0.05) {
      intent = 'learning';
      subCategory = '信息图表';
    }
    // 优先级2：证书/奖状（高文字 + 含棕色/金色装饰 + 低真实肤色 + 色彩不丰富）→ 信息留存
    else if (td > 0.15 && (cs.brownGoldRatio || 0) > 0.08 && _sr < 0.06 && _cv < 800) {
      intent = 'info';
      subCategory = '证书奖状';
    }
    // 优先级3：含人物（高肤色 + 低文字）→ 情感记忆
    else if (_sr > 0.08 && td < 0.2) {
      intent = 'emotion';
      subCategory = '人物合影';
    }
    // 优先级4：截图（高文字 + 高清晰度 + 无人物）→ 临时记录
    else if (td > 0.15 && _bs > 0.8 && _sr < 0.05) {
      intent = 'temp';
      subCategory = '应用截图';
    }
    // 优先级5：工作文档（中等文字 + 截图特征）→ 工作沟通
    else if (td > 0.1 && _ss > 0.5 && _sr < 0.03) {
      intent = 'work';
      subCategory = '文档截图';
    }
    // 优先级6：风景摄影（低文字 + 低肤色 + 低色彩）→ 摄影创作
    else if (td < 0.08 && _sr < 0.02 && _cv < 300) {
      intent = 'creative';
      subCategory = '风景摄影';
    }
    // 优先级7：其余含人物的 → 情感记忆
    else if (_sr > 0.03) {
      intent = 'emotion';
      subCategory = '人物合影';
    }
  }

  // 文件名辅助修正（如果文件名有明确关键字）
  for (const [cat, keywords] of Object.entries(nameRules)) {
    if (keywords.some(k => name.includes(k))) {
      // 文件名匹配优先级高于 canvas 默认值，但低于 canvas 的明确信号
      if (td === null || (cat === 'emotion' && sr !== null && sr > 0.05) || (cat === 'learning' && td > 0.15)) {
        intent = cat;
        if (cat === 'emotion') subCategory = name.includes('child') ? '成长记录' : '家庭合影';
        else if (cat === 'creative') subCategory = name.includes('food') ? '美食记录' : '风景摄影';
        else if (cat === 'info') subCategory = '证件档案';
        else if (cat === 'work') subCategory = '工作文档';
        else if (cat === 'learning') subCategory = '学习资料';
        else if (cat === 'temp') subCategory = '临时截图';
      }
      break;
    }
  }

  // 2. 根据信号计算五维评分
  const scores = computeBackendScores(intent, td, cv, sr, ss, bs);

  const total = Math.round(
    scores.emotion * 0.25 + scores.info * 0.2 + scores.knowledge * 0.15 +
    scores.life * 0.25 + scores.future * 0.15
  );

  // 3. 检测结果
  const hasText = td !== null ? td > 0.12 : ['info', 'work', 'learning'].includes(intent);
  const peopleCount = sr !== null
    ? (sr > 0.08 ? Math.min(5, Math.floor((sr - 0.05) / 0.04) + 1) : 0)
    : 0;
  // 截图检测：高清晰度 + 高文字密度 + 无人物 = 截图
  const isScreenshot = td !== null
    ? (td > 0.12 && (bs || 0.9) > 0.8 && (sr || 0) < 0.05)
    : intent === 'temp';
  const blurScore = bs !== null ? bs : 0.92;

  // 4. 标签
  const tagsMap = {
    emotion: ['人物', '情感', '合影'],
    creative: ['风景', '摄影', '创作'],
    info: ['证件', '重要', '信息'],
    work: ['工作', '文档', '截图'],
    learning: ['知识', '学习', '信息图'],
    temp: ['截图', '临时'],
    life: ['生活', '日常']
  };

  // 5. 将 Canvas 信号转化为自然语言描述
  const nlDesc = canvasSignalsToNaturalLanguage(cs, filename, intent, subCategory);

  // 6. 生成一句话描述
  const description = generatePhotoDescription(intent, subCategory, cs, filename);

  return {
    tags: tagsMap[intent] || ['生活', '日常'],
    intent,
    scores,
    total,
    stars: Math.min(5, Math.max(1, Math.round(total / 20))),
    suggestion: total >= 80 ? '长期归档' : total >= 50 ? '普通归档' : '建议清理',
    description,
    naturalLanguageDesc: nlDesc,
    detections: {
      peopleCount,
      hasText,
      isScreenshot,
      blurScore,
      subCategory
    }
  };
}

function computeBackendScores(intent, td, cv, sr, ss, bs) {
  // 默认值（canvas 信号缺失时）
  const _td = td != null ? td : 0.1;
  const _cv = cv != null ? cv : 500;
  const _sr = sr != null ? sr : 0;
  const _ss = ss != null ? ss : 0.2;
  const _bs = bs != null ? bs : 0.9;

  let emotion, info, knowledge, life, future;

  switch (intent) {
    case 'learning':
      info    = clamp(Math.round(60 + _td * 35 + Math.min(20, _cv / 100)));
      knowledge = clamp(Math.round(65 + _td * 30 + Math.min(15, _cv / 120)));
      emotion = clamp(Math.round(15 + _sr * 100 - _td * 10));
      life    = clamp(Math.round(30 + _sr * 30));
      future  = clamp(Math.round(70 + _td * 20));
      break;
    case 'work':
      info    = clamp(Math.round(65 + _td * 30 + _ss * 10));
      knowledge = clamp(Math.round(45 + _td * 25));
      emotion = clamp(Math.round(15 + _sr * 80));
      life    = clamp(Math.round(25 + _ss * 20));
      future  = clamp(Math.round(55 + _td * 20));
      break;
    case 'info':
      // 信息留存/证书奖状：信息极高、未来高，情感适当（荣誉感）
      info    = clamp(Math.round(75 + _td * 20 + _ss * 10));
      knowledge = clamp(Math.round(30 + _td * 20));
      emotion = clamp(Math.round(45 + _sr * 30));  // 证书有荣誉感，情感适当高
      life    = clamp(Math.round(70 + _ss * 15));  // 人生价值高（里程碑）
      future  = clamp(Math.round(75 + _td * 15));
      break;
    case 'emotion':
      emotion = clamp(Math.round(60 + _sr * 40 + (1 - _td) * 15));
      info    = clamp(Math.round(20 + _td * 25));
      knowledge = clamp(Math.round(10 + _td * 20));
      life    = clamp(Math.round(70 + _sr * 25));
      future  = clamp(Math.round(45 + _sr * 30));
      break;
    case 'creative':
      // 摄影创作：人生中、情感低
      emotion = clamp(Math.round(20 + _sr * 30));
      info    = clamp(Math.round(15 + _td * 15));
      knowledge = clamp(Math.round(10 + _td * 15));
      life    = clamp(Math.round(45 + (1 - _ss) * 20));
      future  = clamp(Math.round(30 + _cv / 50));
      break;
    case 'temp':
      // 临时记录/截图：全部偏低，情感极低
      emotion = clamp(Math.round(5 + _sr * 15));
      info    = clamp(Math.round(20 + _td * 20));
      knowledge = clamp(Math.round(5 + _td * 10));
      life    = clamp(Math.round(8 + _ss * 12));
      future  = clamp(Math.round(5 + _td * 8));
      break;
    default:
      // 生活记录：情感低（不是人物照就没有情感价值）
      emotion = clamp(Math.round(15 + _sr * 40));
      info    = clamp(Math.round(25 + _td * 20));
      knowledge = clamp(Math.round(15 + _td * 20));
      life    = clamp(Math.round(25 + _sr * 25));
      future  = clamp(Math.round(20 + _td * 15));
  }

  if (_bs < 0.3) {
    emotion = clamp(emotion - 30);
    info = clamp(info - 20);
    knowledge = clamp(knowledge - 25);
    life = clamp(life - 35);
    future = clamp(future - 30);
  }

  return { emotion, info, knowledge, life, future };
}

function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }

// ==================== Canvas 信号 → 自然语言描述 ====================
function canvasSignalsToNaturalLanguage(cs, filename, intent, subCategory) {
  const parts = [];
  const name = filename || '未知照片';
  parts.push(`文件名：${name}`);

  if (cs.textDensity != null) {
    if (cs.textDensity > 0.4) parts.push('画面中存在大量文字区域，文字密度极高');
    else if (cs.textDensity > 0.25) parts.push('画面中存在较多文字区域，文字密度较高');
    else if (cs.textDensity > 0.12) parts.push('画面中存在部分文字区域');
    else parts.push('画面中几乎无文字');
  }
  if (cs.colorVariety != null) {
    if (cs.colorVariety > 1500) parts.push('色彩非常丰富，包含大量不同颜色');
    else if (cs.colorVariety > 800) parts.push('色彩较丰富');
    else if (cs.colorVariety > 300) parts.push('色彩适中');
    else parts.push('色彩单调，以少数颜色为主');
  }
  if (cs.skinRatio != null) {
    if (cs.skinRatio > 0.15) parts.push(`检测到较大面积肤色区域（占比${Math.round(cs.skinRatio * 100)}%），可能包含${Math.min(8, Math.round(cs.skinRatio * 50))}位人物`);
    else if (cs.skinRatio > 0.05) parts.push('检测到少量肤色区域，可能包含人物');
    else parts.push('未检测到明显的人物肤色');
  }
  if (cs.blurScore != null) {
    if (cs.blurScore > 0.85) parts.push('图像非常清晰');
    else if (cs.blurScore > 0.6) parts.push('图像较为清晰');
    else if (cs.blurScore > 0.3) parts.push('图像略有模糊');
    else parts.push('图像严重模糊，画质较差');
  }
  if (cs.brightness != null) {
    if (cs.brightness > 0.8) parts.push('画面整体偏亮');
    else if (cs.brightness < 0.2) parts.push('画面整体偏暗');
  }
  parts.push(`分类判定：${intent}（${subCategory}）`);
  return parts.join('；');
}

function generatePhotoDescription(intent, subCategory, cs, filename) {
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

// ==================== 生成自传式回忆录 ====================
app.post('/api/generate-memoir', async (req, res) => {
  try {
    const { photos, theme = 'warm' } = req.body;
    if (!photos || !photos.length) {
      return res.status(400).json({ error: '请至少选择一张照片' });
    }

    const provider = process.env.LLM_PROVIDER || 'zhipu';
    const themeNames = { warm: '温馨家庭', travel: '旅行足迹', growth: '成长记录', year: '年度总结' };

    // 将每张照片的描述组合成 prompt
    const photoDescs = photos.slice(0, 20).map((p, i) => {
      const desc = p.description || p.naturalLanguageDesc || `照片${i + 1}：${p.title || p.name || '未知'}`;
      const intent = p.intent || p.intentLabel || '';
      const scores = p.scores ? `（情感${p.scores.emotion||0}/信息${p.scores.info||0}/人生${p.scores.life||0}）` : '';
      return `【照片${i + 1}】${p.title || p.name || ''}（${p.date || '某时'}）\n分类：${intent}\nAI描述：${desc}${scores}`;
    }).join('\n\n');

    const prompt = `你是一位专业的传记作家。请根据以下照片的AI分析信息，以主人公"我"的第一人称视角，撰写自传式回忆录。

主题：${themeNames[theme] || '温馨'}

照片信息：
${photoDescs}

写作要求：
- 以第一人称"我"来叙述，像在写自己的自传
- 每张照片对应一个章节（100-200字），照片作为插图穿插
- 故事内容必须贴合照片的AI分析信息：
  · 如果是证书/奖状：写何时何地（如有）参加什么活动/考试，获得什么证书，当时心情如何，这个成就是否成为成长路上的重要里程碑
  · 如果是人物合影：写和谁在一起，什么场合，当时的关系和氛围，为什么这张照片值得记住
  · 如果是风景/旅行：写去了哪里，路上发生了什么，看到了什么风景，有什么感受
  · 如果是工作/学习：写当时在做什么项目/学什么，遇到了什么挑战或收获
  · 如果是截图/临时：简要提及当时的信息需求或生活状态
- 章节之间有自然过渡，按时间顺序串联成个人自传
- 语言温暖真实，有画面感和情感深度
- 不要出现"AI"、"模型"、"分析"等技术词汇
- 输出JSON格式：{"title": "自传标题", "opening": "开场白（50字以内）", "chapters": [{"photoIndex": 1, "story": "这段故事文本"}, ...], "ending": "结尾感言（50字以内）}

输出：`;

    const raw = await callLLM(prompt, provider);
    let memoir;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      memoir = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (e) { memoir = null; }

    if (!memoir) {
      memoir = generateFallbackMemoir(photos, theme);
    }

    res.json({ ...memoir, provider, theme });
  } catch (err) {
    console.error('generate-memoir error:', err.message);
    res.json({
      ...generateFallbackMemoir(req.body.photos || [], req.body.theme),
      provider: 'fallback',
      error: err.message
    });
  }
});

function generateFallbackMemoir(photos, theme) {
  const stories = photos.slice(0, 20).map((p, i) => ({
    photoIndex: i + 1,
    story: `那是${p.date || '某天'}的事。${p.description || p.title || '这张照片'}定格了一个值得回味的瞬间。现在翻看起来，当时的场景依然历历在目，那些平凡的日子，正是人生最珍贵的部分。`
  }));

  return {
    title: '我的回忆录',
    opening: '翻开这些照片，往事如潮水般涌来。每一张都是时光的切片，记录着我走过的路。',
    chapters: stories,
    ending: '这些照片串起了我的故事。人生还在继续，未来还会有更多值得记录的瞬间。'
  };
}

// ==================== 短信验证码系统 ====================
const verifyCodes = new Map(); // 手机号 -> {code, expire, sentAt}

// 阿里云短信SDK（按需加载，未安装时不报错）
let smsClient = null;
try {
  const dysmsapi = require('@alicloud/dysmsapi20170525');
  const OpenApi = require('@alicloud/openapi-client');
  const smsConfig = {
    accessKeyId: process.env.SMS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.SMS_ACCESS_KEY_SECRET || '',
    signName: process.env.SMS_SIGN_NAME || '人生档案馆',
    templateCode: process.env.SMS_TEMPLATE_CODE || ''
  };
  if (smsConfig.accessKeyId) {
    smsClient = new dysmsapi.default(new OpenApi.Config({
      accessKeyId: smsConfig.accessKeyId,
      accessKeySecret: smsConfig.accessKeySecret,
      endpoint: 'dysmsapi.aliyuncs.com'
    }));
    console.log('阿里云短信服务已启用');
  } else {
    console.log('短信服务未配置（开发模式：验证码将通过API返回显示）');
  }
} catch(e) {
  console.log('阿里云短信SDK未安装，使用开发模式');
}

// 发送验证码API
app.post('/api/sms/send', (req, res) => {
  const { phone } = req.body;

  // 验证手机号格式
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return res.json({ success: false, message: '手机号格式不正确' });
  }

  // 频率限制：60秒内不能重复发送
  const existing = verifyCodes.get(phone);
  if (existing && Date.now() - existing.sentAt < 60000) {
    const waitSec = Math.ceil((60000 - (Date.now() - existing.sentAt)) / 1000);
    return res.json({ success: false, message: `请${waitSec}秒后再试` });
  }

  // 生成6位验证码
  const code = String(Math.floor(100000 + Math.random() * 900000));

  // 存储验证码（5分钟有效）
  verifyCodes.set(phone, {
    code,
    expire: Date.now() + 300000,
    sentAt: Date.now()
  });

  // 如果配置了阿里云短信，发送真实短信
  if (smsClient) {
    smsClient.sendSms(new (require('@alicloud/dysmsapi20170525')).SendSmsRequest({
      phoneNumbers: phone,
      signName: process.env.SMS_SIGN_NAME || '人生档案馆',
      templateCode: process.env.SMS_TEMPLATE_CODE || '',
      templateParam: JSON.stringify({ code })
    })).then(() => {
      res.json({ success: true, message: '验证码已发送' });
    }).catch(err => {
      console.error('短信发送失败:', err.message);
      res.json({ success: false, message: '短信发送失败，请稍后重试' });
    });
  } else {
    // 开发模式：返回验证码（前端显示）
    res.json({ success: true, message: '验证码已发送', devCode: code });
  }
});

// 验证验证码API
app.post('/api/sms/verify', (req, res) => {
  const { phone, code } = req.body;

  const stored = verifyCodes.get(phone);
  if (!stored) {
    return res.json({ success: false, message: '请先获取验证码' });
  }

  if (Date.now() > stored.expire) {
    verifyCodes.delete(phone);
    return res.json({ success: false, message: '验证码已过期，请重新获取' });
  }

  if (code !== stored.code) {
    return res.json({ success: false, message: '验证码错误' });
  }

  // 验证成功，删除验证码
  verifyCodes.delete(phone);
  res.json({ success: true, message: '验证成功' });
});

// ==================== 用户数据存储（SQLite） ====================
const Database = require('better-sqlite3');
const db = new Database('life-archive.db');

// 创建表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    phone TEXT PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    last_active TEXT DEFAULT (datetime('now', 'localtime')),
    photo_count INTEGER DEFAULT 0,
    memoir_count INTEGER DEFAULT 0,
    settings TEXT
  );

  CREATE TABLE IF NOT EXISTS user_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    photo_data TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (phone) REFERENCES users(phone)
  );

  CREATE TABLE IF NOT EXISTS user_memoirs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    memoir_data TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (phone) REFERENCES users(phone)
  );
`);

// 用户数据同步API
app.post('/api/user/sync', (req, res) => {
  const { phone, photoCount, memoirCount, settings } = req.body;

  const stmt = db.prepare(`
    INSERT INTO users (phone, last_active, photo_count, memoir_count, settings)
    VALUES (?, datetime('now', 'localtime'), ?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      last_active = datetime('now', 'localtime'),
      photo_count = ?,
      memoir_count = ?,
      settings = ?
  `);
  stmt.run(phone, photoCount, memoirCount, JSON.stringify(settings || {}),
           photoCount, memoirCount, JSON.stringify(settings || {}));

  res.json({ success: true });
});

// 管理后台API
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin888';

// 管理员登录
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: 'admin_' + Date.now() });
  } else {
    res.json({ success: false, message: '密码错误' });
  }
});

// 获取用户列表
app.get('/api/admin/users', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY last_active DESC').all();
  res.json({ success: true, users });
});

// 获取统计数据
app.get('/api/admin/stats', (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalPhotos = db.prepare('SELECT SUM(photo_count) as count FROM users').get().count || 0;
  const totalMemoirs = db.prepare('SELECT SUM(memoir_count) as count FROM users').get().count || 0;
  const todayActive = db.prepare("SELECT COUNT(*) as count FROM users WHERE last_active >= date('now', 'localtime')").get().count;

  res.json({ success: true, stats: { totalUsers, totalPhotos, totalMemoirs, todayActive } });
});

// 获取用户详情
app.get('/api/admin/user/:phone', (req, res) => {
  const phone = req.params.phone;
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  res.json({ success: true, user });
});

// ==================== 启动服务 ====================
app.listen(PORT, () => {
  console.log(`AI人生档案馆后端代理服务已启动: http://localhost:${PORT}`);
  console.log(`当前模型供应商: ${process.env.LLM_PROVIDER || 'zhipu'}`);
  console.log(`API Key 已配置: ${!!getApiKey(process.env.LLM_PROVIDER || 'zhipu')}`);
});
