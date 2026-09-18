const Database = require("better-sqlite3");

const db = new Database("ai01.db");

db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_type TEXT NOT NULL,
        service TEXT NOT NULL,
        message TEXT NOT NULL,
        severity TEXT,
        timestamp TEXT NOT NULL,
        status TEXT DEFAULT 'NEW'
    );

    CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_code TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        root_cause TEXT,
        severity TEXT,
        business_impact TEXT,
        status TEXT DEFAULT 'OPEN',
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id INTEGER,
        action_name TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        approval_required INTEGER DEFAULT 0,
        approval_status TEXT DEFAULT 'PENDING',
        execution_status TEXT DEFAULT 'PENDING',
        executed_at TEXT,
        FOREIGN KEY (incident_id) REFERENCES incidents(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id INTEGER,
        event TEXT NOT NULL,
        details TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (incident_id) REFERENCES incidents(id)
    );
`);

// Add incident relationship to alerts if it does not already exist
const alertColumns = db.prepare(`
    PRAGMA table_info(alerts)
`).all();

const hasIncidentId = alertColumns.some(
    column => column.name === "incident_id"
);

if (!hasIncidentId) {
    db.exec(`
        ALTER TABLE alerts
        ADD COLUMN incident_id INTEGER
    `);

    console.log("Alert incident relationship column added successfully!");
}

// Link existing correlated alerts to the first prototype incident
db.prepare(`
    UPDATE alerts
    SET incident_id = (
        SELECT id
        FROM incidents
        ORDER BY id ASC
        LIMIT 1
    )
    WHERE status = 'CORRELATED'
      AND incident_id IS NULL
`).run();

console.log("AI-01 SQLite database initialized successfully!");

module.exports = db;