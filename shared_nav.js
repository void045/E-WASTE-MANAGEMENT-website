/* shared_nav.js — Sidebar, auth guard, toast, and session helpers
   Include this AFTER shared.css on every protected page */
'use strict';

// ── Auth helpers ────────────────────────────────────────────────
const Auth = {
  getToken:    ()  => localStorage.getItem('ioc_token'),
  getUser:     ()  => { try { return JSON.parse(localStorage.getItem('ioc_user') || 'null'); } catch { return null; } },
  setSession:  (token, user) => { localStorage.setItem('ioc_token', token); localStorage.setItem('ioc_user', JSON.stringify(user)); },
  clearSession:()  => { localStorage.removeItem('ioc_token'); localStorage.removeItem('ioc_user'); },
  isLoggedIn:  ()  => !!localStorage.getItem('ioc_token'),

  // Redirect to login if not authenticated
  guard: (allowedRoles) => {
    if (!Auth.isLoggedIn()) { window.location.href = '/login_page/index.html'; return false; }
    const user = Auth.getUser();
    if (allowedRoles && !allowedRoles.includes(user?.role)) {
      alert('Access denied. Insufficient permissions.');
      window.location.href = '/dashboard.html';
      return false;
    }
    return true;
  }
};

// ── API helper ──────────────────────────────────────────────────
const API = {
  async call(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Auth.getToken()}` }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    if (res.status === 401) { Auth.clearSession(); window.location.href = '/login_page/index.html'; return; }
    return res;
  },
  get:    (path)       => API.call('GET',    path),
  post:   (path, body) => API.call('POST',   path, body),
  put:    (path, body) => API.call('PUT',    path, body),
  delete: (path)       => API.call('DELETE', path)
};

// ── Toast ────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type]||''}</span> ${msg}`;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Sidebar builder ──────────────────────────────────────────────
function buildSidebar(activePage) {
  const user = Auth.getUser();
  if (!user) return;

  const navItems = [
    { href: '/dashboard.html',       icon: '🏠', label: 'Dashboard',      roles: ['admin','manager','agent'] },
    { href: '/pickup-requests.html', icon: '🚛', label: 'Pickup Requests', roles: ['admin','manager','agent'] },
    { href: '/categories.html',      icon: '📂', label: 'Categories',      roles: ['admin','manager'] },
    { href: '/transactions.html',    icon: '💰', label: 'Transactions',    roles: ['admin','manager'] },
    { href: '/users.html',           icon: '👥', label: 'User Management', roles: ['admin'] },
  ];

  const roleClass = { admin: 'role-admin', manager: 'role-manager', agent: 'role-agent' };
  const initials  = (user.full_name || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();

  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <img src="/ioc_logo.svg" alt="IOC"
           onerror="this.src='/ioc_logo.png'; this.onerror=null;"
           style="width:34px;height:34px;object-fit:contain;border-radius:6px;background:rgba(204,0,0,0.15);padding:3px;">
      <div class="sidebar-logo-text">
        <div class="name" style="font-size:0.85rem;font-weight:700;color:#fff;">IndianOil Portal</div>
        <div class="sub" style="font-size:0.65rem;color:#4b5563;margin-top:1px;">Scrap Management</div>
      </div>
    </div>
    <div class="sidebar-user" style="padding:1rem 1.5rem;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:0.75rem;">
      <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#CC0000,#ff4444);display:flex;align-items:center;justify-content:center;font-size:0.85rem;font-weight:700;color:#fff;flex-shrink:0;">${initials}</div>
      <div>
        <div style="font-size:0.83rem;font-weight:600;color:#e5e7eb;">${user.full_name}</div>
        <div style="font-size:0.68rem;color:#4b5563;margin-top:1px;">${user.branch}</div>
        <span class="role-badge ${roleClass[user.role] || ''}">${user.role}</span>
      </div>
    </div>
    <nav class="nav-section">
      <div class="nav-label">Navigation</div>
      ${navItems.filter(n => n.roles.includes(user.role)).map(n => `
        <a class="nav-link ${activePage === n.href ? 'active' : ''}" href="${n.href}">
          <span class="icon">${n.icon}</span> ${n.label}
        </a>
      `).join('')}
    </nav>
    <div class="sidebar-footer">
      <button class="btn-logout" onclick="logout()">🚪 &nbsp;Sign Out</button>
    </div>
  `;
}

function logout() {
  Auth.clearSession();
  window.location.href = '/login_page/index.html';
}

// ── Hamburger toggle ─────────────────────────────────────────────
function initHamburger() {
  const hamburger = document.getElementById('hamburger');
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebar-overlay');
  if (!hamburger) return;
  hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
  });
  if (overlay) overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  });
}

// ── Format helpers ────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtCurrency(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}
function statusBadge(s) {
  return `<span class="badge badge-${s}">${s}</span>`;
}
