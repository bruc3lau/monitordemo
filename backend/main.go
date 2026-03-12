package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
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

// keep up to 100 metrics per node (e.g. at 2s interval = 200s history)
const MaxHistory = 100

var store Store

func main() {
	redisAddr := flag.String("redis-addr", "", "Redis address (e.g. localhost:6379) to use Redis backend. If empty, uses in-memory storage.")
	flag.Parse()

	var err error
	if *redisAddr != "" {
		log.Printf("Connecting to Redis datastore at %s...", *redisAddr)
		store, err = NewRedisStore(*redisAddr)
		if err != nil {
			log.Fatalf("Failed to initialize RedisStore: %v", err)
		}
		log.Println("Successfully connected to Redis.")
	} else {
		log.Println("Using in-memory datastore. Metrics will be lost on backend restart.")
		store = NewMemoryStore()
	}

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

	if err := store.SaveMetric(payload); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func handleGetNodes(w http.ResponseWriter, r *http.Request) {
	nodes, err := store.GetNodes()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(nodes)
}

func handleGetNodeMetrics(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	node, err := store.GetNodeMetrics(id)
	if err != nil {
		if err.Error() == "node not found" {
			http.NotFound(w, r)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(node)
}
