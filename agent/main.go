package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"monitor-agent/collector"
)

type Payload struct {
	NodeID    string      `json:"node_id"`
	Timestamp int64       `json:"timestamp"`
	Metrics   interface{} `json:"metrics"`
}

func main() {
	serverURL := flag.String("server", "http://localhost:8080/api/metrics", "Backend API endpoint")
	nodeID := flag.String("node", "default-node", "Unique identifier for this machine")
	interval := flag.Int("interval", 5, "Metrics collection interval in seconds")
	token := flag.String("auth-token", "", "Shared secret authentication token")
	flag.Parse()

	log.Printf("Starting monitor agent for node: %s, sending to: %s", *nodeID, *serverURL)

	// Strip "/metrics" from the server URL to get the base API path
	// (Assumes server URL is something like http://localhost:8080/api/metrics)
	baseAPIURL := *serverURL
	if len(baseAPIURL) > 8 && baseAPIURL[len(baseAPIURL)-8:] == "/metrics" {
		baseAPIURL = baseAPIURL[:len(baseAPIURL)-8]
	}

	// Start the TTY reverse WebSocket connection in the background
	go startTerminalClient(baseAPIURL, *nodeID, *token)

	ticker := time.NewTicker(time.Duration(*interval) * time.Second)
	defer ticker.Stop()

	// Graceful shutdown channel
	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	log.Println("Metrics collection started. Press Ctrl+C to stop.")

	for {
		select {
		case <-stopChan:
			log.Println("Received termination signal, shutting down agent...")
			return
		case <-ticker.C:
			metrics, err := collector.CollectAll()
			if err != nil {
				log.Printf("Error collecting metrics: %v", err)
				continue
			}

			payload := Payload{
				NodeID:    *nodeID,
				Timestamp: time.Now().Unix(),
				Metrics:   metrics,
			}

			data, err := json.Marshal(payload)
			if err != nil {
				log.Printf("Error marshaling payload: %v", err)
				continue
			}

			req, err := http.NewRequest("POST", *serverURL, bytes.NewBuffer(data))
			if err != nil {
				log.Printf("Error creating request: %v", err)
				continue
			}
			req.Header.Set("Content-Type", "application/json")
			if *token != "" {
				req.Header.Set("Authorization", *token)
			}

			client := &http.Client{Timeout: 5 * time.Second}
			resp, err := client.Do(req)
			if err != nil {
				log.Printf("Error sending metrics: %v", err)
				continue
			}
			
			if resp.StatusCode != http.StatusOK {
				log.Printf("Unexpected status code from server: %d", resp.StatusCode)
			}
			resp.Body.Close()
		}
	}
}
