#!/bin/bash

# 安装脚本：将 Monitor Agent 安装为 systemd 系统服务
# 适用于 CentOS 7+ 和 Ubuntu 16.04+

set -e

# 确保以 root 权限执行
if [ "$EUID" -ne 0 ]; then 
  echo "请使用 root 权限运行此脚本 (例如: sudo ./install.sh)"
  exit 1
fi

# 检查二进制文件是否存在
if [ ! -f "./monitor-agent" ]; then
    echo "未找到 monitor-agent 可执行文件！"
    echo "请先在有 Go 环境的机器上执行 'make build-agent' 编译出 linux 二进制文件，并与其放在同一目录下。"
    exit 1
fi

# 提示输入后端服务器地址
read -p "请输入 Monitor Backend 服务器的 API 地址 (例如 http://192.168.1.100:8080): " SERVER_URL
if [ -z "$SERVER_URL" ]; then
    echo "错误：必须指定后端服务器地址！"
    exit 1
fi

# 如果结尾没有 /api/metrics，自动补全 (稍微容错一下)
if [[ "$SERVER_URL" != *"/api/metrics"* ]]; then
    # 移除末尾的斜杠
    SERVER_URL="${SERVER_URL%/}"
    SERVER_URL="$SERVER_URL/api/metrics"
fi

echo ">> 准备将 Agent 安装到 /usr/local/bin/"
cp ./monitor-agent /usr/local/bin/monitor-agent
chmod +x /usr/local/bin/monitor-agent

echo ">> 正在生成 systemd 服务配置文件 /etc/systemd/system/monitor-agent.service"
cat <<EOF > /etc/systemd/system/monitor-agent.service
[Unit]
Description=Monitor Agent Service
After=network.target

[Service]
Type=simple
User=root
# 使用 %H 自动获取主机名作为 node-id
ExecStart=/usr/local/bin/monitor-agent -node "%H" -server "${SERVER_URL}" -interval 2
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo ">> 重新加载 systemd 配置"
systemctl daemon-reload

echo ">> 设置开机启动并立即启动服务"
systemctl enable monitor-agent
systemctl restart monitor-agent

echo "======================================"
echo "安装完成！Monitor Agent 已作为后台服务运行。"
echo "您可以通过以下命令查看运行状态："
echo "  systemctl status monitor-agent"
echo "您可以通过以下命令查看实时日志："
echo "  journalctl -u monitor-agent -f"
echo "======================================"
