'use strict';
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const path       = require('path');
const https      = require('https');
const rateLimit  = require('express-rate-limit');

// ── Bootstrap database (creates schema + seeds data on first run) ──────────
require('./database');

// ── Route modules ─────────────────────────────────────────────────────────
const authRoutes        = require('./routes/auth');
const userRoutes        = require('./routes/users');
const categoryRoutes    = require('./routes/categories');
const pickupRoutes      = require('./routes/pickupRequests');
const transactionRoutes = require('./routes/transactions');

// ── Legacy helpers (kept for old inventory JSON routes) ───────────────────
const fs   = require('fs');
const DATA_FILE    = path.join(__dirname, 'data.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');
const readData  = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeData = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────────────────
app.set('trust proxy', 1); // Trust first proxy (Cloudflare/Serveo) to get real IP
app.use(cors());
app.use(bodyParser.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname)));

// Global rate limiter (100 req/min per IP — prevents abuse)
app.use(rateLimit({ windowMs: 60 * 1000, max: 100 }));

// ── Root redirect ─────────────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect('/login_page/index.html'));

// ── New API Routes ─────────────────────────────────────────────────────────
app.use('/api/auth',              authRoutes);
app.use('/api/users',             userRoutes);
app.use('/api/categories',        categoryRoutes);
app.use('/api/pickup-requests',   pickupRoutes);
app.use('/api/transactions',      transactionRoutes);

// ── Legacy Inventory API (data.json — kept for backward compatibility) ─────

// Get Inventory
app.get('/api/inventory', (req, res) => {
  try {
    res.json(readData(DATA_FILE).inventory);
  } catch {
    res.status(500).json({ error: 'Failed to read inventory data' });
  }
});

// Get History
app.get('/api/history', (req, res) => {
  try {
    res.json(readData(HISTORY_FILE).logs);
  } catch {
    res.status(500).json({ error: 'Failed to read history data' });
  }
});

// Add New Scrap Item
app.post('/api/inventory/add', (req, res) => {
  try {
    const data    = readData(DATA_FILE);
    const history = readData(HISTORY_FILE);
    const newItem = { ...req.body, lastUpdated: new Date().toISOString() };
    if (data.inventory.find(i => i.id === newItem.id)) {
      return res.status(400).json({ error: 'Item ID already exists' });
    }
    data.inventory.push(newItem);
    writeData(DATA_FILE, data);
    const logEntry = {
      id: `LOG-${Date.now()}`, timestamp: new Date().toISOString(),
      itemId: newItem.id, itemName: newItem.name,
      action: 'Added Asset', change: newItem.quantity, newValue: newItem.quantity, user: 'Admin User'
    };
    history.logs.unshift(logEntry);
    writeData(HISTORY_FILE, history);
    res.json({ success: true, item: newItem });
  } catch {
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// Delete Scrap Item
app.delete('/api/inventory/delete/:id', (req, res) => {
  try {
    const data    = readData(DATA_FILE);
    const history = readData(HISTORY_FILE);
    const idx     = data.inventory.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Item not found' });
    const item = data.inventory.splice(idx, 1)[0];
    writeData(DATA_FILE, data);
    history.logs.unshift({
      id: `LOG-${Date.now()}`, timestamp: new Date().toISOString(),
      itemId: item.id, itemName: item.name,
      action: 'Decommissioned', change: -item.quantity, newValue: 0, user: 'Admin User'
    });
    writeData(HISTORY_FILE, history);
    res.json({ success: true, message: 'Item deleted' });
  } catch {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Update Quantity/Metadata
app.post('/api/inventory/update', (req, res) => {
  const { id, action, metadata } = req.body;
  try {
    const data    = readData(DATA_FILE);
    const history = readData(HISTORY_FILE);
    const idx     = data.inventory.findIndex(i => i.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Item not found' });
    const item = data.inventory[idx];
    let change = 0;
    if (action === 'increase')                          { item.quantity += 1; change = 1; }
    else if (action === 'decrease' && item.quantity > 0){ item.quantity -= 1; change = -1; }
    else if (action === 'edit' && metadata)             { Object.assign(item, metadata); }
    item.lastUpdated = new Date().toISOString();
    writeData(DATA_FILE, data);
    if (change !== 0 || action === 'edit') {
      history.logs.unshift({
        id: `LOG-${Date.now()}`, timestamp: new Date().toISOString(),
        itemId: item.id, itemName: item.name,
        action: action === 'edit' ? 'Updated Metadata' : (action === 'increase' ? 'Increment' : 'Decrement'),
        change, newValue: item.quantity, user: 'Admin User'
      });
      writeData(HISTORY_FILE, history);
      res.json({ success: true, item, log: history.logs[0] });
    } else {
      res.status(400).json({ error: 'No change made' });
    }
  } catch {
    res.status(500).json({ error: 'Failed to update data' });
  }
});

// Legacy Login (kept for backward compatibility — new login uses /api/auth/login)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'IOC123' && password === 'IOC456') {
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// Settings simulation
app.post('/api/settings', (req, res) => {
  console.log('Settings updated:', { ...req.body, password: '****' });
  res.json({ success: true, message: 'Settings updated successfully' });
});

// ── Gemini AI Chat ─────────────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_KEY || '';
const GEMINI_MODEL   = 'gemini-2.0-flash-lite';

app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'No message provided.' });

  const data     = readData(DATA_FILE);
  const inv      = data.inventory;
  const totalQty = inv.reduce((s, i) => s + i.quantity, 0);
  const alerts   = inv.filter(i => (i.quantity / i.maxCapacity) >= 0.9);
  const branches = [...new Set(inv.map(i => i.branch))];
  const branchTotals = {};
  inv.forEach(i => { branchTotals[i.branch] = (branchTotals[i.branch] || 0) + i.quantity; });

  const inventoryContext = inv.map(i =>
    `${i.name} (${i.type}, ${i.brand}) — Qty: ${i.quantity}/${i.maxCapacity}, Branch: ${i.branch}, Serial: ${i.serial}`
  ).join('\n');

  const systemPrompt = `You are IOC AssetAI, an intelligent assistant for IndianOil Corporation's Enterprise Scrap Management Portal.

You have real-time access to the following inventory data:
- Total asset types: ${inv.length}
- Total stock units: ${totalQty}
- Active branches: ${branches.join(', ')}
- Capacity alerts (≥90% full): ${alerts.length} items
- Branch totals: ${JSON.stringify(branchTotals)}

FULL CURRENT INVENTORY:
${inventoryContext}

Rules:
- Be concise, professional, and data-driven.
- Always reference actual numbers from the inventory above.
- Format responses with bullet points where helpful.
- Recommend actions when problems exist (capacity alerts, low stock).
- You are speaking to an IndianOil admin, so keep it formal but friendly.
- If asked about something unrelated to inventory/assets, politely redirect.`;

  const payload = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: message }] }],
    generationConfig: { maxOutputTokens: 512, temperature: 0.7 }
  });

  const options = {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  };

  const geminiReq = https.request(options, (geminiRes) => {
    let body = '';
    geminiRes.on('data', chunk => body += chunk);
    geminiRes.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        if (parsed.error) return res.status(500).json({ error: parsed.error.message });
        const reply = parsed.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from AI.';
        res.json({ reply });
      } catch {
        res.status(500).json({ error: 'Failed to parse Gemini response.' });
      }
    });
  });
  geminiReq.on('error', e => res.status(500).json({ error: 'Could not reach Gemini API.' }));
  geminiReq.write(payload);
  geminiReq.end();
});

// ── Start server ───────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Scrap Management Server running at http://localhost:${PORT}`);
  console.log(`   SQLite DB ready | JWT Auth active | ${new Date().toLocaleString('en-IN')}\n`);
});
