#!/bin/bash
# AI人生档案馆 - 阿里云一键部署脚本
# 使用方法：在服务器上执行 bash deploy.sh

set -e

APP_DIR="/opt/life-archive-ai"
APP_NAME="life-archive"

echo "=========================================="
echo "  AI人生档案馆 - 阿里云一键部署"
echo "=========================================="

# 1. 安装Node.js 20
if ! command -v node &> /dev/null; then
  echo "[1/6] 安装Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "[1/6] Node.js已安装: $(node -v)"
fi

# 2. 安装PM2
if ! command -v pm2 &> /dev/null; then
  echo "[2/6] 安装PM2..."
  sudo npm install -g pm2
else
  echo "[2/6] PM2已安装"
fi

# 3. 安装Nginx
if ! command -v nginx &> /dev/null; then
  echo "[3/6] 安装Nginx..."
  sudo apt-get update
  sudo apt-get install -y nginx
else
  echo "[3/6] Nginx已安装"
fi

# 4. 上传代码（如果目录不存在，提示用户上传）
if [ ! -d "$APP_DIR" ]; then
  echo "[4/6] 创建应用目录..."
  sudo mkdir -p $APP_DIR
  sudo chown $USER:$USER $APP_DIR
  echo "请将项目代码上传到 $APP_DIR 目录"
  echo "方法1: scp -r ./life-archive-ai/* root@服务器IP:$APP_DIR/"
  echo "方法2: cd $APP_DIR && git clone 你的仓库地址 ."
  echo "完成后重新运行此脚本"
  exit 0
else
  echo "[4/6] 应用目录已存在"
fi

# 5. 安装依赖并启动
echo "[5/6] 安装依赖并启动应用..."
cd $APP_DIR
npm install --production

# 配置环境变量
if [ ! -f .env ]; then
  echo "请创建.env文件并填入API密钥："
  echo "  ZHIPU_API_KEY=你的密钥"
  echo "  PORT=3001"
  read -p "输入智谱API密钥: " apikey
  echo "ZHIPU_API_KEY=$apikey" > .env
  echo "PORT=3001" >> .env
  echo "NODE_ENV=production" >> .env
fi

# PM2启动
pm2 delete $APP_NAME 2>/dev/null || true
pm2 start server.js --name $APP_NAME
pm2 save
pm2 startup -u $USER --hp /home/$USER 2>/dev/null || sudo env PATH=$PATH:/usr/bin pm2 startup -u $USER --hp /home/$USER

# 6. 配置Nginx
echo "[6/6] 配置Nginx反向代理..."
cat > /tmp/life-archive-nginx << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    client_max_body_size 20M;

    location / {
        root /opt/life-archive-ai;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
NGINXEOF

sudo cp /tmp/life-archive-nginx /etc/nginx/sites-available/life-archive
sudo ln -sf /etc/nginx/sites-available/life-archive /etc/nginx/sites-enabled/life-archive
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo ""
echo "应用已启动: http://$(curl -s ifconfig.me)"
echo ""
echo "后续步骤："
echo "1. 配置域名解析（A记录指向服务器IP）"
echo "2. 配置HTTPS: sudo certbot --nginx -d 你的域名.com"
echo "3. 查看日志: pm2 logs $APP_NAME"
echo "=========================================="
