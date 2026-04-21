const API_URL = 'http://localhost:3000/api';

// State
let inventory = [];
let historyLogs = [];
let currentView = 'inventory';
let searchQuery = '';
let branchFilter = 'all';
let wasteChart = null;
let currentSelectedItem = null; // For QR/Details/Delete

// DOM Element References (must exist in HTML)
const inventoryGrid = document.getElementById('inventory-grid');
const searchInput = document.getElementById('searchInput');
const navItems = document.querySelectorAll('.nav-item');
const viewSections = document.querySelectorAll('.view-section');
const totalQtyEl = document.getElementById('total-qty');
const toastContainer = document.getElementById('toast-container');

// --- Global Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    fetchInventory();
    fetchHistory();
    setupNavigation();
    setupSearch();
    setupFilters();
    setupForms();
    setupSettings();
});

// --- Repository Interaction ---

async function fetchInventory() {
    try {
        const response = await fetch(`${API_URL}/inventory`);
        inventory = await response.json();
        renderInventory();
        updateStats();
    } catch (error) {
        showToast('Error fetching inventory.', 'danger');
    }
}

async function fetchHistory() {
    try {
        const response = await fetch(`${API_URL}/history`);
        historyLogs = await response.json();
        if (currentView === 'history') renderHistoryView();
    } catch (error) {
        console.error('History fetch error:', error);
    }
}

// --- View Rendering ---

function renderInventory() {
    inventoryGrid.innerHTML = '';
    
    // Multi-stage filtering: Search + Branch
    const filteredItems = inventory.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             item.brand.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesBranch = (branchFilter === 'all' || item.branch === branchFilter);
        return matchesSearch && matchesBranch;
    });

    if (filteredItems.length === 0) {
        inventoryGrid.innerHTML = '<div class="loading">No matching scrap assets found.</div>';
        return;
    }

    filteredItems.forEach((item, index) => {
        const card = document.createElement('div');
        const fillPercent = (item.quantity / item.maxCapacity) * 100;
        const isAlert = fillPercent >= 90;

        card.className = `scrap-card ${isAlert ? 'status-alert' : ''}`;
        card.style.animationDelay = `${index * 0.05}s`;
        
        card.innerHTML = `
            <div class="card-img-wrapper" style="height: 180px; overflow: hidden; position: relative;">
                <img src="${item.image}" alt="${item.name}" class="card-img" style="width: 100%; height: 100%; object-fit: cover;">
                <span class="type-badge">${item.type}</span>
                <div class="card-hover-info" onclick="showItemDetails('${item.id}')">
                    <i class="fas fa-qrcode"></i> View QR & Specs
                </div>
            </div>
            <div class="card-body" style="padding: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <span class="item-id" style="font-size: 11px; color: var(--primary); font-weight: 800; display: block;">${item.id}</span>
                        <h4 style="font-size: 17px; font-weight: 700; margin: 4px 0;">${item.name}</h4>
                        <span style="font-size: 12px; color: var(--text-muted);"><i class="fas fa-map-marker-alt"></i> ${item.branch}</span>
                    </div>
                </div>
                <div class="capacity-bar-container" style="height: 6px; background: #e2e8f0; border-radius: 10px; margin: 15px 0 5px;">
                    <div class="capacity-bar" style="width: ${Math.min(fillPercent, 100)}%; height: 100%; background: ${isAlert ? 'var(--danger)' : 'var(--success)'}; border-radius: 10px;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; color: var(--text-muted); margin-bottom: 15px;">
                   <span>${item.quantity} CURRENT</span>
                   <span>${item.maxCapacity} LIMIT</span>
                </div>
                <div class="qty-control" style="display: flex; justify-content: space-between; align-items: center;">
                    <div class="qty-spinner">
                        <button class="spin-btn" onclick="updateQuantity('${item.id}', 'decrease')"><i class="fas fa-minus"></i></button>
                        <span class="qty-value" style="font-weight: 800; min-width: 20px; text-align: center;">${item.quantity}</span>
                        <button class="spin-btn" onclick="updateQuantity('${item.id}', 'increase')"><i class="fas fa-plus"></i></button>
                    </div>
                    <button class="spin-btn" onclick="openEditModal('${item.id}')"><i class="fas fa-edit"></i></button>
                </div>
            </div>
        `;
        inventoryGrid.appendChild(card);
    });
}

function renderHistoryView() {
    // --- Summary Stats Panel ---
    const totalItems = inventory.length;
    const totalQty = inventory.reduce((s, i) => s + i.quantity, 0);
    const totalWeight = inventory.reduce((s, i) => s + i.quantity * (UNIT_WEIGHTS[i.type] || 2.0), 0);
    const alertCount = inventory.filter(i => (i.quantity / i.maxCapacity) >= 0.9).length;
    const totalLogs = historyLogs.length;
    const branches = [...new Set(inventory.map(i => i.branch))].length;

    // Inject summary bar if not already present
    let summaryBar = document.getElementById('analytics-summary');
    if (!summaryBar) {
        summaryBar = document.createElement('div');
        summaryBar.id = 'analytics-summary';
        summaryBar.className = 'analytics-summary';
        const historyView = document.getElementById('history-view');
        const firstSection = historyView.querySelector('.dashboard-header');
        firstSection.after(summaryBar);
    }
    summaryBar.innerHTML = `
        <div class="summary-stat"><i class="fas fa-database"></i><span class="s-val">${totalItems}</span><span class="s-lbl">Asset Types</span></div>
        <div class="summary-stat"><i class="fas fa-boxes"></i><span class="s-val">${totalQty}</span><span class="s-lbl">Total Units</span></div>
        <div class="summary-stat"><i class="fas fa-weight-hanging"></i><span class="s-val">${totalWeight.toFixed(0)} kg</span><span class="s-lbl">Total Weight</span></div>
        <div class="summary-stat"><i class="fas fa-map-marker-alt"></i><span class="s-val">${branches}</span><span class="s-lbl">Branches</span></div>
        <div class="summary-stat"><i class="fas fa-exclamation-triangle"></i><span class="s-val" style="color:var(--danger)">${alertCount}</span><span class="s-lbl">Cap. Alerts</span></div>
        <div class="summary-stat"><i class="fas fa-history"></i><span class="s-val">${totalLogs}</span><span class="s-lbl">Log Entries</span></div>
    `;

    // --- Activity Log ---
    const logBody = document.getElementById('history-log-body');
    logBody.innerHTML = '';
    
    historyLogs.slice(0, 100).forEach(log => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(log.timestamp)}</td>
            <td><strong>${log.itemId}</strong><br><small>${log.itemName}</small></td>
            <td>${log.action}</td>
            <td><span class="badge-qty ${log.change >= 0 ? 'plus' : 'minus'}">${log.change > 0 ? '+' : ''}${log.change}</span></td>
        `;
        logBody.appendChild(row);
    });

    // Render charts after DOM is ready
    setTimeout(() => initChart(), 100);
}

function initChart() {
    initCategoryChart();
    initWeightChart();
    initCityChart();
}

// Chart 1: Category Distribution (Pie)
let categoryChart = null;
function initCategoryChart() {
    const ctx = document.getElementById('wasteChart').getContext('2d');
    const distribution = {};
    inventory.forEach(item => { distribution[item.type] = (distribution[item.type] || 0) + item.quantity; });

    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(distribution),
            datasets: [{
                data: Object.values(distribution),
                backgroundColor: ['#002e6e', '#f37021', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4'],
                borderWidth: 2, borderColor: '#fff'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 12 } } } }
        }
    });
}

// Chart 2: Weight Distribution (Doughnut) — approximate weights per unit in kg
const UNIT_WEIGHTS = {
    'Laptop': 2.1, 'PC': 8.5, 'Mobile': 0.2, 'Tablet': 0.5, 'Television': 14.0,
    'Printer': 7.0, 'Network': 3.2, 'Component': 1.5, 'Storage': 1.0, 'Wearable': 0.08
};

let weightChart = null;
function initWeightChart() {
    const ctx = document.getElementById('weightChart').getContext('2d');
    const weightDist = {};
    inventory.forEach(item => {
        const unitWt = UNIT_WEIGHTS[item.type] || 2.0;
        weightDist[item.type] = ((weightDist[item.type] || 0) + item.quantity * unitWt);
    });
    const labels = Object.keys(weightDist);
    const data = Object.values(weightDist).map(v => parseFloat(v.toFixed(1)));

    if (weightChart) weightChart.destroy();
    weightChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ['#002e6e', '#f37021', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4'],
                borderWidth: 2, borderColor: '#fff'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 12 } } },
                tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} kg` } }
            },
            cutout: '65%'
        }
    });
}

// Chart 3: Stock per City (Horizontal Bar)
const BRANCH_COLORS = {
    'Mumbai Refineries': '#f37021',
    'Delhi HQ': '#002e6e',
    'Digboi Refinery': '#10b981',
    'Chennai Marketing': '#3b82f6',
    'Kolkata Office': '#8b5cf6'
};

let cityChart = null;
function initCityChart() {
    const ctx = document.getElementById('cityChart').getContext('2d');
    const cityDist = {};
    inventory.forEach(item => {
        cityDist[item.branch] = (cityDist[item.branch] || 0) + item.quantity;
    });

    const labels = Object.keys(cityDist);
    const data = Object.values(cityDist);
    const colors = labels.map(l => BRANCH_COLORS[l] || '#64748b');

    if (cityChart) cityChart.destroy();
    cityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Stock Units',
                data: data,
                backgroundColor: colors,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                x: { grid: { display: false } }
            }
        }
    });
}


// --- Enterprise Logic ---

function setupFilters() {
    document.getElementById('branchFilter').addEventListener('change', (e) => {
        branchFilter = e.target.value;
        renderInventory();
    });
}

function setupForms() {
    document.getElementById('addItemForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newItem = {
            id: document.getElementById('add-id').value,
            name: document.getElementById('add-name').value,
            type: document.getElementById('add-type').value,
            branch: document.getElementById('add-branch').value,
            quantity: parseInt(document.getElementById('add-qty').value),
            maxCapacity: parseInt(document.getElementById('add-max').value),
            image: document.getElementById('add-img').value,
            brand: "Unknown", model: "N/A", serial: "Pending" // Default metadata
        };

        const response = await fetch(`${API_URL}/inventory/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newItem)
        });

        if (response.ok) {
            closeModal('addModal');
            showToast('Asset initialized successfully.');
            fetchInventory();
            fetchHistory();
        } else {
            const err = await response.json();
            showToast(err.error, 'danger');
        }
    });
}

function showItemDetails(id) {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    currentSelectedItem = item;

    const detailsBody = document.getElementById('item-details-body');
    detailsBody.innerHTML = `
        <h2 style="margin-bottom: 20px;">Asset: ${item.name}</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <p><strong>ID:</strong> ${item.id}</p>
            <p><strong>Type:</strong> ${item.type}</p>
            <p><strong>Brand:</strong> ${item.brand}</p>
            <p><strong>Model:</strong> ${item.model}</p>
            <p><strong>Serial:</strong> ${item.serial}</p>
            <p><strong>Branch:</strong> ${item.branch}</p>
        </div>
        <p style="margin-top: 10px;"><strong>Last Updated:</strong> ${formatDate(item.lastUpdated)}</p>
    `;

    // Generate QR Code
    const qrContainer = document.getElementById('qr-container');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: item.id,
        width: 180,
        height: 180,
        colorDark : "#002e6e",
        colorLight : "#ffffff"
    });

    openModal('detailsModal');
}

async function deleteCurrentItem() {
    if (!currentSelectedItem) return;
    if (!confirm(`Are you sure you want to decommission ${currentSelectedItem.name}?`)) return;

    const response = await fetch(`${API_URL}/inventory/delete/${currentSelectedItem.id}`, {
        method: 'DELETE'
    });

    if (response.ok) {
        closeModal('detailsModal');
        showToast('Asset decommissioned.');
        fetchInventory();
        fetchHistory();
    }
}

// --- Reporting ---

function exportToCSV() {
    let csv = 'Timestamp,Asset ID,Asset Name,Action,Change,New Value\n';
    historyLogs.forEach(log => {
        csv += `${log.timestamp},${log.itemId},${log.itemName},${log.action},${log.change},${log.newValue}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IOC_Scrap_History_${Date.now()}.csv`;
    a.click();
}

function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(0, 46, 110); // IOC Blue
    doc.text('IndianOil Scrap Inventory Report', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

    const tableData = inventory.map(i => [i.id, i.name, i.type, i.quantity, i.branch, i.serial]);
    
    doc.autoTable({
        startY: 40,
        head: [['ID', 'Name', 'Type', 'Qty', 'Branch', 'Serial']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [0, 46, 110] }
    });

    doc.save(`IOC_Inventory_Report.pdf`);
}

// --- Utils ---

function openModal(id) { document.getElementById(id).style.display = 'block'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

async function updateQuantity(id, action) {
    const response = await fetch(`${API_URL}/inventory/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action })
    });
    if (response.ok) { fetchInventory(); fetchHistory(); }
}

function setupNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', () => switchView(item.getAttribute('data-view')));
    });
}

function switchView(viewName) {
    currentView = viewName;
    navItems.forEach(i => i.classList.toggle('active', i.getAttribute('data-view') === viewName));
    viewSections.forEach(s => s.classList.toggle('active', s.id === `${viewName}-view`));

    // Trigger rendering for each view
    if (viewName === 'history') {
        // Fetch fresh history then render everything
        fetchHistory().then(() => renderHistoryView());
    }
}

function setupSearch() {
    searchInput.addEventListener('input', (e) => { searchQuery = e.target.value; renderInventory(); });
}

function updateStats() {
    const total = inventory.reduce((sum, item) => sum + item.quantity, 0);
    totalQtyEl.textContent = `${total} Items`;
    const fullCount = inventory.filter(i => (i.quantity/i.maxCapacity) >= 0.9).length;
    document.getElementById('capacity-status').textContent = fullCount > 0 ? `${fullCount} ALERTS` : 'Healthy';
    document.getElementById('capacity-status').style.color = fullCount > 0 ? 'var(--danger)' : 'var(--success)';
}

function formatDate(isoString) {
    return new Date(isoString).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.getElementById('toast-container').appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 3000);
}

// --- Settings ---
function setupSettings() {
    const form = document.getElementById('settingsForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const adminName = document.getElementById('adminNameInput').value;
        const avatar = document.getElementById('adminAvatarInput').value;
        const password = document.getElementById('newPassword').value;
        const notifications = document.getElementById('soundToggle').checked;

        const response = await fetch(`${API_URL}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminName, avatar, password, notifications })
        });

        if (response.ok) {
            document.getElementById('displayAdminName').textContent = adminName || 'Admin User';
            if (avatar) document.getElementById('avatarImg').src = avatar;
            showToast('Settings saved successfully ✓');
        } else {
            showToast('Failed to save settings.', 'danger');
        }
    });
}
