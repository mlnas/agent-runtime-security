import { v4 as uuidv4 } from "uuid";
import { Event } from "@agent-security/core";

export type CorrectionMode = "monitor" | "block" | "correct";

export interface AnomalyDetection {
  /** Max tool calls per minute per agent before flagging */
  frequency_threshold?: number;
  /** Max total actions in a sliding window */
  volume_threshold?: number;
  /** Volume window in ms. Default: 60000 */
  volume_window_ms?: number;
  /** Unusual tool sequences to flag (ordered tool name patterns) */
  suspicious_sequences?: string[][];
  /** Time-of-day anomaly: flag actions outside these hours (0-23) */
  allowed_hours?: { start: number; end: number };
}

export interface GuardianConfig {
  /** Unique guardian ID */
  id?: string;
  /** Guardian name */
  name: string;
  /** Correction mode */
  mode: CorrectionMode;
  /** Anomaly detection settings */
  anomaly: AnomalyDetection;
  /** Auto-kill agent after N violations. 0 = disabled. */
  auto_kill_threshold?: number;
  /** Callback when an anomaly is detected */
  onAnomaly?: (incident: SecurityIncident) => void;
  /** Callback when an agent is auto-killed */
  onKill?: (agentId: string, reason: string) => void;
  /** Webhook URL for escalation notifications */
  escalation_webhook?: string;
}

export interface SecurityIncident {
  incident_id: string;
  timestamp: string;
  agent_id: string;
  type: "frequency_spike" | "volume_spike" | "suspicious_sequence" | "off_hours" | "auto_kill";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  details?: Record<string, any>;
  action_taken: "logged" | "blocked" | "corrected" | "killed";
}

/**
 * GuardianAgent — monitors agent fleet, detects anomalies, and intervenes.
 */
export class GuardianAgent {
  readonly id: string;
  readonly name: string;
  private config: GuardianConfig;
  private agentTimestamps = new Map<string, number[]>();
  private agentToolSequence = new Map<string, string[]>();
  private violationCounts = new Map<string, number>();
  private killedAgents = new Set<string>();
  private incidents: SecurityIncident[] = [];

  constructor(config: GuardianConfig) {
    this.config = config;
    this.id = config.id || uuidv4();
    this.name = config.name;
  }

  /**
   * Process an audit event and check for anomalies.
   */
  processEvent(event: Event): SecurityIncident[] {
    const agentId = event.agent_id;
    const now = Date.now();
    const newIncidents: SecurityIncident[] = [];

    if (this.killedAgents.has(agentId)) return newIncidents;

    // Track timestamps
    const timestamps = this.agentTimestamps.get(agentId) || [];
    timestamps.push(now);
    this.agentTimestamps.set(agentId, timestamps);

    // Track tool sequences
    const sequence = this.agentToolSequence.get(agentId) || [];
    sequence.push(event.tool_name);
    if (sequence.length > 50) sequence.shift(); // sliding window
    this.agentToolSequence.set(agentId, sequence);

    // --- Frequency spike detection ---
    if (this.config.anomaly.frequency_threshold) {
      const windowMs = this.config.anomaly.volume_window_ms || 60000;
      const recentCount = timestamps.filter((t) => now - t < windowMs).length;
      if (recentCount > this.config.anomaly.frequency_threshold) {
        newIncidents.push(this.createIncident(agentId, "frequency_spike", "high",
          `Agent "${agentId}" made ${recentCount} calls in ${windowMs / 1000}s (threshold: ${this.config.anomaly.frequency_threshold})`,
          { count: recentCount, window_ms: windowMs }
        ));
      }
    }

    // --- Volume spike detection ---
    if (this.config.anomaly.volume_threshold) {
      const windowMs = this.config.anomaly.volume_window_ms || 60000;
      const recentCount = timestamps.filter((t) => now - t < windowMs).length;
      if (recentCount > this.config.anomaly.volume_threshold) {
        newIncidents.push(this.createIncident(agentId, "volume_spike", "high",
          `Agent "${agentId}" exceeded volume threshold: ${recentCount} actions (limit: ${this.config.anomaly.volume_threshold})`,
          { count: recentCount, threshold: this.config.anomaly.volume_threshold }
        ));
      }
    }

    // --- Suspicious sequence detection ---
    if (this.config.anomaly.suspicious_sequences) {
      for (const pattern of this.config.anomaly.suspicious_sequences) {
        if (matchesSequence(sequence, pattern)) {
          newIncidents.push(this.createIncident(agentId, "suspicious_sequence", "high",
            `Agent "${agentId}" executed suspicious tool sequence: [${pattern.join(" → ")}]`,
            { pattern, actual_sequence: sequence.slice(-pattern.length) }
          ));
        }
      }
    }

    // --- Off-hours detection ---
    if (this.config.anomaly.allowed_hours) {
      const hour = new Date().getHours();
      const { start, end } = this.config.anomaly.allowed_hours;
      const withinHours = start <= end
        ? (hour >= start && hour < end)
        : (hour >= start || hour < end); // handles overnight ranges
      if (!withinHours) {
        newIncidents.push(this.createIncident(agentId, "off_hours", "medium",
          `Agent "${agentId}" active outside allowed hours (${start}:00-${end}:00, current: ${hour}:00)`,
          { current_hour: hour, allowed_start: start, allowed_end: end }
        ));
      }
    }

    // --- Auto-kill check ---
    if (newIncidents.length > 0 && this.config.auto_kill_threshold) {
      const violations = (this.violationCounts.get(agentId) || 0) + newIncidents.length;
      this.violationCounts.set(agentId, violations);

      if (violations >= this.config.auto_kill_threshold) {
        this.killedAgents.add(agentId);
        const killIncident = this.createIncident(agentId, "auto_kill", "critical",
          `Agent "${agentId}" auto-killed after ${violations} violations (threshold: ${this.config.auto_kill_threshold})`,
          { total_violations: violations }
        );
        newIncidents.push(killIncident);
        this.config.onKill?.(agentId, killIncident.description);
      }
    }

    // Notify
    for (const incident of newIncidents) {
      this.incidents.push(incident);
      this.config.onAnomaly?.(incident);
    }

    // Prune old timestamps
    this.pruneTimestamps(agentId);

    return newIncidents;
  }

  /**
   * Check if an agent has been killed by the guardian.
   */
  isKilled(agentId: string): boolean {
    return this.killedAgents.has(agentId);
  }

  /**
   * Revive a killed agent.
   */
  revive(agentId: string): void {
    this.killedAgents.delete(agentId);
    this.violationCounts.delete(agentId);
  }

  /**
   * Get all security incidents.
   */
  getIncidents(): SecurityIncident[] {
    return [...this.incidents];
  }

  /**
   * Get incidents for a specific agent.
   */
  getAgentIncidents(agentId: string): SecurityIncident[] {
    return this.incidents.filter((i) => i.agent_id === agentId);
  }

  /**
   * Clear all state.
   */
  reset(): void {
    this.agentTimestamps.clear();
    this.agentToolSequence.clear();
    this.violationCounts.clear();
    this.killedAgents.clear();
    this.incidents = [];
  }

  private createIncident(
    agentId: string,
    type: SecurityIncident["type"],
    severity: SecurityIncident["severity"],
    description: string,
    details?: Record<string, any>
  ): SecurityIncident {
    const actionMap: Record<CorrectionMode, SecurityIncident["action_taken"]> = {
      monitor: "logged",
      block: "blocked",
      correct: "corrected",
    };

    return {
      incident_id: uuidv4(),
      timestamp: new Date().toISOString(),
      agent_id: agentId,
      type,
      severity,
      description,
      details,
      action_taken: type === "auto_kill" ? "killed" : actionMap[this.config.mode],
    };
  }

  private pruneTimestamps(agentId: string): void {
    const timestamps = this.agentTimestamps.get(agentId);
    if (!timestamps) return;
    const windowMs = (this.config.anomaly.volume_window_ms || 60000) * 2;
    const cutoff = Date.now() - windowMs;
    const pruned = timestamps.filter((t) => t > cutoff);
    this.agentTimestamps.set(agentId, pruned);
  }
}

function matchesSequence(actual: string[], pattern: string[]): boolean {
  if (actual.length < pattern.length) return false;
  const tail = actual.slice(-pattern.length);
  return tail.every((t, i) => t === pattern[i] || pattern[i] === "*");
}

// ---------------------------------------------------------------------------
// Guardian Blueprints
// ---------------------------------------------------------------------------

export const BLUEPRINT_ENGINEERING: GuardianConfig = {
  name: "Engineering Guardian",
  mode: "block",
  anomaly: {
    frequency_threshold: 60,
    volume_threshold: 200,
    suspicious_sequences: [
      ["read_secrets", "http_request"],
      ["query_db", "send_email"],
    ],
    allowed_hours: { start: 6, end: 22 },
  },
  auto_kill_threshold: 5,
};

export const BLUEPRINT_FINANCE: GuardianConfig = {
  name: "Finance Guardian",
  mode: "block",
  anomaly: {
    frequency_threshold: 30,
    volume_threshold: 100,
    suspicious_sequences: [
      ["query_customer_db", "send_email"],
      ["trigger_payment", "trigger_payment"],
    ],
    allowed_hours: { start: 8, end: 18 },
  },
  auto_kill_threshold: 3,
};

export const BLUEPRINT_SOC: GuardianConfig = {
  name: "SOC Guardian",
  mode: "monitor",
  anomaly: {
    frequency_threshold: 100,
    volume_threshold: 500,
    suspicious_sequences: [
      ["read_secrets", "*", "http_request"],
      ["shell_execute", "shell_execute", "shell_execute"],
    ],
  },
  auto_kill_threshold: 10,
};
