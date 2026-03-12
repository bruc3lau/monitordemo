import { useEffect, useState } from 'react';
import { Activity, Cpu, HardDrive, Network, Server, Search } from 'lucide-react';
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
  ip: string;
  last_updated: string;
  status: 'online' | 'offline';
  latest_metrics?: any;
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
  const [authToken, setAuthToken] = useState<string>(() => {
    return localStorage.getItem('monitorAuthToken') || '';
  });
  const [isLoggedOut, setIsLoggedOut] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sidebar resizing state
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);

  // Sync token changes to localStorage
  useEffect(() => {
    localStorage.setItem('monitorAuthToken', authToken);
  }, [authToken]);

  const fetchNodes = async () => {
    try {
      const res = await fetch(`${API_URL}/nodes`, {
        headers: authToken ? { 'Authorization': authToken } : {}
      });
      if (res.status === 401) {
        setIsLoggedOut(true);
        return;
      }
      if (res.ok) {
        setIsLoggedOut(false);
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
      const res = await fetch(`${API_URL}/nodes/${nodeId}/metrics`, {
        headers: authToken ? { 'Authorization': authToken } : {}
      });
      if (res.status === 401) {
        setIsLoggedOut(true);
        return;
      }
      if (res.ok) {
        setIsLoggedOut(false);
        const data = await res.json();
        setNodeData(data);
      }
    } catch (e) {
      console.error("Failed to fetch metrics for node", e);
    }
  };

  useEffect(() => {
    // If we have a new token, we should always try fetching again
    fetchNodes();
    const interval = setInterval(fetchNodes, 5000);
    return () => clearInterval(interval);
  }, [authToken]); // removed isLoggedOut dependency so it can recover

  useEffect(() => {
    if (!selectedNode) return;
    
    fetchNodeMetrics(selectedNode);
    const interval = setInterval(() => fetchNodeMetrics(selectedNode), 2000);
    return () => clearInterval(interval);
  }, [selectedNode, authToken]); // removed isLoggedOut dependency so it can recover

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

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      let newWidth = e.clientX;
      if (newWidth < 250) newWidth = 250;
      if (newWidth > 600) newWidth = 600;
      
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const chartData = getChartData();
  const latestMetric = nodeData?.history?.[nodeData.history.length - 1]?.metrics;

  const filteredNodes = nodes.filter(node => 
    node.node_id.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (node.ip && node.ip.includes(searchQuery))
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30 flex flex-col">
      {/* Top Navigation Bar */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50 flex-none">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-500/20 p-2 rounded-lg border border-indigo-500/30">
              <Activity className="text-indigo-400" size={24} />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent tracking-tight">
              Monitor Platform
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <input 
              type="password" 
              placeholder="Admin Token..." 
              value={authToken}
              onChange={e => setAuthToken(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 w-48 transition-colors hover:border-slate-600"
            />
            <div className="text-sm text-slate-400 bg-slate-900/50 px-4 py-2 rounded-full border border-slate-800 shadow-sm backdrop-blur-md">
              <span className="text-emerald-400 font-semibold">{nodes.filter(n => n.status === 'online').length}</span> Online
            </div>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Node List */}
        <aside 
          style={{ width: `${sidebarWidth}px` }}
          className="relative border-r border-slate-800 bg-slate-900/20 flex flex-col flex-none transition-none shadow-xl z-40"
        >
          {/* Resize Handle */}
          <div 
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-500 z-50 transition-colors"
            onMouseDown={() => setIsResizing(true)}
          />

          <div className="p-4 border-b border-slate-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Search nodes by ID or IP..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950/50 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-600"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            {filteredNodes.length > 0 ? (
              filteredNodes.map(node => (
                <button
                  key={node.node_id}
                  onClick={() => setSelectedNode(node.node_id)}
                  className={`w-full flex items-center p-3 rounded-lg border transition-all duration-200 text-left outline-none ${
                    selectedNode === node.node_id 
                      ? 'bg-indigo-600/10 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                      : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700'
                  }`}
                >
                  <div className="relative flex-shrink-0 mr-3">
                    <Server size={20} className={selectedNode === node.node_id ? 'text-indigo-400' : 'text-slate-400'} />
                    <span className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
                      node.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                       <span className="font-medium text-sm text-slate-200 truncate pr-2">{node.node_id}</span>
                       <span className="text-[10px] text-slate-500 font-mono tracking-tighter">{node.ip || 'Unknown'}</span>
                    </div>
                    
                    {/* Summary Metrics */}
                    {node.latest_metrics && node.status === 'online' ? (
                       <div className="flex flex-col space-y-1.5 mt-2">
                          <div className="flex items-center gap-2">
                             <span className="text-[10px] text-slate-500 w-6">CPU</span>
                             <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${node.latest_metrics.cpu > 80 ? 'bg-rose-500' : 'bg-indigo-400'}`} 
                                  style={{ width: `${Math.min(100, Math.max(0, node.latest_metrics.cpu || 0))}%` }} 
                                />
                             </div>
                             <span className="text-[10px] text-slate-400 w-8 text-right font-mono">
                               {(node.latest_metrics.cpu || 0).toFixed(0)}%
                             </span>
                          </div>
                          <div className="flex items-center gap-2">
                             <span className="text-[10px] text-slate-500 w-6">MEM</span>
                             <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${node.latest_metrics.memory?.usedPercent > 80 ? 'bg-orange-500' : 'bg-fuchsia-400'}`} 
                                  style={{ width: `${Math.min(100, Math.max(0, node.latest_metrics.memory?.usedPercent || 0))}%` }} 
                                />
                             </div>
                             <span className="text-[10px] text-slate-400 w-8 text-right font-mono">
                               {(node.latest_metrics.memory?.usedPercent || 0).toFixed(0)}%
                             </span>
                          </div>
                       </div>
                    ) : (
                       <div className="text-[11px] text-slate-600 italic mt-1 bg-slate-900/50 py-1 px-2 rounded-md text-center border border-slate-800/50">
                          {node.status === 'offline' ? 'Node is offline' : 'Waiting for metrics...'}
                       </div>
                    )}
                  </div>
                </button>
              ))
            ) : (
              <div className="text-center py-10 px-4 text-slate-500 text-sm">
                {nodes.length === 0 ? "No nodes connected." : "No nodes match your search."}
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-slate-950 p-6 custom-scrollbar">
          {isLoggedOut ? (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
              <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mb-6 border border-rose-500/20">
                <Network className="text-rose-500" size={32} />
              </div>
              <h2 className="text-2xl font-bold text-rose-400 mb-3">Unauthorized Access</h2>
              <p className="text-slate-400 leading-relaxed">
                Please enter a valid Admin Token in the top right navigation bar to unlock the dashboard and view live telemetry data.
              </p>
            </div>
          ) : !selectedNode ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 space-y-4">
               <Server size={48} className="text-slate-800" />
               <p className="text-lg">Select a node from the sidebar to view detailed metrics</p>
            </div>
          ) : nodeData ? (
            <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500 ease-out">
              {/* Header inside Content */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/40 p-5 rounded-2xl border border-slate-800">
                <div className="flex items-center space-x-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">
                      {selectedNode}
                    </h2>
                    <div className="text-sm text-slate-400 mt-1 flex items-center space-x-2">
                       <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                       <span>Connected • {nodes.find(n => n.node_id === selectedNode)?.ip || 'Unknown IP'}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800 shadow-inner">
                    <button 
                      onClick={() => setActiveTab('metrics')}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'metrics' ? 'bg-indigo-500/20 text-indigo-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Metrics
                    </button>
                    <button 
                      onClick={() => setActiveTab('terminal')}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'terminal' ? 'bg-indigo-500/20 text-indigo-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Terminal
                    </button>
                  </div>
                </div>
              </div>

              {activeTab === 'terminal' ? (
                <div className="bg-slate-950 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                  <TerminalPanel nodeId={selectedNode} authToken={authToken} />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              
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
                  {(latestMetric?.cpu || 0).toFixed(1)}%
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
                  <span>{(latestMetric?.memory?.usedPercent || 0).toFixed(1)}%</span>
                  <span className="text-sm font-normal text-slate-500">
                    {((latestMetric?.memory?.used || 0) / 1024 / 1024 / 1024).toFixed(1)} GB
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
                      {((latestMetric?.network?.bytes_recv_per_sec || 0) / 1024 / 1024).toFixed(2)} MB/s
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">⬆ Tx</span>
                    <span className="font-bold text-white">
                      {((latestMetric?.network?.bytes_sent_per_sec || 0) / 1024 / 1024).toFixed(2)} MB/s
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
                <div className="h-[300px] w-full min-h-[300px]">
                  <ResponsiveContainer width="100%" height={300}>
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
                <div className="h-[300px] w-full min-h-[300px]">
                  <ResponsiveContainer width="100%" height={300}>
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
          ) : null}
        </main>
      </div>
    </div>
  );
}

export default App;
