const db = require("./database");

console.log("Starting AI-01 demo database cleanup...");

// Remove old action records
db.prepare(`
    DELETE FROM actions
`).run();

// Remove old action-related audit records
db.prepare(`
    DELETE FROM audit_logs
    WHERE event IN (
        'REMEDIATION_RECOMMENDED',
        'HIGH_RISK_REMEDIATION_RECOMMENDED',
        'RISK_POLICY_CHECK',
        'ACTION_EXECUTED',
        'ACTION_VERIFICATION',
        'HUMAN_APPROVAL'
    )
`).run();

// Reset incident for a fresh demonstration
db.prepare(`
    UPDATE incidents
    SET status = 'OPEN'
    WHERE incident_code = 'INC-001'
`).run();

console.log("AI-01 demo database cleanup completed successfully!");

db.close();