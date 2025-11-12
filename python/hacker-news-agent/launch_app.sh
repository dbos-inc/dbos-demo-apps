#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Deep Research Agent...${NC}\n"

# Check if OPENAI_API_KEY is set
if [ -z "$OPENAI_API_KEY" ]; then
    echo -e "${RED}❌ Error: OPENAI_API_KEY environment variable not set${NC}"
    echo "Please set your OpenAI API key:"
    echo "  export OPENAI_API_KEY='your-api-key-here'"
    exit 1
fi

# Check if frontend dependencies are installed
if [ ! -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}📦 Installing frontend dependencies...${NC}"
    cd frontend && npm install && cd ..
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to install frontend dependencies${NC}"
        exit 1
    fi
fi

# Create a temporary file to store PIDs
PIDFILE=".app_pids"
rm -f $PIDFILE

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down...${NC}"
    if [ -f $PIDFILE ]; then
        while read pid; do
            if ps -p $pid > /dev/null 2>&1; then
                kill $pid 2>/dev/null
            fi
        done < $PIDFILE
        rm -f $PIDFILE
    fi
    exit 0
}

# Set up trap to catch Ctrl+C
trap cleanup SIGINT SIGTERM

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "   Frontend: ${YELLOW}http://localhost:5173${NC}"
echo -e "   Backend:  ${YELLOW}http://localhost:8000${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "\nPress ${RED}Ctrl+C${NC} to stop both services\n"

# Start backend
echo -e "${GREEN}🐍 Starting backend...${NC}"
uv run python -m hacker_news_agent.main &
BACKEND_PID=$!
echo $BACKEND_PID >> $PIDFILE

# Start frontend
echo -e "${GREEN}⚛️  Starting frontend...${NC}\n"
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..
echo $FRONTEND_PID >> $PIDFILE

# Wait for both processes
wait
