import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';

interface TerminalPanelProps {
  nodeId: string;
  authToken: string;
}

const WS_URL_BASE = 'ws://localhost:8080/api/nodes';

export function TerminalPanel({ nodeId, authToken }: TerminalPanelProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js
    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#0f172a', // Tailwind slate-950
        foreground: '#f8fafc', // Tailwind slate-50
        cursor: '#818cf8',     // Tailwind indigo-400
        selectionBackground: 'rgba(99, 102, 241, 0.3)',
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
    });
    
    xtermRef.current = term;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    term.writeln(`Connecting to ${nodeId} terminal...`);

    // Connect WebSocket
    const wsUrl = authToken 
      ? `${WS_URL_BASE}/${nodeId}/terminal/client?token=${encodeURIComponent(authToken)}`
      : `${WS_URL_BASE}/${nodeId}/terminal/client`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      term.writeln(`[Connected to Backend Proxy]`);
      // Optional: send a newline to prompt the agent to resend the shell prompt
      ws.send('\r'); 
    };

    ws.onmessage = async (event) => {
      let data = event.data;
      if (data instanceof Blob) {
        data = await data.text();
      }
      term.write(data);
    };

    ws.onclose = () => {
      term.writeln('\r\n[Disconnected]');
    };

    ws.onerror = () => {
      term.writeln('\r\n[WebSocket Error]');
    };

    // Forward keystrokes to WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      ws.close();
      term.dispose();
    };
  }, [nodeId]);

  return (
    <div className="w-full h-[500px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-2xl p-4">
      <div className="h-full w-full" ref={terminalRef} />
    </div>
  );
}
