.PHONY: build-backend build-agent build-frontend run-backend run-agent run-frontend clean docker-build-backend docker-build-agent docker-build-frontend docker-build-all compose-up compose-down

# Variables
BACKEND_DIR=backend
AGENT_DIR=agent
FRONTEND_DIR=frontend
GO_BUILD_ENV=GOOS=linux GOARCH=amd64
COMMIT_HASH=$(shell git rev-parse --short HEAD)
VERSION=0.0.1-$(COMMIT_HASH)
# Auto-detect macOS and set linux/amd64 platform for cross-platform builds
UNAME_S=$(shell uname -s)
ifeq ($(UNAME_S),Darwin)
  DOCKER_PLATFORM=--platform linux/amd64
else
  DOCKER_PLATFORM=
endif

# Build targets
build-backend:
	cd $(BACKEND_DIR) && $(GO_BUILD_ENV) go build -o monitor-backend .

build-agent:
	cd $(AGENT_DIR) && $(GO_BUILD_ENV) go build -o monitor-agent .

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
	cd $(BACKEND_DIR) && docker build $(DOCKER_PLATFORM) -t monitor-backend:$(VERSION) -t monitor-backend:latest .

docker-build-agent:
	cd $(AGENT_DIR) && docker build $(DOCKER_PLATFORM) -t monitor-agent:$(VERSION) -t monitor-agent:latest .

docker-build-frontend:
	cd $(FRONTEND_DIR) && docker build $(DOCKER_PLATFORM) -t monitor-frontend:$(VERSION) -t monitor-frontend:latest .

docker-build-all: docker-build-backend docker-build-agent docker-build-frontend

compose-up:
	docker compose up -d --build

compose-down:
	docker compose down

# Clean targets
clean:
	rm -f $(BACKEND_DIR)/monitor-backend
	rm -f $(AGENT_DIR)/monitor-agent
	rm -rf $(FRONTEND_DIR)/dist
