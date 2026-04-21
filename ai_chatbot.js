// =====================================================
//   IOC AssetAI — Gemini-Powered Chatbot Engine
//   Calls /api/ai/chat → Gemini 1.5 Flash
//   Falls back to local NLP if API key not set
// =====================================================

let chatOpen = false;
let chatInitialized = false;

function toggleChat() {
    const panel = document.getElementById('aiChatPanel');
    const badge = document.getElementById('aiBadge');
    chatOpen = !chatOpen;
    panel.classList.toggle('open', chatOpen);
    if (chatOpen) {
        badge.style.display = 'none';
        if (!chatInitialized) {
            chatInitialized = true;
            setTimeout(() => {
                botReply(`👋 Hello Admin! I'm **IOC AssetAI** powered by Google Gemini.\n\nI have live access to **${inventory.length} asset types** across all branches. Ask me anything about your inventory, capacity, or get a full analysis!`);
            }, 400);
        }
        setTimeout(() => document.getElementById('aiInput').focus(), 300);
    }
}

function sendAIMessage() {
    const input = document.getElementById('aiInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    askAI(text);
}

function askAI(text) {
    if (!chatOpen) toggleChat();
    addMessage(text, 'user');
    showTyping();

    // Try Gemini API first
    fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
    })
    .then(res => res.json())
    .then(data => {
        removeTyping();
        if (data.reply) {
            botReply(data.reply);
        } else if (data.error) {
            // Fallback to local NLP if Gemini fails (e.g. no API key)
            console.warn('Gemini fallback:', data.error);
            botReply(processQuery(text.toLowerCase()));
        }
    })
    .catch(() => {
        removeTyping();
        // Offline fallback
        botReply(processQuery(text.toLowerCase()));
    });
}

function addMessage(text, role) {
    const container = document.getElementById('aiMessages');
    const msg = document.createElement('div');
    msg.className = `ai-msg ${role}`;
    const formattedText = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
    msg.innerHTML = role === 'bot'
        ? `<div class="ai-bot-icon"><i class="fas fa-robot"></i></div><div class="ai-bubble">${formattedText}</div>`
        : `<div class="ai-bubble">${formattedText}</div>`;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
}

function botReply(text) { addMessage(text, 'bot'); }

function showTyping() {
    const container = document.getElementById('aiMessages');
    const el = document.createElement('div');
    el.className = 'ai-msg bot ai-typing';
    el.id = 'ai-typing-indicator';
    el.innerHTML = `<div class="ai-bot-icon"><i class="fas fa-robot"></i></div>
        <div class="ai-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
}

function removeTyping() {
    const el = document.getElementById('ai-typing-indicator');
    if (el) el.remove();
}

// ── Local NLP Fallback Engine (used when no Gemini API key) ──────────────────
function processQuery(q) {
    const totalQty = inventory.reduce((s, i) => s + i.quantity, 0);
    const alerts   = inventory.filter(i => (i.quantity / i.maxCapacity) >= 0.9);
    const lowStock = inventory.filter(i => i.quantity <= 3);

    const branchTotals = {};
    inventory.forEach(i => { branchTotals[i.branch] = (branchTotals[i.branch] || 0) + i.quantity; });
    const sorted = Object.entries(branchTotals).sort((a, b) => b[1] - a[1]);
    const topBranch   = sorted[0];
    const leastBranch = sorted[sorted.length - 1];

    const typeTotals = {};
    inventory.forEach(i => { typeTotals[i.type] = (typeTotals[i.type] || 0) + i.quantity; });
    const topType = Object.entries(typeTotals).sort((a, b) => b[1] - a[1])[0];

    const UNIT_WEIGHTS_LOCAL = {
        'Laptop': 2.1, 'PC': 8.5, 'Mobile': 0.2, 'Tablet': 0.5,
        'Television': 14.0, 'Printer': 7.0, 'Network': 3.2,
        'Component': 1.5, 'Storage': 1.0, 'Wearable': 0.08
    };
    const totalWeight = inventory.reduce((s, i) => s + i.quantity * (UNIT_WEIGHTS_LOCAL[i.type] || 2.0), 0);
    const top5 = [...inventory].sort((a, b) => b.quantity - a.quantity).slice(0, 5);

    if (q.includes('alert') || q.includes('capacity') || q.includes('critical') || q.includes('full')) {
        if (alerts.length === 0) return '✅ **All Clear!** No assets are near capacity right now.';
        let msg = `⚠️ **${alerts.length} Capacity Alert${alerts.length > 1 ? 's' : ''} Detected:**\n\n`;
        alerts.forEach(i => {
            const pct = Math.round((i.quantity / i.maxCapacity) * 100);
            msg += `• **${i.name}** (${i.branch}): ${i.quantity}/${i.maxCapacity} — **${pct}% full** 🔴\n`;
        });
        msg += `\n**Action:** Redistribute or recycle these assets immediately.`;
        return msg;
    }

    if (q.includes('branch') || q.includes('city') || q.includes('location') || q.includes('most stock')) {
        let msg = `📍 **Stock by Branch:**\n\n`;
        sorted.forEach(([branch, qty]) => { msg += `• **${branch}**: ${qty} units\n`; });
        msg += `\n🏆 **Highest:** ${topBranch[0]} (${topBranch[1]} units)`;
        msg += `\n📉 **Lowest:** ${leastBranch[0]} (${leastBranch[1]} units)`;
        return msg;
    }

    if (q.includes('weight') || q.includes('kg') || q.includes('tonne')) {
        const tonnes = (totalWeight / 1000).toFixed(2);
        let msg = `⚖️ **Total Estimated Weight: ${totalWeight.toFixed(0)} kg (${tonnes} tonnes)**\n\n`;
        Object.entries(typeTotals)
            .sort((a, b) => (b[1] * (UNIT_WEIGHTS_LOCAL[b[0]] || 2)) - (a[1] * (UNIT_WEIGHTS_LOCAL[a[0]] || 2)))
            .forEach(([type, qty]) => {
                const w = (qty * (UNIT_WEIGHTS_LOCAL[type] || 2.0)).toFixed(0);
                msg += `• **${type}**: ${w} kg\n`;
            });
        return msg;
    }

    if (q.includes('top') || q.includes('highest') || q.includes('largest')) {
        let msg = `🏆 **Top 5 Assets by Quantity:**\n\n`;
        top5.forEach((item, idx) => {
            msg += `${idx + 1}. **${item.name}** — ${item.quantity} units (${item.branch})\n`;
        });
        return msg;
    }

    if (q.includes('low') || q.includes('attention') || q.includes('running out') || q.includes('watch')) {
        if (lowStock.length === 0) return '✅ No items are critically low right now (≤3 units).';
        let msg = `🔍 **${lowStock.length} Items Need Attention:**\n\n`;
        lowStock.forEach(i => {
            msg += `• **${i.name}** (${i.branch}): only **${i.quantity}** unit${i.quantity !== 1 ? 's' : ''} left\n`;
        });
        return msg;
    }

    if (q.includes('report') || q.includes('summary') || q.includes('overview') || q.includes('full')) {
        return `📊 **Full Inventory Report — IndianOil**\n\n` +
            `📦 Asset Types: **${inventory.length}**\n` +
            `🔢 Total Units: **${totalQty}**\n` +
            `⚖️ Total Weight: **${totalWeight.toFixed(0)} kg**\n` +
            `📍 Active Branches: **${Object.keys(branchTotals).length}**\n` +
            `⚠️ Capacity Alerts: **${alerts.length}**\n` +
            `🔴 Low Stock Items: **${lowStock.length}**\n\n` +
            `🏆 Top Branch: **${topBranch[0]}** (${topBranch[1]} units)\n` +
            `📈 Top Category: **${topType[0]}** (${topType[1]} units)\n\n` +
            `_Use Export → Branded PDF to generate a formal report._`;
    }

    if (q.includes('hello') || q.includes('hi') || q.includes('hey')) {
        return `👋 Hello, Admin! I have live access to **${inventory.length} assets** across **5 branches**. How can I help?`;
    }

    if (q.includes('help') || q.includes('what can you')) {
        return `🤖 **I can help with:**\n\n` +
            `• ⚠️ Capacity alerts & critical stock\n` +
            `• 📍 Branch-wise comparison\n` +
            `• ⚖️ Weight distribution reports\n` +
            `• 🏆 Top items by quantity\n` +
            `• 📊 Full inventory summaries\n` +
            `• 🔍 Low stock warnings\n\n` +
            `Just ask naturally — I understand plain English!`;
    }

    // Fallback: search inventory by name / brand / type
    const matched = inventory.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.type.toLowerCase().includes(q) ||
        i.brand.toLowerCase().includes(q)
    );
    if (matched.length > 0) {
        let msg = `🔎 **Found ${matched.length} matching asset${matched.length > 1 ? 's' : ''}:**\n\n`;
        matched.slice(0, 5).forEach(i => {
            const pct = Math.round((i.quantity / i.maxCapacity) * 100);
            msg += `• **${i.name}** | ${i.quantity}/${i.maxCapacity} (${pct}%) | ${i.branch}\n`;
        });
        return msg;
    }

    return `🤔 I didn't quite understand that. Try:\n` +
        `• "Show capacity alerts"\n` +
        `• "Branch summary"\n` +
        `• "Total weight"\n` +
        `• "Full report"\n` +
        `• Or type any item or brand name!`;
}
