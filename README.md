# Monitor Demo 📊

A full-stack, real-time machine metrics management platform built with React, Tailwind CSS, Recharts, and Golang.  
基于 React, Tailwind CSS, Recharts 和 Golang 构建的全栈实时服务器资源监控平台。

---

## Architecture / 架构设计

This project is divided into three main components:  
该项目主要分为三个核心组件：

### 1. Agent (Golang)
- Deployed on target linux/macOS environments to collect telemetry data.
- Collects metrics using `gopsutil` for CPU, Memory, and Network I/O.
- Discovers and tracks NVIDIA GPU metrics by parsing the native `nvidia-smi` command.
- Maintains a secure reverse WebSocket tunnel for Web TTY access.
- Periodically sends a `POST` request with JSON payload to the centralized Backend server using an Auth Token.
- Includes `install.sh` for easy one-click Systemd service deployment on Linux.
- 部署在目标节点上用于采集服务器指标的代理。支持 Web TTY 终端反向代理通信，并提供 `install.sh` Systemd 一键部署脚本。

### 2. Backend (Golang)
- A lightweight REST API built using `chi` router.
- Acts as a control plane parsing `POST` from agents. Includes production middlewares (Recoverer, Logger, Timeout), Graceful Shutdown, and Shared Secret Token Authentication.
- Supports pluggable storage: defaults to an in-memory rolling window cache, or optionally connects to Redis (`-redis-addr`) for persistent metric histories.
- Provides RESTful interfaces to get node lists and node metrics data.
- 核心管理端后端服务，接收代理节点数据并提供接口。具备优雅停机、生产级容灾交互、Token 强鉴权安全保护，支持内存与 Redis 多重持久化数据存储。

### 3. Frontend (React + Vite)
- A premium, dark-themed dashboard frontend styled with Tailwind CSS v4.
- High-performance, animated data visualization built on Recharts.
- Real-time polling capabilities fetching from Backend to reflect live telemetry updates dynamically.
- Features a built-in Xterm.js Web PTY Terminal to execute commands securely on remote agents.
- 炫酷的暗黑风格实时监控大屏前端，采用 Tailwind CSS v4 + Recharts。独家接入 Xterm.js 提供安全远程服务器 Web 终端操控。

---

## Screenshots / 界面预览
*(Ensure backend and agent are running to view full charts).*  
*(请确保后端和代理节点均已启动，才能在看板上看到完整图表数据)*。

---

## Quick Start / 快速启动

1. **Start the Backend Management Server / 启动后端管理服务:**
   ```bash
   cd backend
   go run . -redis-addr=localhost:6379 -token="my-super-secret-token"
   ```
   *The server runs on `http://localhost:8080/` by default.* / *(服务默认运行于 `8080` 端口)*。

2. **Start a Local Agent / 启动本地代理采集程序:**
   ```bash
   cd agent
   go run . -node "my-macbook" -server "http://localhost:8080/api/metrics" -interval 2 -auth-token="my-super-secret-token"
   ```

3. **Start the Frontend Dashboard / 启动前端数据大屏:**
   ```bash
   cd frontend
   npm run dev
   ```
   *Visit `http://localhost:5173/` in your browser.* / *(在浏览器访问 `http://localhost:5173/` 进行查看)*。

---

## Project Structure / 项目结构

```text
monitordemo/
├── agent/                # Golang metrics collector / Golang 状态采集运行器 
│   ├── collector/        # CPU, Mem, Net, GPU gathering logic / 各项资源读取逻辑
│   ├── install.sh        # Systemd service install script / Systemd 注册自动启动服务脚本
│   ├── terminal.go       # PTY Web TTY client / Web TTY 反向通信代理
│   └── main.go
├── backend/              # Golang Management API / Golang 管理端 API
│   ├── storage.go        # Memory & Redis storage interfaces / 内存记录与 Redis 持久化接口
│   ├── terminal.go       # WebSocket proxy definition / WebSocket 路由代理层
│   └── main.go
├── frontend/             # React Dashboard Application / React 前端项目
│   ├── src/
│   │   ├── App.tsx       # Main dashboard component / 核心图表控制面板
│   │   ├── TerminalPanel.tsx # Xterm.js component / 终端 UI Web交互组件
│   │   └── index.css     # Tailwind v4 injection / Tailwind 基础样式
│   ├── tailwind.config.js 
│   └── postcss.config.js
├── Makefile              # Global Build & Run commands / 全局跨平台编译协助脚本
```
