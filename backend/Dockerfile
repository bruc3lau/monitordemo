FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o monitor-backend main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/monitor-backend .

EXPOSE 8080
ENTRYPOINT ["./monitor-backend"]
