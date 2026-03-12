package main

import (
	"log"
	"net/url"
	"os"
	"os/exec"
	"time"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

func startTerminalClient(serverBaseURL, nodeID string) {
	// Need to parse base URL to switch http:// to ws://
	parsedUrl, err := url.Parse(serverBaseURL)
	if err != nil {
		log.Printf("[TTY] Failed to parse server URL: %v", err)
		return
	}
	
	if parsedUrl.Scheme == "https" {
		parsedUrl.Scheme = "wss"
	} else {
		parsedUrl.Scheme = "ws"
	}
	
	wsURL := parsedUrl.String() + "/nodes/" + nodeID + "/terminal/agent"

	for {
		log.Printf("[TTY] Connecting to %s", wsURL)
		
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			log.Printf("[TTY] Dial failed: %v. Retrying in 5s...", err)
			time.Sleep(5 * time.Second)
			continue
		}
		
		log.Printf("[TTY] Connected to terminal proxy. Starting shell...")
		handleTerminalSession(conn)
		
		log.Printf("[TTY] Session ended. Reconnecting in 5s...")
		time.Sleep(5 * time.Second)
	}
}

func handleTerminalSession(conn *websocket.Conn) {
	defer conn.Close()

	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "bash"
	}

	cmd := exec.Command(shell)
	
	// Create pseudoterminal
	ptmx, err := pty.Start(cmd)
	if err != nil {
		log.Printf("[TTY] Failed to spawn PTY: %v", err)
		return
	}
	defer func() {
		_ = ptmx.Close()
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	}()

	// Agent to Backend (PTY -> WS)
	go func() {
		buf := make([]byte, 1024)
		for {
			n, err := ptmx.Read(buf)
			if err != nil {
				return // pty closed
			}
			err = conn.WriteMessage(websocket.BinaryMessage, buf[:n])
			if err != nil {
				return // ws closed
			}
		}
	}()

	// Backend to Agent (WS -> PTY)
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			return // ws closed
		}
		_, err = ptmx.Write(data)
		if err != nil {
			return // pty closed
		}
	}
}
