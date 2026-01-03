#!/bin/bash
# Start local SearxNG for AnyClaude web search

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running. Please start Docker first."
  exit 1
fi

# Check if already running
if docker ps --format '{{.Names}}' | grep -q 'anyclaude-searxng'; then
  echo "SearxNG is already running at http://localhost:8080"
  exit 0
fi

# Start container
echo "Starting SearxNG..."
docker compose -f docker-compose.searxng.yml up -d

# Wait for health check
echo "Waiting for SearxNG to be ready..."
for i in {1..30}; do
  if curl -s http://localhost:8080/search?q=test&format=json > /dev/null 2>&1; then
    echo "✅ SearxNG is running at http://localhost:8080"
    echo ""
    echo "Test with: curl 'http://localhost:8080/search?q=test&format=json'"
    exit 0
  fi
  sleep 1
done

echo "⚠️ SearxNG started but health check failed. Check logs: docker logs anyclaude-searxng"
exit 1
