.PHONY: build-backend build-agent build-frontend run-backend run-agent run-frontend clean

# Variables
BACKEND_DIR=backend
AGENT_DIR=agent
FRONTEND_DIR=frontend

# Build targets
build-backend:
	cd $(BACKEND_DIR) && GOOS=linux GOARCH=amd64 go build -o monitor-backend .

build-agent:
	cd $(AGENT_DIR) && GOOS=linux GOARCH=amd64 go build -o monitor-agent .

build-frontend:
	cd $(FRONTEND_DIR) && npm run build

# Run targets
run-backend:
	cd $(BACKEND_DIR) && go run .

run-agent:
	cd $(AGENT_DIR) && go run . -node "my-local-machine" -server "http://localhost:8080/api/metrics" -interval 2

run-frontend:
	cd $(FRONTEND_DIR) && npm run dev

# Docker targets
docker-build-backend:
	cd $(BACKEND_DIR) && docker build -t monitor-backend:latest .

docker-build-agent:
	cd $(AGENT_DIR) && docker build -t monitor-agent:latest .

docker-build-all: docker-build-backend docker-build-agent

# Clean targets
clean:
	rm -f $(BACKEND_DIR)/monitor-backend
	rm -f $(AGENT_DIR)/monitor-agent
	rm -rf $(FRONTEND_DIR)/dist
