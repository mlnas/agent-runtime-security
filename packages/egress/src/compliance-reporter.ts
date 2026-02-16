import { EgressEvent, EgressChannel } from "./egress-types";
import { DataClassification } from "./classifiers";

export interface ComplianceReport {
  generated_at: string;
  time_range: { from: string; to: string };
  summary: {
    total_events: number;
    blocked_events: number;
    allowed_events: number;
    classifications_detected: Record<DataClassification, number>;
    channels_used: Record<string, number>;
  };
  data_flow_map: Array<{
    agent_id: string;
    tool_name: string;
    channel: EgressChannel;
    destination?: string;
    classifications: DataClassification[];
    blocked: boolean;
    count: number;
  }>;
  evidence: {
    no_pii_egress: boolean;
    no_pci_egress: boolean;
    no_secrets_egress: boolean;
    violations: Array<{
      timestamp: string;
      agent_id: string;
      tool_name: string;
      classification: DataClassification;
      blocked: boolean;
    }>;
  };
}

/**
 * ComplianceReporter — generates audit-ready reports from egress events.
 */
export class ComplianceReporter {
  /**
   * Generate a compliance report from egress events within a time range.
   */
  generateReport(events: EgressEvent[], from?: string, to?: string): ComplianceReport {
    const now = new Date().toISOString();
    const fromDate = from ? new Date(from) : new Date(0);
    const toDate = to ? new Date(to) : new Date();

    const filtered = events.filter((e) => {
      const t = new Date(e.timestamp);
      return t >= fromDate && t <= toDate;
    });

    // Summary counts
    const classificationCounts: Record<string, number> = {};
    const channelCounts: Record<string, number> = {};
    let blocked = 0;
    let allowed = 0;

    // Data flow aggregation
    const flowMap = new Map<string, {
      agent_id: string;
      tool_name: string;
      channel: EgressChannel;
      destination?: string;
      classifications: Set<DataClassification>;
      blocked: boolean;
      count: number;
    }>();

    // Violations
    const violations: ComplianceReport["evidence"]["violations"] = [];
    let piiEgressed = false;
    let pciEgressed = false;
    let secretsEgressed = false;

    for (const event of filtered) {
      if (event.blocked) {
        blocked++;
      } else {
        allowed++;
      }

      channelCounts[event.channel] = (channelCounts[event.channel] || 0) + 1;

      for (const c of event.classifications) {
        classificationCounts[c.classification] = (classificationCounts[c.classification] || 0) + 1;

        // Track violations (classified data that was NOT blocked)
        if (!event.blocked) {
          if (c.classification === "PII") piiEgressed = true;
          if (c.classification === "PCI") pciEgressed = true;
          if (c.classification === "SECRET") secretsEgressed = true;

          violations.push({
            timestamp: event.timestamp,
            agent_id: event.agent_id,
            tool_name: event.tool_name,
            classification: c.classification,
            blocked: false,
          });
        }
      }

      // Flow map
      const key = `${event.agent_id}:${event.tool_name}:${event.channel}:${event.destination || ""}:${event.blocked}`;
      const existing = flowMap.get(key);
      if (existing) {
        existing.count++;
        for (const c of event.classifications) {
          existing.classifications.add(c.classification);
        }
      } else {
        flowMap.set(key, {
          agent_id: event.agent_id,
          tool_name: event.tool_name,
          channel: event.channel,
          destination: event.destination,
          classifications: new Set(event.classifications.map((c) => c.classification)),
          blocked: event.blocked,
          count: 1,
        });
      }
    }

    return {
      generated_at: now,
      time_range: { from: fromDate.toISOString(), to: toDate.toISOString() },
      summary: {
        total_events: filtered.length,
        blocked_events: blocked,
        allowed_events: allowed,
        classifications_detected: classificationCounts as Record<DataClassification, number>,
        channels_used: channelCounts,
      },
      data_flow_map: Array.from(flowMap.values()).map((f) => ({
        ...f,
        classifications: Array.from(f.classifications),
      })),
      evidence: {
        no_pii_egress: !piiEgressed,
        no_pci_egress: !pciEgressed,
        no_secrets_egress: !secretsEgressed,
        violations,
      },
    };
  }

  /**
   * Export a report as JSON string.
   */
  exportJson(report: ComplianceReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export a report as CSV.
   */
  exportCsv(report: ComplianceReport): string {
    const headers = ["timestamp", "agent_id", "tool_name", "classification", "blocked"];
    const rows = report.evidence.violations.map((v) =>
      [v.timestamp, v.agent_id, v.tool_name, v.classification, String(v.blocked)].join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  }
}
