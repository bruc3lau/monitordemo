FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
# RUN go mod download

COPY vendor ./vendor

COPY . .
# RUN CGO_ENABLED=0 GOOS=linux go build -o monitor-agent .

RUN CGO_ENABLED=0 GOOS=linux go build -mod=vendor -o monitor-agent .

FROM alpine:latest
RUN apk add --no-cache bash
WORKDIR /app
COPY --from=builder /app/monitor-agent .

ENTRYPOINT ["./monitor-agent"]
