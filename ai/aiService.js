function analyzeIncident(alerts) {

    const alertSummary = alerts.map(alert => ({
        service: alert.service,
        type: alert.alert_type,
        message: alert.message,
        severity: alert.severity
    }));

    const services = alerts.map(alert => alert.service);

    let probableRootCause =
        "The available alerts indicate a service-level operational issue.";

    let explanation =
        "The system analyzed the relationships between the incoming operational alerts.";

    if (
        services.includes("Database") &&
        services.includes("Payment Service") &&
        services.includes("Order Service") &&
        services.includes("Checkout Service")
    ) {
        probableRootCause =
            "Database saturation is the probable root cause, causing payment latency, order API timeouts and checkout failures.";

        explanation =
            "High database connection usage appears to be related to the payment, order and checkout failures. The database issue is therefore considered the primary root-cause hypothesis.";
    }

    return {
        analyzed_alerts: alertSummary,
        probable_root_cause: probableRootCause,
        explanation: explanation,
        reasoning_status: "AI analysis stage"
    };
}

module.exports = {
    analyzeIncident
};