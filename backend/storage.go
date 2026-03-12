package main

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// Store defines the interface for saving and retrieving metrics
type Store interface {
	SaveMetric(payload Payload) error
	GetNodes() ([]map[string]interface{}, error)
	GetNodeMetrics(nodeID string) (*NodeMetrics, error)
}

// -------------------------------------------------------------
// MemoryStore implementation
// -------------------------------------------------------------

type MemoryStore struct {
	data  map[string]*NodeMetrics
	mutex sync.RWMutex
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		data: make(map[string]*NodeMetrics),
	}
}

func (m *MemoryStore) SaveMetric(payload Payload) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	node, exists := m.data[payload.NodeID]
	if !exists {
		node = &NodeMetrics{
			NodeID:  payload.NodeID,
			History: make([]Payload, 0),
		}
		m.data[payload.NodeID] = node
	}

	node.LastUpdated = time.Now()
	node.History = append(node.History, payload)

	if len(node.History) > MaxHistory {
		node.History = node.History[len(node.History)-MaxHistory:]
	}
	return nil
}

func (m *MemoryStore) GetNodes() ([]map[string]interface{}, error) {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	var nodes []map[string]interface{}
	for id, node := range m.data {
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

	// Sort nodes by ID for consistent ordering
	sort.Slice(nodes, func(i, j int) bool {
		return nodes[i]["node_id"].(string) < nodes[j]["node_id"].(string)
	})

	return nodes, nil
}

func (m *MemoryStore) GetNodeMetrics(nodeID string) (*NodeMetrics, error) {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	node, exists := m.data[nodeID]
	if !exists {
		return nil, fmt.Errorf("node not found")
	}
	return node, nil
}

// -------------------------------------------------------------
// RedisStore implementation
// -------------------------------------------------------------

type RedisStore struct {
	client *redis.Client
}

func NewRedisStore(addr string) (*RedisStore, error) {
	client := redis.NewClient(&redis.Options{
		Addr: addr,
	})

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, err
	}

	return &RedisStore{client: client}, nil
}

func (r *RedisStore) SaveMetric(payload Payload) error {
	ctx := context.Background()

	// 1. Maintain the Node set and LastUpdated timestamp
	statusKey := fmt.Sprintf("node_status:%s", payload.NodeID)
	
	// Keep node in "known" list for 1 hour if it stops sending metrics
	err := r.client.Set(ctx, statusKey, time.Now().Format(time.RFC3339Nano), time.Hour).Err()
	if err != nil {
		return err
	}
	
	r.client.SAdd(ctx, "nodes:all", payload.NodeID)

	// 2. Append to history list
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	listKey := fmt.Sprintf("metrics:%s", payload.NodeID)
	pipe := r.client.Pipeline()
	pipe.LPush(ctx, listKey, data)
	pipe.LTrim(ctx, listKey, 0, MaxHistory-1) // Keep only latest 100 entries
	// List expires if no new data for 1 hour to match node TTL
	pipe.Expire(ctx, listKey, time.Hour)
	_, err = pipe.Exec(ctx)
	
	return err
}

func (r *RedisStore) GetNodes() ([]map[string]interface{}, error) {
	ctx := context.Background()
	
	nodeIDs, err := r.client.SMembers(ctx, "nodes:all").Result()
	if err != nil {
		return nil, err
	}

	var nodes []map[string]interface{}
	
	for _, id := range nodeIDs {
		statusKey := fmt.Sprintf("node_status:%s", id)
		lastUpdatedStr, err := r.client.Get(ctx, statusKey).Result()
		
		if err == redis.Nil {
			// Key expired, meaning node has been dead for > 1 hour. We can optionally clean it up.
			r.client.SRem(ctx, "nodes:all", id)
			continue
		} else if err != nil {
			continue // Ignore other errors and skip node
		}

		lastUpdated, _ := time.Parse(time.RFC3339Nano, lastUpdatedStr)
		status := "offline"
		if time.Since(lastUpdated) < 10*time.Second {
			status = "online"
		}

		nodes = append(nodes, map[string]interface{}{
			"node_id":      id,
			"last_updated": lastUpdated,
			"status":       status,
		})
	}
	
	// Sort nodes by ID for consistent ordering
	sort.Slice(nodes, func(i, j int) bool {
		return nodes[i]["node_id"].(string) < nodes[j]["node_id"].(string)
	})

	return nodes, nil
}

func (r *RedisStore) GetNodeMetrics(nodeID string) (*NodeMetrics, error) {
	ctx := context.Background()

	statusKey := fmt.Sprintf("node_status:%s", nodeID)
	lastUpdatedStr, err := r.client.Get(ctx, statusKey).Result()
	if err == redis.Nil {
		return nil, fmt.Errorf("node not found")
	} else if err != nil {
		return nil, err
	}

	lastUpdated, _ := time.Parse(time.RFC3339Nano, lastUpdatedStr)

	listKey := fmt.Sprintf("metrics:%s", nodeID)
	// Get all items in list (0 to -1). Using LRange because newer items are at the front (0)
	rawMetrics, err := r.client.LRange(ctx, listKey, 0, -1).Result()
	if err != nil && err != redis.Nil {
		return nil, err
	}

	var history []Payload
	// Iterate in reverse because LPUSH puts newest items first, 
	// but the UI expects history in chronological order (oldest first)
	for i := len(rawMetrics) - 1; i >= 0; i-- {
		var p Payload
		if json.Unmarshal([]byte(rawMetrics[i]), &p) == nil {
			history = append(history, p)
		}
	}

	return &NodeMetrics{
		NodeID:      nodeID,
		LastUpdated: lastUpdated,
		History:     history,
	}, nil
}
