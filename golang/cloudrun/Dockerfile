# --- Build Stage ---
FROM golang:1.24 as builder

WORKDIR /app

# Copy modules first to leverage Docker caching
COPY go.mod go.sum ./
RUN go mod download
RUN go mod tidy

# Copy source code and build
COPY . .
# CGO_ENABLED=0 is critical for "distroless" (static binary)
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

# --- Run Stage ---
# Use "distroless" for a tiny, secure image (no shell, no package manager)
FROM gcr.io/distroless/static-debian12

# Copy the binary from the builder
COPY --from=builder /app/main /

# Cloud Run injects the PORT env var (default 8080)
# We don't strictly need EXPOSE for Cloud Run, but it's good documentation
EXPOSE 8080

CMD ["/main"]
