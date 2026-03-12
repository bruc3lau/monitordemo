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
- Periodically sends a `POST` request with JSON payload to the centralized Backend server.
- 部署在目标节点上用于采集服务器指标的代理（收集 CPU、内存、网络IO 和英伟达显卡使用率），并通过定时 POST 请求发送到后端。

### 2. Backend (Golang)
- A lightweight REST API built using `chi` router.
- Acts as a control plane parsing `POST /api/metrics` from agents and keeping a fast in-memory historical cache for each node.
- Provides RESTful interfaces to get node lists and node metrics data.
- 管理端后端服务，负责使用 `chi` 构建轻量级 REST API，接收各个代理节点发送的资源数据并在内存中缓存历史状态记录，为前端提供接口调用。

### 3. Frontend (React + Vite)
- A premium, dark-themed dashboard frontend styled with Tailwind CSS v4.
- High-performance, animated data visualization built on Recharts.
- Real-time polling capabilities fetching from Backend to reflect live telemetry updates dynamically.
- 炫酷的暗黑风格实时监控大屏前端，基于 Vite + React 搭建，采用 Tailwind CSS v4 样式和 Recharts 进行数据可视化展示。

---

## Screenshots / 界面预览
*(Ensure backend and agent are running to view full charts).*  
*(请确保后端和代理节点均已启动，才能在看板上看到完整图表数据)*。

---

## Quick Start / 快速启动

1. **Start the Backend Management Server / 启动后端管理服务:**
   ```bash
   cd backend
   go run main.go
   ```
   *The server runs on `http://localhost:8080/` by default.* / *(服务默认运行于 `8080` 端口)*。

2. **Start a Local Agent / 启动本地代理采集程序:**
   ```bash
   cd agent
   go run main.go terminal.go -node "my-macbook" -server "http://localhost:8080/api/metrics" -interval 2
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
│   └── main.go
├── backend/              # Golang Management API / Golang 管理端 API
│   └── main.go
└── frontend/             # React Dashboard Application / React 前端项目
    ├── src/
    │   ├── App.tsx       # Main dashboard component / 核心图表控制面板
    │   └── index.css     # Tailwind v4 injection / Tailwind 基础样式
    ├── tailwind.config.js 
    └── postcss.config.js
```
