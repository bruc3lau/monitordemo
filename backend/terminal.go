package main

import (
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all for demo
	},
}

// Struct to hold paired connections
type TerminalSession struct {
	AgentConn  *websocket.Conn
	ClientConn *websocket.Conn
	Mutex      sync.Mutex
}

var (
	sessions      = make(map[string]*TerminalSession)
	sessionsMutex sync.RWMutex
)

func handleAgentTerminalWS(w http.ResponseWriter, r *http.Request) {
	nodeID := chi.URLParam(r, "id")

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Agent WS upgrade failed for %s: %v", nodeID, err)
		return
	}
	defer conn.Close()

	log.Printf("Agent %s connected to Terminal Proxy", nodeID)

	sessionsMutex.Lock()
	session, exists := sessions[nodeID]
	if !exists {
		session = &TerminalSession{}
		sessions[nodeID] = session
	}
	session.Mutex.Lock()
	// Kick old agent if any
	if session.AgentConn != nil {
		session.AgentConn.Close()
	}
	session.AgentConn = conn
	session.Mutex.Unlock()
	sessionsMutex.Unlock()

	defer func() {
		session.Mutex.Lock()
		if session.AgentConn == conn {
			session.AgentConn = nil
		}
		session.Mutex.Unlock()
		log.Printf("Agent %s disconnected from Terminal Proxy", nodeID)
	}()

	// Implement keepalive on agent connection
	pingTicker := time.NewTicker(30 * time.Second)
	defer pingTicker.Stop()

	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	go func() {
		for range pingTicker.C {
			if err := conn.WriteControl(websocket.PingMessage, []byte{}, time.Now().Add(5*time.Second)); err != nil {
				conn.Close()
				return
			}
		}
	}()

	// Keep connection alive and pipe agent -> client
	for {
		messageType, data, err := conn.ReadMessage()
		if err != nil {
			break
		}

		session.Mutex.Lock()
		clientConn := session.ClientConn
		session.Mutex.Unlock()

		if clientConn != nil {
			err = clientConn.WriteMessage(messageType, data)
			if err != nil {
				log.Printf("Failed writing to client for %s: %v", nodeID, err)
			}
		}
	}
}

func handleClientTerminalWS(w http.ResponseWriter, r *http.Request) {
	nodeID := chi.URLParam(r, "id")

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Client WS upgrade failed for %s: %v", nodeID, err)
		return
	}
	defer conn.Close()

	log.Printf("Client connected to Terminal Proxy for node %s", nodeID)

	sessionsMutex.Lock()
	session, exists := sessions[nodeID]
	if !exists {
		session = &TerminalSession{}
		sessions[nodeID] = session
	}
	session.Mutex.Lock()
	if session.ClientConn != nil {
		session.ClientConn.Close()
	}
	session.ClientConn = conn
	session.Mutex.Unlock()
	sessionsMutex.Unlock()

	// Notify agent (if online) to spawn/refresh a shell or let the user know they are connected.
	// We'll rely on the client pressing enter or agent detecting the connection.
	
	defer func() {
		session.Mutex.Lock()
		if session.ClientConn == conn {
			session.ClientConn = nil
		}
		session.Mutex.Unlock()
		log.Printf("Client disconnected from Terminal Proxy for node %s", nodeID)
	}()

	// Implement keepalive on client connection
	pingTicker := time.NewTicker(30 * time.Second)
	defer pingTicker.Stop()

	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	go func() {
		for range pingTicker.C {
			if err := conn.WriteControl(websocket.PingMessage, []byte{}, time.Now().Add(5*time.Second)); err != nil {
				conn.Close()
				return
			}
		}
	}()

	// Pipe client -> agent
	for {
		messageType, data, err := conn.ReadMessage()
		if err != nil {
			break
		}

		session.Mutex.Lock()
		agentConn := session.AgentConn
		session.Mutex.Unlock()

		if agentConn != nil {
			err = agentConn.WriteMessage(messageType, data)
			if err != nil {
				log.Printf("Failed writing to agent for %s: %v", nodeID, err)
			}
		} else {
			// Agent offline
			conn.WriteMessage(websocket.TextMessage, []byte("\r\n[Backend] Agent is currently offline or not connected to the Terminal WS.\r\n"))
		}
	}
}
