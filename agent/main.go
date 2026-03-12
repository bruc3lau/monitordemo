package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"time"

	"monitor-agent/collector"
)

type Payload struct {
	NodeID    string      `json:"node_id"`
	Timestamp int64       `json:"timestamp"`
	Metrics   interface{} `json:"metrics"`
}

func main() {
	serverURL := flag.String("server", "http://localhost:8080/api/metrics", "Backend server API URL")
	nodeID := flag.String("node", "node-1", "Unique node ID")
	interval := flag.Int("interval", 2, "Collection interval in seconds")
	flag.Parse()

	log.Printf("Starting monitor agent for node: %s, sending to: %s", *nodeID, *serverURL)

	// Strip "/metrics" from the server URL to get the base API path
	// (Assumes server URL is something like http://localhost:8080/api/metrics)
	baseAPIURL := *serverURL
	if len(baseAPIURL) > 8 && baseAPIURL[len(baseAPIURL)-8:] == "/metrics" {
		baseAPIURL = baseAPIURL[:len(baseAPIURL)-8]
	}

	// Start the TTY reverse WebSocket connection in the background
	go startTerminalClient(baseAPIURL, *nodeID)

	ticker := time.NewTicker(time.Duration(*interval) * time.Second)
	defer ticker.Stop()

	for range ticker.C {
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

		resp, err := http.Post(*serverURL, "application/json", bytes.NewBuffer(data))
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
