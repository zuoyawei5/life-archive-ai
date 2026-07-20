# AI人生档案馆

> 让每一张照片都有归属，让每一个瞬间都被理解。

一款基于AI能力的智能照片管理与人生记忆归档应用，支持照片智能分析、分类归档、回忆录视频生成、AI文案生成等功能。

## 在线体验

- **前端 Demo**：https://zuoyawei5.github.io/life-archive-ai/
- **后端代理**：需自行部署（见下文）

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/zuoyawei5/life-archive-ai.git
cd life-archive-ai
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置大模型 API Key

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的 API Key。

### 4. 启动服务

```bash
npm start
```

访问 http://localhost:3001 即可使用完整功能。

---

## 大模型 API Key 获取方式

本项目支持多家国内大模型平台，任选其一配置即可。

### 方案一：智谱AI（推荐，永久免费额度）

1. 访问 https://open.bigmodel.cn/
2. 使用手机号注册并登录
3. 进入「API Keys」页面
4. 点击「创建API Key」，复制生成的 Key
5. 填入 `.env` 文件：`ZHIPU_API_KEY=你的Key`
6. 设置：`LLM_PROVIDER=zhipu`

**免费额度**：新用户赠送 2000万 Token，永久有效。`glm-4-flash` 模型可直接免费调用。

### 方案二：硅基流动

1. 访问 https://cloud.siliconflow.cn/
2. 注册账号并完成实名认证
3. 进入「API管理」→「新建API Key」
4. 复制 Key 填入 `.env`：`SILICONFLOW_API_KEY=你的Key`
5. 设置：`LLM_PROVIDER=siliconflow`

**免费额度**：新用户 2000万 Token，9B以下模型永久免费。

### 方案三：阿里云百炼

1. 访问 https://bailian.console.aliyun.com/
2. 使用阿里云账号登录
3. 进入「模型广场」→「API-KEY管理」
4. 创建并复制 Key 填入 `.env`：`BAILIAN_API_KEY=你的Key`
5. 设置：`LLM_PROVIDER=bailian`

**免费额度**：每个模型 100万 Token，有效期3个月。

### 方案四：DeepSeek

1. 访问 https://platform.deepseek.com/
2. 注册账号
3. 进入「API开放平台」→「创建API Key」
4. 复制 Key 填入 `.env`：`DEEPSEEK_API_KEY=你的Key`
5. 设置：`LLM_PROVIDER=deepseek`

**免费额度**：新用户 100万 Token，有效期30天。

---

## 部署指南

### 前端部署（GitHub Pages）

前端为纯静态页面，已自动部署到 GitHub Pages：

```bash
git push origin main
```

约1-2分钟后，访问 `https://你的用户名.github.io/life-archive-ai/`。

### 后端代理部署（Render，免费）

1. 访问 https://render.com/ 并登录 GitHub 账号
2. 点击「New」→「Web Service」
3. 选择 `zuoyawei5/life-archive-ai` 仓库
4. 配置：
   - **Name**：`life-archive-ai-api`
   - **Runtime**：`Node`
   - **Build Command**：`npm install`
   - **Start Command**：`npm start`
5. 在「Environment」中添加环境变量（从 `.env` 复制）
6. 点击「Create Web Service」
7. 部署完成后，复制生成的 URL（如 `https://life-archive-ai-api.onrender.com`）
8. 在前端 `app.js` 中修改 `API_BASE_URL` 为 Render 的 URL

### 后端代理部署（自有服务器）

```bash
npm install
npm start
```

建议使用 `pm2` 守护进程：

```bash
npm install -g pm2
pm2 start server.js --name life-archive-ai
pm2 save
pm2 startup
```

---

## 主要功能

- **照片智能分析**：本地规则模拟 + 后端扩展真实视觉AI
- **五维价值评分**：情感/信息/知识/人生/未来五个维度
- **智能意图分类**：家庭、旅行、工作、学习、证件等
- **AI写文案**：支持朋友圈/小红书/家庭群等场景
- **生成回忆录**：模板选择 + AI旁白 + Canvas视频合成
- **智能清理**：重复/模糊/过期截图识别，支持放大确认
- **数字保险柜**：敏感证件加密存储与到期提醒

---

## 技术栈

- 前端：HTML5 + CSS3 + Vanilla JS（PWA）
- 后端：Node.js + Express
- AI：智谱GLM-4-Flash / 硅基流动 / 阿里云百炼 / DeepSeek
- 部署：GitHub Pages + Render/Railway/自有服务器

---

## 目录结构

```
life-archive-ai/
├── index.html            # 前端入口（GitHub Pages 根目录）
├── app.js                # 前端主逻辑
├── manifest.json
├── sw.js
├── assets/               # 图片资源
├── server.js             # 后端代理服务
├── package.json
├── .env.example
├── capacitor.config.json # Capacitor App配置
├── android/              # Android原生工程
└── docs/                 # 技术方案文档
```

---

## 注意事项

- 前端 Demo 默认连接本地后端 `http://localhost:3001`，如需公网访问需部署后端代理
- 打开前端后，点击右上角 **⚙️ 未连接** 徽章，输入你的后端代理地址并保存，即可启用真实 AI 能力
- 后端未配置 API Key 或网络不可达时，AI 文案、回忆录脚本、照片分析会自动降级为本地规则生成
- 所有 API Key 仅存储在服务端环境变量中，前端不直接接触密钥
- 生产环境建议开启 HTTPS 并配置域名
