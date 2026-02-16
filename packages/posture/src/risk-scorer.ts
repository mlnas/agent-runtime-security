import { InventoryItem } from "./inventory";

export interface RiskScore {
  item_id: string;
  item_type: string;
  score: number; // 0-100
  factors: Array<{ factor: string; impact: number; description: string }>;
  level: "critical" | "high" | "medium" | "low";
}

export interface FleetRiskScore {
  overall_score: number;
  level: "critical" | "high" | "medium" | "low";
  agent_scores: RiskScore[];
  top_risks: Array<{ item_id: string; score: number; description: string }>;
}

/**
 * RiskScorer — compute risk scores for individual agents and fleet-wide.
 */
export class RiskScorer {
  /**
   * Score a single inventory item.
   */
  scoreItem(item: InventoryItem): RiskScore {
    const factors: RiskScore["factors"] = [];
    let score = 0;

    if (item.type === "agent") {
      // Trust level factor
      const trustLevel = item.metadata.trust_level;
      if (!trustLevel || trustLevel === "untrusted") {
        factors.push({ factor: "low_trust", impact: 30, description: "Agent has low or no trust level" });
        score += 30;
      } else if (trustLevel === "basic") {
        factors.push({ factor: "basic_trust", impact: 10, description: "Agent has basic trust only" });
        score += 10;
      }

      // Environment factor
      if (item.metadata.environment === "prod") {
        factors.push({ factor: "production", impact: 15, description: "Agent operates in production" });
        score += 15;
      }

      // Capabilities factor
      const capabilities = item.metadata.capabilities || [];
      if (capabilities.includes("code_execute")) {
        factors.push({ factor: "code_execute", impact: 20, description: "Agent can execute code" });
        score += 20;
      }
      if (capabilities.includes("web_browse")) {
        factors.push({ factor: "web_browse", impact: 10, description: "Agent can browse the web" });
        score += 10;
      }

      // Autonomous agent factor
      if (item.metadata.agent_type === "autonomous_agent") {
        factors.push({ factor: "autonomous", impact: 15, description: "Autonomous agent with reduced oversight" });
        score += 15;
      }
    }

    if (item.type === "tool") {
      // Unverified tool
      if (!item.metadata.verified) {
        factors.push({ factor: "unverified", impact: 25, description: "Tool is not verified" });
        score += 25;
      }

      // High-risk permissions
      const perms = item.metadata.permissions_required || [];
      const highRiskPerms = perms.filter((p: string) =>
        /write|execute|admin|delete/i.test(p)
      );
      if (highRiskPerms.length > 0) {
        factors.push({
          factor: "high_risk_permissions",
          impact: highRiskPerms.length * 10,
          description: `Tool has ${highRiskPerms.length} high-risk permissions`,
        });
        score += highRiskPerms.length * 10;
      }
    }

    if (item.type === "mcp_server") {
      if (!item.metadata.verified) {
        factors.push({ factor: "unverified_mcp", impact: 30, description: "MCP server is not verified" });
        score += 30;
      }
    }

    score = Math.min(100, score);

    return {
      item_id: item.id,
      item_type: item.type,
      score,
      factors,
      level: score >= 70 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : "low",
    };
  }

  /**
   * Score the entire fleet.
   */
  scoreFleet(items: InventoryItem[]): FleetRiskScore {
    const agentItems = items.filter((i) => i.type === "agent");
    const allScores = items.map((i) => this.scoreItem(i));
    const agentScores = allScores.filter((s) => s.item_type === "agent");

    const overall = allScores.length > 0
      ? Math.round(allScores.reduce((sum, s) => sum + s.score, 0) / allScores.length)
      : 0;

    const topRisks = allScores
      .filter((s) => s.score >= 25)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((s) => ({
        item_id: s.item_id,
        score: s.score,
        description: s.factors.map((f) => f.description).join("; "),
      }));

    return {
      overall_score: overall,
      level: overall >= 70 ? "critical" : overall >= 50 ? "high" : overall >= 25 ? "medium" : "low",
      agent_scores: agentScores,
      top_risks: topRisks,
    };
  }
}
