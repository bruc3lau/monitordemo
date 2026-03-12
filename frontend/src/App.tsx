import { useEffect, useState } from 'react';
import { Activity, Server, Cpu, HardDrive, Network } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

import { TerminalPanel } from './TerminalPanel';

interface Node {
  node_id: string;
  last_updated: string;
  status: 'online' | 'offline';
}

interface GPUMetrics {
  index: number;
  name: string;
  utilization: number;
  memory_used: number;
  memory_total: number;
}

interface NetworkStats {
  bytes_recv_per_sec: number;
  bytes_sent_per_sec: number;
}

interface MetricPayload {
  timestamp: number;
  metrics: {
    cpu: number;
    memory: { total: number; used: number; usedPercent: number };
    network: NetworkStats;
    gpu?: GPUMetrics[];
  };
}

interface NodeMetrics {
  node_id: string;
  last_updated: string;
  history: MetricPayload[];
}

const API_URL = 'http://localhost:8080/api';

function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [nodeData, setNodeData] = useState<NodeMetrics | null>(null);

  const [activeTab, setActiveTab] = useState<'metrics' | 'terminal'>('metrics');

  const fetchNodes = async () => {
    try {
      const res = await fetch(`${API_URL}/nodes`);
      if (res.ok) {
        const data = await res.json();
        const validData = Array.isArray(data) ? data : [];
        setNodes(validData);
        if (validData.length > 0 && !selectedNode) {
          setSelectedNode(validData[0].node_id);
        }
      }
    } catch (e) {
      console.error("Failed to fetch nodes", e);
    }
  };

  const fetchNodeMetrics = async (nodeId: string) => {
    try {
      const res = await fetch(`${API_URL}/nodes/${nodeId}/metrics`);
      if (res.ok) {
        const data = await res.json();
        setNodeData(data);
      }
    } catch (e) {
      console.error("Failed to fetch metrics for node", e);
    }
  };

  useEffect(() => {
    fetchNodes();
    const interval = setInterval(fetchNodes, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedNode) return;
    fetchNodeMetrics(selectedNode);
    const interval = setInterval(() => fetchNodeMetrics(selectedNode), 2000);
    return () => clearInterval(interval);
  }, [selectedNode]);

  const getChartData = () => {
    if (!nodeData || !nodeData.history) return [];
    return nodeData.history.map(h => ({
      time: new Date(h.timestamp * 1000).toLocaleTimeString([], { hour12: false }),
      cpu: h.metrics.cpu,
      mem: h.metrics.memory ? h.metrics.memory.usedPercent : 0,
      netDown: h.metrics.network ? (h.metrics.network.bytes_recv_per_sec / 1024 / 1024).toFixed(2) : 0, // MB/s
      netUp: h.metrics.network ? (h.metrics.network.bytes_sent_per_sec / 1024 / 1024).toFixed(2) : 0, // MB/s
      gpu: (h.metrics.gpu && h.metrics.gpu.length > 0) ? h.metrics.gpu[0].utilization : 0,
    }));
  };

  const chartData = getChartData();
  const latestMetric = nodeData?.history?.[nodeData.history.length - 1]?.metrics;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8 font-sans selection:bg-indigo-500/30">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center space-x-3 text-indigo-400">
            <Activity size={32} />
            <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md">Monitor Platform</h1>
          </div>
          <div className="text-sm text-slate-400 bg-slate-900/50 px-4 py-2 rounded-full border border-slate-800 shadow-sm backdrop-blur-md">
            Nodes Online: <span className="text-emerald-400 font-semibold">{nodes.filter(n => n.status === 'online').length}</span>
          </div>
        </header>

        {/* Server List */}
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {nodes.map(node => (
            <button
              key={node.node_id}
              onClick={() => setSelectedNode(node.node_id)}
              className={`flex items-center space-x-3 p-4 rounded-xl border transition-all duration-300 transform outline-none focus:ring-2 focus:ring-indigo-500 ${
                selectedNode === node.node_id 
                  ? 'bg-indigo-600/20 border-indigo-500/50 ring-1 ring-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]' 
                  : 'bg-slate-900/40 border-slate-800 hover:bg-slate-800/60 hover:border-slate-700'
              }`}
            >
              <div className="relative">
                <Server size={24} className={selectedNode === node.node_id ? 'text-indigo-400' : 'text-slate-400'} />
                <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-950 ${
                  node.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'
                }`} />
              </div>
              <div className="text-left">
                <div className="font-semibold text-sm">{node.node_id}</div>
                <div className="text-xs text-slate-500 capitalize">{node.status}</div>
              </div>
            </button>
          ))}
          {nodes.length === 0 && (
            <div className="col-span-full text-center text-slate-500 py-8 bg-slate-900/20 rounded-xl border border-dashed border-slate-800">
              No nodes connected. Start an agent to see data.
            </div>
          )}
        </div>

        {/* Dashboard Content */}
        {selectedNode && nodeData && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500 ease-out">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <h2 className="text-2xl font-semibold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                  {selectedNode}
                </h2>
                <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
                  <button 
                    onClick={() => setActiveTab('metrics')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'metrics' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Metrics
                  </button>
                  <button 
                    onClick={() => setActiveTab('terminal')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'terminal' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Terminal
                  </button>
                </div>
              </div>
              <span className="text-xs text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                Live Updates • 2s Interval
              </span>
            </div>

            {activeTab === 'terminal' ? (
              <TerminalPanel nodeId={selectedNode} />
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* CPU Card */}
              <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl p-6 border border-slate-800 shadow-xl overflow-hidden relative group hover:border-indigo-500/30 transition-colors">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Cpu size={100} />
                </div>
                <div className="flex items-center space-x-3 text-slate-400 mb-4 z-10 relative">
                  <Cpu size={20} className="text-indigo-400" />
                  <span className="font-medium">CPU Usage</span>
                </div>
                <div className="text-4xl font-bold tracking-tight text-white z-10 relative">
                  {latestMetric ? latestMetric.cpu.toFixed(1) : 0}%
                </div>
              </div>

              {/* Memory Card */}
              <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl p-6 border border-slate-800 shadow-xl overflow-hidden relative group hover:border-fuchsia-500/30 transition-colors">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <HardDrive size={100} />
                </div>
                <div className="flex items-center space-x-3 text-slate-400 mb-4 z-10 relative">
                  <HardDrive size={20} className="text-fuchsia-400" />
                  <span className="font-medium">Memory Usage</span>
                </div>
                <div className="text-4xl font-bold tracking-tight text-white flex items-baseline space-x-2 z-10 relative">
                  <span>{latestMetric ? latestMetric.memory.usedPercent.toFixed(1) : 0}%</span>
                  <span className="text-sm font-normal text-slate-500">
                    {latestMetric ? (latestMetric.memory.used / 1024 / 1024 / 1024).toFixed(1) : 0} GB
                  </span>
                </div>
              </div>

              {/* Network Card */}
              <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl p-6 border border-slate-800 shadow-xl overflow-hidden relative group hover:border-cyan-500/30 transition-colors">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Network size={100} />
                </div>
                <div className="flex items-center space-x-3 text-slate-400 mb-4 z-10 relative">
                  <Network size={20} className="text-cyan-400" />
                  <span className="font-medium">Network I/O</span>
                </div>
                <div className="space-y-1 z-10 relative">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">⬇ Rx</span>
                    <span className="font-bold text-white">
                      {latestMetric ? (latestMetric.network.bytes_recv_per_sec / 1024 / 1024).toFixed(2) : 0} MB/s
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">⬆ Tx</span>
                    <span className="font-bold text-white">
                      {latestMetric ? (latestMetric.network.bytes_sent_per_sec / 1024 / 1024).toFixed(2) : 0} MB/s
                    </span>
                  </div>
                </div>
              </div>

              {/* GPU Card */}
              <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl p-6 border border-slate-800 shadow-xl overflow-hidden relative group hover:border-emerald-500/30 transition-colors">
                 <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Activity size={100} />
                </div>
                <div className="flex items-center space-x-3 text-slate-400 mb-4 z-10 relative">
                  <Activity size={20} className="text-emerald-400" />
                  <span className="font-medium">NVIDIA GPU</span>
                </div>
                <div className="text-4xl font-bold tracking-tight text-white flex items-baseline space-x-2 z-10 relative">
                  <span>
                    {(latestMetric?.gpu && latestMetric.gpu.length > 0) ? latestMetric.gpu[0].utilization : 0}%
                  </span>
                  {latestMetric?.gpu && latestMetric.gpu.length > 0 && (
                    <span className="text-sm font-normal text-slate-500 truncate max-w-[100px] inline-block" title={latestMetric.gpu[0].name}>
                      {latestMetric.gpu[0].name.split(' ')[1] || 'GPU'}
                    </span>
                  )}
                </div>
                {!latestMetric?.gpu && (
                   <div className="text-sm text-slate-500 mt-2 z-10 relative">No GPU detected</div>
                )}
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* CPU & Memory Chart */}
              <div className="bg-slate-900/50 backdrop-blur-xl p-6 rounded-2xl border border-slate-800 shadow-lg">
                <h3 className="text-lg font-medium mb-6 text-slate-300">System Resources (%)</h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc', borderRadius: '0.5rem' }} 
                        itemStyle={{ color: '#e2e8f0' }}
                      />
                      <Line type="monotone" dataKey="cpu" name="CPU" stroke="#818cf8" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="mem" name="Memory" stroke="#e879f9" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Network Chart */}
              <div className="bg-slate-900/50 backdrop-blur-xl p-6 rounded-2xl border border-slate-800 shadow-lg">
                <h3 className="text-lg font-medium mb-6 text-slate-300">Network Traffic (MB/s)</h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc', borderRadius: '0.5rem' }} 
                        itemStyle={{ color: '#e2e8f0' }}
                      />
                      <Line type="monotone" dataKey="netDown" name="Download" stroke="#22d3ee" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="netUp" name="Upload" stroke="#94a3b8" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
            </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
