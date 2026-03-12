FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
# RUN go mod download

COPY vendor ./vendor

COPY . .
# RUN CGO_ENABLED=0 GOOS=linux go build -o monitor-agent .

RUN CGO_ENABLED=0 GOOS=linux go build -mod=vendor -o monitor-agent .

FROM alpine:latest

# Agent needs some basic tools to fetch correct metrics (e.g. nvidia-smi if a GPU was passed through, but typically we just run it bare-metal for full system access)
# For demo purposes, we will assume it's run with --pid=host --network=host to collect accurate host metrics
WORKDIR /app
COPY --from=builder /app/monitor-agent .

ENTRYPOINT ["./monitor-agent"]
