// database.js — SQLite setup, schema creation, and seed data
'use strict';
const Database = require('better-sqlite3');
const bcrypt   = require('bcrypt');
const path     = require('path');

const DB_PATH = path.join(__dirname, 'scrap.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    permissions TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id   TEXT NOT NULL UNIQUE,
    full_name     TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role_id       INTEGER NOT NULL REFERENCES roles(id),
    branch        TEXT NOT NULL,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_login    TEXT
  );

  CREATE TABLE IF NOT EXISTS scrap_categories (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL UNIQUE,
    description    TEXT,
    unit           TEXT NOT NULL DEFAULT 'kg',
    price_per_unit REAL NOT NULL DEFAULT 0,
    hazard_level   TEXT NOT NULL DEFAULT 'low',
    active         INTEGER NOT NULL DEFAULT 1,
    created_by     INTEGER REFERENCES users(id),
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pickup_requests (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    request_no     TEXT NOT NULL UNIQUE,
    requester_id   INTEGER NOT NULL REFERENCES users(id),
    category_id    INTEGER NOT NULL REFERENCES scrap_categories(id),
    quantity       REAL NOT NULL,
    location       TEXT NOT NULL,
    branch         TEXT NOT NULL,
    preferred_date TEXT NOT NULL,
    notes          TEXT,
    status         TEXT NOT NULL DEFAULT 'pending',
    reviewed_by    INTEGER REFERENCES users(id),
    reviewed_at    TEXT,
    review_notes   TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id     INTEGER NOT NULL REFERENCES pickup_requests(id),
    amount         REAL NOT NULL,
    weight_actual  REAL,
    processed_by   INTEGER REFERENCES users(id),
    processed_at   TEXT NOT NULL DEFAULT (datetime('now')),
    payment_status TEXT NOT NULL DEFAULT 'pending',
    payment_ref    TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id),
    action     TEXT NOT NULL,
    entity     TEXT NOT NULL,
    entity_id  INTEGER,
    detail     TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ─── Seed default roles ────────────────────────────────────────────────────
const seedRoles = db.prepare(
  `INSERT OR IGNORE INTO roles (name, permissions) VALUES (?, ?)`
);
seedRoles.run('admin',   JSON.stringify(['*']));
seedRoles.run('manager', JSON.stringify(['dashboard','inventory','pickup_requests','transactions','categories']));
seedRoles.run('agent',   JSON.stringify(['dashboard','pickup_requests:own','inventory:read']));

// ─── Seed default users (only if none exist) ──────────────────────────────
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
if (userCount.c === 0) {
  const SALT = 12;
  const adminHash   = bcrypt.hashSync('Admin@1234',   SALT);
  const managerHash = bcrypt.hashSync('Manager@1234', SALT);
  const agentHash   = bcrypt.hashSync('Agent@1234',   SALT);

  const adminRole   = db.prepare("SELECT id FROM roles WHERE name='admin'").get();
  const managerRole = db.prepare("SELECT id FROM roles WHERE name='manager'").get();
  const agentRole   = db.prepare("SELECT id FROM roles WHERE name='agent'").get();

  const insertUser = db.prepare(`
    INSERT INTO users (employee_id, full_name, email, password_hash, role_id, branch)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertUser.run('IOC123', 'Admin User',      'admin@iocl.com',   adminHash,   adminRole.id,   'Delhi HQ');
  insertUser.run('IOC-MGR-001', 'Priya Sharma', 'priya@iocl.com', managerHash, managerRole.id, 'Mumbai Refineries');
  insertUser.run('IOC-AGT-001', 'Ravi Kumar',   'ravi@iocl.com',  agentHash,   agentRole.id,   'Mumbai Refineries');

  // Seed scrap categories
  const insertCat = db.prepare(`
    INSERT INTO scrap_categories (name, description, unit, price_per_unit, hazard_level)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertCat.run('E-Waste',     'Electronic waste: PCBs, wiring, components', 'kg',  45.00, 'medium');
  insertCat.run('Iron Scrap',  'Iron and mild steel scrap material',          'kg',  28.50, 'low');
  insertCat.run('Copper Wire', 'Insulated copper wiring scrap',               'kg', 480.00, 'low');
  insertCat.run('Aluminium',   'Aluminium sheet and profile offcuts',         'kg', 145.00, 'low');
  insertCat.run('Rubber',      'Used rubber hoses, gaskets, tyres',           'kg',  12.00, 'low');
  insertCat.run('Hazardous',   'Batteries, solvents, chemical containers',    'unit', 0.00, 'high');
}

// ─── Helper: audit log writer ─────────────────────────────────────────────
function writeAudit({ userId, action, entity, entityId, detail, ip }) {
  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity, entity_id, detail, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId || null, action, entity, entityId || null,
         detail ? JSON.stringify(detail) : null, ip || null);
}

// ─── Helper: generate request number ─────────────────────────────────────
function generateRequestNo() {
  const year  = new Date().getFullYear();
  const count = db.prepare('SELECT COUNT(*) as c FROM pickup_requests').get().c + 1;
  return `REQ-${year}-${String(count).padStart(4, '0')}`;
}

module.exports = { db, writeAudit, generateRequestNo };
