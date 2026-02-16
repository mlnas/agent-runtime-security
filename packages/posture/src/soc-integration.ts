import { Event } from "@agent-security/core";

/**
 * SOC Integration — format security events for SIEM ingestion.
 */

export interface SocEvent {
  format: "cef" | "leef" | "json";
  raw: string;
  timestamp: string;
}

/**
 * SocFormatter — formats Agent-SPM events for SIEM systems.
 */
export class SocFormatter {
  /**
   * Format an event as CEF (Common Event Format) for ArcSight, QRadar, etc.
   */
  toCef(event: Event): SocEvent {
    const severity = this.mapSeverity(event.outcome);
    const reason = event.reasons.map((r) => r.message).join("; ");
    const raw = [
      "CEF:0",
      "AgentSPM",
      "AgentSecurityPosture",
      "1.0",
      event.outcome,
      reason,
      severity,
      `agent_id=${event.agent_id}`,
      `tool_name=${event.tool_name}`,
      `request_id=${event.request_id}`,
      `event_id=${event.event_id}`,
    ].join("|");

    return { format: "cef", raw, timestamp: event.timestamp };
  }

  /**
   * Format an event as LEEF (Log Event Extended Format) for QRadar.
   */
  toLeef(event: Event): SocEvent {
    const raw = [
      "LEEF:1.0",
      "AgentSPM",
      "AgentSecurityPosture",
      "1.0",
      event.outcome,
      `\tagent_id=${event.agent_id}`,
      `\ttool_name=${event.tool_name}`,
      `\trequest_id=${event.request_id}`,
      `\tevent_id=${event.event_id}`,
      `\treasons=${event.reasons.map((r) => r.code).join(",")}`,
    ].join("|");

    return { format: "leef", raw, timestamp: event.timestamp };
  }

  /**
   * Format an event as structured JSON for Splunk, ELK, etc.
   */
  toJson(event: Event): SocEvent {
    const raw = JSON.stringify({
      source: "agent-spm",
      event_type: "security_decision",
      event_id: event.event_id,
      timestamp: event.timestamp,
      agent_id: event.agent_id,
      tool_name: event.tool_name,
      outcome: event.outcome,
      reasons: event.reasons,
      request_id: event.request_id,
      plugin_source: event.plugin_source,
      severity: this.mapSeverityLabel(event.outcome),
    });

    return { format: "json", raw, timestamp: event.timestamp };
  }

  /**
   * Create a replayable timeline from a series of events.
   */
  createTimeline(events: Event[]): Array<{
    timestamp: string;
    agent_id: string;
    action: string;
    outcome: string;
    duration_ms?: number;
  }> {
    const sorted = [...events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return sorted.map((e, i) => ({
      timestamp: e.timestamp,
      agent_id: e.agent_id,
      action: e.tool_name,
      outcome: e.outcome,
      duration_ms: i > 0
        ? new Date(e.timestamp).getTime() - new Date(sorted[i - 1].timestamp).getTime()
        : undefined,
    }));
  }

  private mapSeverity(outcome: string): number {
    switch (outcome) {
      case "KILL_SWITCH": return 10;
      case "DENY": return 7;
      case "RATE_LIMITED": return 6;
      case "REQUIRE_APPROVAL":
      case "REQUIRE_HUMAN":
      case "STEP_UP":
      case "REQUIRE_TICKET": return 4;
      case "ALLOW": return 1;
      default: return 3;
    }
  }

  private mapSeverityLabel(outcome: string): string {
    switch (outcome) {
      case "KILL_SWITCH": return "critical";
      case "DENY": return "high";
      case "RATE_LIMITED": return "medium";
      case "REQUIRE_APPROVAL":
      case "REQUIRE_HUMAN": return "medium";
      case "ALLOW": return "low";
      default: return "info";
    }
  }
}

/**
 * AuditExporter — export audit trails in various formats.
 */
export class AuditExporter {
  exportJson(events: Event[]): string {
    return JSON.stringify(events, null, 2);
  }

  exportCsv(events: Event[]): string {
    const headers = ["event_id", "timestamp", "request_id", "agent_id", "tool_name", "outcome", "reasons", "plugin_source"];
    const rows = events.map((e) =>
      [
        e.event_id,
        e.timestamp,
        e.request_id,
        e.agent_id,
        e.tool_name,
        e.outcome,
        `"${e.reasons.map((r) => r.message).join("; ")}"`,
        e.plugin_source || "",
      ].join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  }
}
