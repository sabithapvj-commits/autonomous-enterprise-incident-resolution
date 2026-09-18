const express = require("express");
const db = require("./database");
const cors = require("cors");
const { analyzeIncident } = require("./ai/aiService");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("AI-01 Incident Resolution Engine Backend is Running!");
});

app.post("/api/alerts", (req, res) => {
    try {
        const {
            alert_type,
            service,
            message,
            severity
        } = req.body;

        if (!alert_type || !service || !message) {
            return res.status(400).json({
                error: "alert_type, service and message are required"
            });
        }

        const timestamp = new Date().toISOString();

        const stmt = db.prepare(`
            INSERT INTO alerts
            (alert_type, service, message, severity, timestamp)
            VALUES (?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            alert_type,
            service,
            message,
            severity || "MEDIUM",
            timestamp
        );

        res.status(201).json({
            success: true,
            message: "Alert created successfully",
            alert_id: result.lastInsertRowid
        });

    } catch (error) {
        res.status(500).json({
            error: "Failed to create alert"
        });
    }
});

app.post("/api/incidents/correlate", (req, res) => {
    try {
        const alerts = db.prepare(`
            SELECT *
            FROM alerts
            WHERE status = 'NEW'
            ORDER BY timestamp ASC
        `).all();

        if (alerts.length === 0) {
            return res.json({
                success: true,
                message: "No new alerts available for correlation"
            });
        }

        const incidentCode = `INC-${String(
            db.prepare("SELECT COUNT(*) AS count FROM incidents").get().count + 1
        ).padStart(3, "0")}`;

        const title = "Payment Platform Degradation";

        const rootCause =
            "Multiple related service alerts indicate possible database saturation affecting payment, order and checkout services.";

        const severity = "HIGH";

        const businessImpact =
            "Payment, Order and Checkout services are affected.";

        const createdAt = new Date().toISOString();

        const incidentStmt = db.prepare(`
            INSERT INTO incidents
            (incident_code, title, root_cause, severity, business_impact, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const result = incidentStmt.run(
            incidentCode,
            title,
            rootCause,
            severity,
            businessImpact,
            "OPEN",
            createdAt
        );

        const incidentId = result.lastInsertRowid;

        db.prepare(`
    UPDATE alerts
    SET status = 'CORRELATED'
    WHERE status = 'NEW'
`).run();

        const auditStmt = db.prepare(`
            INSERT INTO audit_logs
            (incident_id, event, details, timestamp)
            VALUES (?, ?, ?, ?)
        `);

        auditStmt.run(
            incidentId,
            "ALERT_CORRELATION",
            `${alerts.length} related alerts correlated into ${incidentCode}`,
            createdAt
        );

        res.json({
            success: true,
            message: "Alerts correlated successfully",
            incident: {
                id: incidentId,
                incident_code: incidentCode,
                title: title,
                alert_count: alerts.length,
                severity: severity,
                business_impact: businessImpact,
                root_cause: rootCause,
                status: "OPEN"
            }
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Failed to correlate alerts"
        });
    }
});

app.post("/api/incidents/:id/investigate", (req, res) => {
    try {
        const incidentId = req.params.id;

        const incident = db.prepare(`
            SELECT *
            FROM incidents
            WHERE id = ?
        `).get(incidentId);

        if (!incident) {
            return res.status(404).json({
                success: false,
                error: "Incident not found"
            });
        }

        const alerts = db.prepare(`
    SELECT *
    FROM alerts
    WHERE incident_id = ?
    ORDER BY timestamp ASC
`).all(incidentId);

const aiAnalysis = analyzeIncident(alerts);

const rootCause = aiAnalysis.probable_root_cause;

const investigationSummary =
    aiAnalysis.explanation;

const investigatedAt = new Date().toISOString();

        db.prepare(`
            UPDATE incidents
            SET root_cause = ?
            WHERE id = ?
        `).run(rootCause, incidentId);

        db.prepare(`
            INSERT INTO audit_logs
            (incident_id, event, details, timestamp)
            VALUES (?, ?, ?, ?)
        `).run(
            incidentId,
            "INVESTIGATION_COMPLETED",
            investigationSummary,
            investigatedAt
        );

        res.json({
            success: true,
            message: "Incident investigation completed",
            investigation: {
                incident_code: incident.incident_code,
                alerts_analyzed: alerts.length,
                probable_root_cause: rootCause,
                summary: investigationSummary,
                timestamp: investigatedAt
            }
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Investigation failed"
        });
    }
});

app.post("/api/incidents/:id/assess", (req, res) => {
    try {
        const incidentId = req.params.id;

        const incident = db.prepare(`
            SELECT *
            FROM incidents
            WHERE id = ?
        `).get(incidentId);

        if (!incident) {
            return res.status(404).json({
                success: false,
                error: "Incident not found"
            });
        }

        const affectedServices = [
            "Payment Service",
            "Order Service",
            "Checkout Service"
        ];

        const userImpact =
            "Customers may experience payment failures, order timeouts and checkout failures.";

        const businessImpact =
            "Revenue-generating payment and order operations are affected.";

        const priority = "HIGH";

        db.prepare(`
            UPDATE incidents
            SET severity = ?,
                business_impact = ?
            WHERE id = ?
        `).run(
            priority,
            businessImpact,
            incidentId
        );

        const timestamp = new Date().toISOString();

        db.prepare(`
            INSERT INTO audit_logs
            (incident_id, event, details, timestamp)
            VALUES (?, ?, ?, ?)
        `).run(
            incidentId,
            "BUSINESS_IMPACT_ASSESSED",
            `Priority: ${priority}. Affected services: ${affectedServices.join(", ")}. User impact: ${userImpact}`,
            timestamp
        );

        res.json({
            success: true,
            message: "Business impact assessment completed",
            assessment: {
                incident_code: incident.incident_code,
                affected_services: affectedServices,
                user_impact: userImpact,
                business_impact: businessImpact,
                priority: priority,
                timestamp: timestamp
            }
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Business impact assessment failed"
        });
    }
});

app.post("/api/incidents/:id/remediation", (req, res) => {
    try {
        const incidentId = req.params.id;

        const incident = db.prepare(`
            SELECT *
            FROM incidents
            WHERE id = ?
        `).get(incidentId);

        if (!incident) {
            return res.status(404).json({
                success: false,
                error: "Incident not found"
            });
        }

        const recommendedAction =
            "Restart Payment Service";

        const reason =
            "Restarting the affected Payment Service is a low-risk and reversible action that may restore service availability without modifying persistent data.";

        const riskLevel = "LOW";

        const timestamp = new Date().toISOString();

        const actionStmt = db.prepare(`
            INSERT INTO actions
            (incident_id, action_name, risk_level, approval_required, approval_status, execution_status)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const result = actionStmt.run(
            incidentId,
            recommendedAction,
            riskLevel,
            0,
            "NOT_REQUIRED",
            "PENDING"
        );

        db.prepare(`
            INSERT INTO audit_logs
            (incident_id, event, details, timestamp)
            VALUES (?, ?, ?, ?)
        `).run(
            incidentId,
            "REMEDIATION_RECOMMENDED",
            `Recommended action: ${recommendedAction}. Risk: ${riskLevel}. Reason: ${reason}`,
            timestamp
        );

        res.json({
            success: true,
            message: "Remediation recommendation generated",
            remediation: {
                action_id: result.lastInsertRowid,
                incident_code: incident.incident_code,
                recommended_action: recommendedAction,
                risk_level: riskLevel,
                approval_required: false,
                reason: reason,
                status: "READY_FOR_EXECUTION",
                timestamp: timestamp
            }
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Failed to generate remediation recommendation"
        });
    }
});

app.post("/api/incidents/:id/high-risk-remediation", (req, res) => {
    try {
        const incidentId = req.params.id;

        const incident = db.prepare(`
            SELECT *
            FROM incidents
            WHERE id = ?
        `).get(incidentId);

        if (!incident) {
            return res.status(404).json({
                success: false,
                error: "Incident not found"
            });
        }

        const actionName = "Rollback Deployment";
        const riskLevel = "HIGH";
        const timestamp = new Date().toISOString();

        const result = db.prepare(`
            INSERT INTO actions
            (incident_id, action_name, risk_level,
             approval_required, approval_status, execution_status)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            incidentId,
            actionName,
            riskLevel,
            1,
            "PENDING",
            "PENDING"
        );

        db.prepare(`
            INSERT INTO audit_logs
            (incident_id, event, details, timestamp)
            VALUES (?, ?, ?, ?)
        `).run(
            incidentId,
            "HIGH_RISK_REMEDIATION_RECOMMENDED",
            "Rollback Deployment recommended. Human approval is required before execution.",
            timestamp
        );

        res.json({
            success: true,
            message: "High-risk remediation generated",
            remediation: {
                action_id: result.lastInsertRowid,
                action_name: actionName,
                risk_level: riskLevel,
                approval_required: true,
                approval_status: "PENDING",
                execution_status: "PENDING"
            }
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Failed to generate high-risk remediation"
        });
    }
});

app.post("/api/actions/:id/risk-check", (req, res) => {
    try {
        const actionId = req.params.id;

        const action = db.prepare(`
            SELECT *
            FROM actions
            WHERE id = ?
        `).get(actionId);

        if (!action) {
            return res.status(404).json({
                success: false,
                error: "Action not found"
            });
        }

        let riskLevel = "MEDIUM";
        let approvalRequired = true;
        let decision = "HUMAN_APPROVAL_REQUIRED";

        if (action.action_name === "Restart Payment Service") {
            riskLevel = "LOW";
            approvalRequired = false;
            decision = "AUTONOMOUS_EXECUTION_ALLOWED";
        }

        if (
            action.action_name === "Rollback Deployment" ||
            action.action_name === "Delete Database"
        ) {
            riskLevel = "HIGH";
            approvalRequired = true;
            decision = "HUMAN_APPROVAL_REQUIRED";
        }

        const approvalStatus =
            approvalRequired ? "PENDING" : "NOT_REQUIRED";

        db.prepare(`
            UPDATE actions
            SET risk_level = ?,
                approval_required = ?,
                approval_status = ?
            WHERE id = ?
        `).run(
            riskLevel,
            approvalRequired ? 1 : 0,
            approvalStatus,
            actionId
        );

        const timestamp = new Date().toISOString();

        db.prepare(`
            INSERT INTO audit_logs
            (incident_id, event, details, timestamp)
            VALUES (?, ?, ?, ?)
        `).run(
            action.incident_id,
            "RISK_POLICY_CHECK",
            `Action: ${action.action_name}. Risk: ${riskLevel}. Decision: ${decision}`,
            timestamp
        );

        res.json({
            success: true,
            message: "Risk and policy check completed",
            risk_check: {
                action_id: action.id,
                action_name: action.action_name,
                risk_level: riskLevel,
                approval_required: approvalRequired,
                decision: decision,
                approval_status: approvalStatus,
                timestamp: timestamp
            }
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Risk policy check failed"
        });
    }
});

app.post("/api/actions/:id/execute", (req, res) => {
    try {
        const actionId = req.params.id;

        const action = db.prepare(`
            SELECT *
            FROM actions
            WHERE id = ?
        `).get(actionId);

        if (!action) {
            return res.status(404).json({
                success: false,
                error: "Action not found"
            });
        }

       if (
    action.approval_required === 1 &&
    action.approval_status !== "APPROVED"
) {
    return res.status(403).json({
        success: false,
        error: "Human approval is required before executing this action"
    });
}

        if (
    action.risk_level !== "LOW" &&
    action.approval_status !== "APPROVED"
) {
    return res.status(403).json({
        success: false,
        error: "Only low-risk actions or approved high-risk actions can be executed"
    });
}

        // Simulated execution for the prototype
        let executionResult = "Action completed successfully";

if (action.action_name === "Restart Payment Service") {
    executionResult = "Payment Service restarted successfully";
} else if (action.action_name === "Rollback Deployment") {
    executionResult = "Deployment rollback completed successfully";
} else if (action.action_name === "Delete Database") {
    executionResult = "Database deletion action completed successfully";
}

        const timestamp = new Date().toISOString();

        db.prepare(`
            UPDATE actions
            SET execution_status = ?,
                executed_at = ?
            WHERE id = ?
        `).run(
            "SUCCESS",
            timestamp,
            actionId
        );

        db.prepare(`
            INSERT INTO audit_logs
            (incident_id, event, details, timestamp)
            VALUES (?, ?, ?, ?)
        `).run(
            action.incident_id,
            "ACTION_EXECUTED",
            `Autonomous action executed: ${action.action_name}. Result: ${executionResult}`,
            timestamp
        );

        res.json({
            success: true,
            message: "Action executed successfully",
            execution: {
                action_id: action.id,
                action_name: action.action_name,
                risk_level: action.risk_level,
                execution_status: "SUCCESS",
                result: executionResult,
                executed_at: timestamp
            }
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Action execution failed"
        });
    }
});

app.post("/api/actions/:id/verify", (req, res) => {
    try {
        const actionId = req.params.id;

        const action = db.prepare(`
            SELECT *
            FROM actions
            WHERE id = ?
        `).get(actionId);

        if (!action) {
            return res.status(404).json({
                success: false,
                error: "Action not found"
            });
        }

        if (action.execution_status !== "SUCCESS") {
            return res.status(400).json({
                success: false,
                error: "Action has not been successfully executed"
            });
        }

        // Simulated health verification for the prototype
        const serviceHealth = "HEALTHY";
        const errorRate = "0.5%";
        const recoveryStatus = "RECOVERED";

        const verificationPassed =
            serviceHealth === "HEALTHY" &&
            recoveryStatus === "RECOVERED";

        const timestamp = new Date().toISOString();

        db.prepare(`
            INSERT INTO audit_logs
            (incident_id, event, details, timestamp)
            VALUES (?, ?, ?, ?)
        `).run(
            action.incident_id,
            "ACTION_VERIFICATION",
            `Service health: ${serviceHealth}. Error rate: ${errorRate}. Recovery status: ${recoveryStatus}. Verification: ${verificationPassed ? "PASSED" : "FAILED"}`,
            timestamp
        );

        if (verificationPassed) {
            db.prepare(`
                UPDATE incidents
                SET status = ?
                WHERE id = ?
            `).run(
                "RESOLVED",
                action.incident_id
            );
        }

        res.json({
            success: true,
            message: "Action verification completed",
            verification: {
                action_id: action.id,
                service_health: serviceHealth,
                error_rate: errorRate,
                recovery_status: recoveryStatus,
                verification_status:
                    verificationPassed ? "PASSED" : "FAILED",
                incident_status:
                    verificationPassed ? "RESOLVED" : "OPEN",
                timestamp: timestamp
            }
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Verification failed"
        });
    }
});

app.post("/api/actions/:id/approve", (req, res) => {
    try {
        const actionId = req.params.id;

        const action = db.prepare(`
            SELECT *
            FROM actions
            WHERE id = ?
        `).get(actionId);

        if (!action) {
            return res.status(404).json({
                success: false,
                error: "Action not found"
            });
        }

        if (action.approval_required !== 1) {
            return res.status(400).json({
                success: false,
                error: "Human approval is not required for this action"
            });
        }

        if (action.approval_status === "APPROVED") {
            return res.status(400).json({
                success: false,
                error: "Action is already approved"
            });
        }

        db.prepare(`
            UPDATE actions
            SET approval_status = ?
            WHERE id = ?
        `).run(
            "APPROVED",
            actionId
        );

        const timestamp = new Date().toISOString();

        db.prepare(`
            INSERT INTO audit_logs
            (incident_id, event, details, timestamp)
            VALUES (?, ?, ?, ?)
        `).run(
            action.incident_id,
            "HUMAN_APPROVAL",
            `Human approval granted for action: ${action.action_name}`,
            timestamp
        );

        res.json({
            success: true,
            message: "Human approval granted",
            approval: {
                action_id: action.id,
                action_name: action.action_name,
                risk_level: action.risk_level,
                approval_status: "APPROVED",
                execution_status: action.execution_status,
                timestamp: timestamp
            }
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Approval process failed"
        });
    }
});

app.get("/api/alerts", (req, res) => {
    try {
        const alerts = db.prepare(`
            SELECT *
            FROM alerts
            ORDER BY id DESC
        `).all();

        res.json({
            success: true,
            count: alerts.length,
            alerts: alerts
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: "Failed to fetch alerts"
        });
    }
});

app.get("/api/audit-logs", (req, res) => {
    try {
        const logs = db.prepare(`
            SELECT
                id,
                incident_id,
                event,
                details,
                timestamp
            FROM audit_logs
            ORDER BY id DESC
        `).all();

        res.json({
            success: true,
            count: logs.length,
            logs: logs
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Failed to fetch audit logs"
        });
    }
});

app.get("/api/incidents", (req, res) => {
    try {
        const incidents = db.prepare(`
            SELECT
                id,
                incident_code,
                title,
                root_cause,
                severity,
                business_impact,
                status,
                created_at
            FROM incidents
            ORDER BY id DESC
        `).all();

        res.json({
            success: true,
            count: incidents.length,
            incidents: incidents
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Failed to fetch incidents"
        });
    }
});

app.get("/api/incidents/:id", (req, res) => {
    try {
        const incidentId = req.params.id;

        const incident = db.prepare(`
            SELECT
                id,
                incident_code,
                title,
                root_cause,
                severity,
                business_impact,
                status,
                created_at
            FROM incidents
            WHERE id = ?
        `).get(incidentId);

        if (!incident) {
            return res.status(404).json({
                success: false,
                error: "Incident not found"
            });
        }

        const actions = db.prepare(`
            SELECT
                id,
                action_name,
                risk_level,
                approval_required,
                approval_status,
                execution_status,
                executed_at
            FROM actions
            WHERE incident_id = ?
            ORDER BY id DESC
        `).all(incidentId);

        const auditLogs = db.prepare(`
            SELECT
                id,
                event,
                details,
                timestamp
            FROM audit_logs
            WHERE incident_id = ?
            ORDER BY id DESC
        `).all(incidentId);

        res.json({
            success: true,
            incident: incident,
            actions: actions,
            audit_logs: auditLogs
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Failed to fetch incident details"
        });
    }
});



app.listen(PORT, () => {
    console.log(`AI-01 Backend running on http://localhost:${PORT}`);
});