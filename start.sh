#!/bin/bash
# ================================================
# IndianOil Scrap Management — Complete Launcher
# Run: bash start.sh  (or ./start.sh)
# ================================================

PROJECT_DIR="/Users/ayushpdn/Desktop/python RC5 BLOCK"
cd "$PROJECT_DIR"
export PATH="$PROJECT_DIR/node_local/bin:$PATH"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   🛢  IndianOil Scrap Management Portal      ║"
echo "║   Starting all services...                   ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Kill any old processes ─────────────────────────────────────────
lsof -ti:3000 | xargs kill -9 2>/dev/null
pkill -f "cloudflared" 2>/dev/null
pkill -f "ssh.*serveo" 2>/dev/null
pkill -f "lt --port" 2>/dev/null
sleep 1

# ── Start backend server ───────────────────────────────────────────
echo "▶  Starting backend server..."
node server.js &
SERVER_PID=$!
sleep 2

if ! lsof -ti:3000 > /dev/null 2>&1; then
    echo "❌ Server failed to start. Run 'node server.js' to see the error."
    exit 1
fi
echo "✅ Server running on :3000"

# ── Get LAN IP ─────────────────────────────────────────────────────
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "unknown")

# ── Start Cloudflare Tunnel (no account, no warning page) ─────────
echo "▶  Starting public tunnel (Cloudflare)..."
TLOG=$(mktemp /tmp/ioc_cf.XXXX)

"$PROJECT_DIR/cloudflared" tunnel --url http://localhost:3000 \
    --no-autoupdate 2>&1 | tee "$TLOG" &
TUNNEL_PID=$!

# Wait up to 20s for Cloudflare to give a URL
PUBLIC_URL=""
for i in $(seq 1 40); do
    sleep 0.5
    PUBLIC_URL=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$TLOG" 2>/dev/null | head -1)
    [ -n "$PUBLIC_URL" ] && break
done

rm -f "$TLOG"

if [ -z "$PUBLIC_URL" ]; then
    PUBLIC_URL="⚠ Could not get URL — check tunnel logs"
fi

# Open browser
open "http://localhost:3000" 2>/dev/null

# ── Print Access Summary ───────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                  ✅  ALL SERVICES RUNNING                   ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  📍 Local (this Mac):    http://localhost:3000              ║"
printf  "║  📡 LAN (same Wi-Fi):    http://%-30s║\n" "$LAN_IP:3000  "
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  🌐 PUBLIC URL — Share with anyone, no password needed:     ║"
printf  "║     %-59s║\n" "$PUBLIC_URL"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  🔑 Admin:   IOC123        / Admin@1234                     ║"
echo "║  🔑 Manager: IOC-MGR-001   / Manager@1234                   ║"
echo "║  🔑 Agent:   IOC-AGT-001   / Agent@1234                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

# ── Keep alive with auto-reconnect ─────────────────────────────────
cleanup() {
    echo ""
    echo "⏹  Stopping all services..."
    kill $SERVER_PID $TUNNEL_PID 2>/dev/null
    exit 0
}
trap cleanup INT TERM

while kill -0 $SERVER_PID 2>/dev/null; do
    if ! kill -0 $TUNNEL_PID 2>/dev/null; then
        echo "⚠  Tunnel dropped — restarting..."
        TLOG=$(mktemp /tmp/ioc_cf.XXXX)
        "$PROJECT_DIR/cloudflared" tunnel --url http://localhost:3000 \
            --no-autoupdate 2>&1 | tee "$TLOG" &
        TUNNEL_PID=$!
        sleep 10
        NEW=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$TLOG" | head -1)
        rm -f "$TLOG"
        [ -n "$NEW" ] && echo "✅ New URL: $NEW" || echo "❌ Reconnect failed"
    fi
    sleep 5
done
