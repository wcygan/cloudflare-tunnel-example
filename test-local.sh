#!/bin/bash
# Test script for local container connectivity

echo "Testing local container setup..."

# Start only the app container
docker compose up -d app

# Wait for app to be healthy
echo "Waiting for app to be healthy..."
for i in {1..30}; do
  if docker compose ps app | grep -q "healthy"; then
    echo "App is healthy!"
    break
  fi
  sleep 1
done

# Test app endpoints
echo "Testing app endpoints..."
APP_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' cloudflare-tunnel-app)
echo "App IP: $APP_IP"

echo "Testing root endpoint..."
curl -i http://$APP_IP:8080/

echo -e "\nTesting health endpoint..."
curl -i http://$APP_IP:8080/health

# Clean up
docker compose down

echo -e "\nLocal test complete!"