package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

type Payload struct {
	NodeID    string      `json:"node_id"`
	Timestamp int64       `json:"timestamp"`
	Metrics   interface{} `json:"metrics"`
}

type NodeMetrics struct {
	NodeID      string    `json:"node_id"`
	LastUpdated time.Time `json:"last_updated"`
	History     []Payload `json:"history"`
}

var (
	metricsStore = make(map[string]*NodeMetrics)
	storeMutex   sync.RWMutex
)

// keep up to 100 metrics per node (e.g. at 2s interval = 200s history)
const MaxHistory = 100

func main() {
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
	}))

	r.Post("/api/metrics", handlePostMetrics)
	r.Get("/api/nodes", handleGetNodes)
	r.Get("/api/nodes/{id}/metrics", handleGetNodeMetrics)

	log.Println("Server starting on :8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatal(err)
	}
}

func handlePostMetrics(w http.ResponseWriter, r *http.Request) {
	var payload Payload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	storeMutex.Lock()
	node, exists := metricsStore[payload.NodeID]
	if !exists {
		node = &NodeMetrics{
			NodeID:  payload.NodeID,
			History: make([]Payload, 0),
		}
		metricsStore[payload.NodeID] = node
	}

	node.LastUpdated = time.Now()
	node.History = append(node.History, payload)
	
	if len(node.History) > MaxHistory {
		node.History = node.History[len(node.History)-MaxHistory:]
	}
	storeMutex.Unlock()

	w.WriteHeader(http.StatusOK)
}

func handleGetNodes(w http.ResponseWriter, r *http.Request) {
	storeMutex.RLock()
	defer storeMutex.RUnlock()

	var nodes []map[string]interface{}
	for id, node := range metricsStore {
		status := "offline"
		if time.Since(node.LastUpdated) < 10*time.Second {
			status = "online"
		}
		nodes = append(nodes, map[string]interface{}{
			"node_id":      id,
			"last_updated": node.LastUpdated,
			"status":       status,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(nodes)
}

func handleGetNodeMetrics(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	storeMutex.RLock()
	node, exists := metricsStore[id]
	storeMutex.RUnlock()

	if !exists {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(node)
}
