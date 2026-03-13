package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"monitor-agent/collector"
)

type Payload struct {
	NodeID    string      `json:"node_id"`
	IP        string      `json:"ip,omitempty"`
	Timestamp int64       `json:"timestamp"`
	Metrics   interface{} `json:"metrics"`
}

func getPreferredIP() string {
	interfaces, err := net.Interfaces()
	if err != nil {
		return ""
	}

	var ip192 string
	var fallback string

	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() || ip.To4() == nil {
				continue
			}
			ipStr := ip.String()

			if strings.Contains(iface.Name, "eth1") || strings.Contains(iface.Name, "eh1") || strings.Contains(iface.Name, "en1") {
				return ipStr
			}
			if strings.HasPrefix(ipStr, "192.") {
				ip192 = ipStr
			}
			if fallback == "" && !strings.HasPrefix(ipStr, "172.") {
				// avoid docker bridge IPs if possible for fallback
				fallback = ipStr
			} else if fallback == "" {
				fallback = ipStr
			}
		}
	}

	if ip192 != "" {
		return ip192
	}
	return fallback
}

func main() {
	defaultNodeID := "default-node"
	if hostname, err := os.Hostname(); err == nil && hostname != "" {
		defaultNodeID = hostname
	}

	serverURL := flag.String("server", "http://localhost:8080/api/metrics", "Backend API endpoint")
	nodeID := flag.String("node", defaultNodeID, "Unique identifier for this machine")
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
				IP:        getPreferredIP(),
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
