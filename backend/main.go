package main

import (
	"context"
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
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

var (
	store Store
	authToken string
)

// Simple Auth Middleware
func requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if authToken == "" {
			next.ServeHTTP(w, r)
			return
		}

		// Check Authorization Header initially
		token := r.Header.Get("Authorization")
		if token == "" {
			// Fallback to URL Query parameter (often used by WebSockets)
			token = r.URL.Query().Get("token")
		}

		if token != authToken {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	redisAddr := flag.String("redis-addr", "", "Redis server address (e.g. localhost:6379)")
	// redisPassword := flag.String("redis-pass", "", "Redis server password") // Not currently implemented in NewRedisStore
	tokenFlag := flag.String("token", "", "Shared secret authentication token (optional)")
	flag.Parse()

	authToken = *tokenFlag
	if authToken != "" {
		log.Println("Authentication enabled. Agents and clients must provide the correct token.")
	} else {
		log.Println("WARNING: Authentication is disabled! Not recommended for production.")
	}

	if *redisAddr != "" {
		var err error
		store, err = NewRedisStore(*redisAddr)
		if err != nil {
			log.Fatalf("Failed to initialize Redis store: %v", err)
		}
	} else {
		store = NewMemoryStore()
	}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Protected Routes Group
	r.Group(func(r chi.Router) {
		r.Use(requireAuth)
		
		r.Post("/api/metrics", handlePostMetrics)
		r.Get("/api/nodes", handleGetNodes)
		r.Get("/api/nodes/{id}/metrics", handleGetNodeMetrics)
		
		// WebSocket Terminal Routes (auth passes via query string ?token=xxx)
		r.Get("/api/nodes/{id}/terminal/agent", handleAgentTerminalWS)
		r.Get("/api/nodes/{id}/terminal/client", handleClientTerminalWS)
	})

	srv := &http.Server{
		Addr:    ":8080",
		Handler: r,
	}

	// Graceful shutdown channel
	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Println("Server starting on :8080")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-stopChan
	log.Println("Shutting down server...")

	// Create a deadline to wait for.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Shut down WS connections
	sessionsMutex.Lock()
	for _, session := range sessions {
		session.Mutex.Lock()
		if session.AgentConn != nil {
			_ = session.AgentConn.Close()
		}
		if session.ClientConn != nil {
			_ = session.ClientConn.Close()
		}
		session.Mutex.Unlock()
	}
	sessionsMutex.Unlock()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server gracefully stopped")
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
