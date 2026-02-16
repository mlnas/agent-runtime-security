/**
 * Compliance mapper — maps Agent-SPM controls to regulatory frameworks.
 */

export type ComplianceFramework = "eu_ai_act" | "uk_ai_governance";

export interface ComplianceControl {
  control_id: string;
  framework: ComplianceFramework;
  title: string;
  description: string;
  status: "met" | "partial" | "not_met" | "not_applicable";
  evidence?: string;
  spm_feature?: string;
}

export interface ComplianceReport {
  framework: ComplianceFramework;
  generated_at: string;
  controls: ComplianceControl[];
  summary: {
    total: number;
    met: number;
    partial: number;
    not_met: number;
    not_applicable: number;
    compliance_score: number; // 0-100
  };
}

// EU AI Act controls relevant to Agent-SPM
const EU_AI_ACT_CONTROLS: Omit<ComplianceControl, "status" | "evidence">[] = [
  {
    control_id: "EU-AI-1",
    framework: "eu_ai_act",
    title: "Risk Management System",
    description: "Establish and maintain a risk management system for AI agents",
    spm_feature: "posture/risk-scorer",
  },
  {
    control_id: "EU-AI-2",
    framework: "eu_ai_act",
    title: "Data Governance",
    description: "Ensure data quality and governance for training and operational data",
    spm_feature: "egress/classifiers",
  },
  {
    control_id: "EU-AI-3",
    framework: "eu_ai_act",
    title: "Technical Documentation",
    description: "Maintain technical documentation of AI system capabilities and limitations",
    spm_feature: "posture/inventory",
  },
  {
    control_id: "EU-AI-4",
    framework: "eu_ai_act",
    title: "Record-Keeping",
    description: "Enable automatic logging of events during AI system operation",
    spm_feature: "core/audit-log",
  },
  {
    control_id: "EU-AI-5",
    framework: "eu_ai_act",
    title: "Transparency",
    description: "Provide clear information about AI system operation to users",
    spm_feature: "posture/inventory",
  },
  {
    control_id: "EU-AI-6",
    framework: "eu_ai_act",
    title: "Human Oversight",
    description: "Enable effective human oversight of AI system operation",
    spm_feature: "core/REQUIRE_HUMAN",
  },
  {
    control_id: "EU-AI-7",
    framework: "eu_ai_act",
    title: "Accuracy, Robustness, Cybersecurity",
    description: "Ensure appropriate levels of accuracy and cybersecurity",
    spm_feature: "supply-chain/provenance",
  },
];

// UK AI Governance controls
const UK_AI_GOVERNANCE_CONTROLS: Omit<ComplianceControl, "status" | "evidence">[] = [
  {
    control_id: "UK-AI-1",
    framework: "uk_ai_governance",
    title: "Safety",
    description: "AI systems should function in a robust, secure, and safe way",
    spm_feature: "guardian/anomaly-detection",
  },
  {
    control_id: "UK-AI-2",
    framework: "uk_ai_governance",
    title: "Transparency and Explainability",
    description: "Appropriate transparency and explainability of AI systems",
    spm_feature: "core/audit-log",
  },
  {
    control_id: "UK-AI-3",
    framework: "uk_ai_governance",
    title: "Fairness",
    description: "AI systems should not discriminate or create unfair outcomes",
    spm_feature: "core/policy-engine",
  },
  {
    control_id: "UK-AI-4",
    framework: "uk_ai_governance",
    title: "Accountability and Governance",
    description: "Appropriate governance and accountability measures",
    spm_feature: "identity/agent-registry",
  },
  {
    control_id: "UK-AI-5",
    framework: "uk_ai_governance",
    title: "Contestability and Redress",
    description: "Clear routes to contest AI decisions and seek redress",
    spm_feature: "core/REQUIRE_HUMAN",
  },
];

export interface ComplianceContext {
  hasInventory: boolean;
  hasAuditLog: boolean;
  hasRiskScoring: boolean;
  hasDlp: boolean;
  hasHumanOversight: boolean;
  hasSupplyChainVerification: boolean;
  hasGuardian: boolean;
  hasIdentityManagement: boolean;
}

/**
 * ComplianceMapper — maps Agent-SPM capabilities to compliance frameworks.
 */
export class ComplianceMapper {
  /**
   * Generate a compliance report for a given framework.
   */
  generateReport(framework: ComplianceFramework, context: ComplianceContext): ComplianceReport {
    const controls = framework === "eu_ai_act"
      ? EU_AI_ACT_CONTROLS
      : UK_AI_GOVERNANCE_CONTROLS;

    const evaluated: ComplianceControl[] = controls.map((c) => ({
      ...c,
      status: this.evaluateControl(c, context),
      evidence: this.getEvidence(c, context),
    }));

    const met = evaluated.filter((c) => c.status === "met").length;
    const partial = evaluated.filter((c) => c.status === "partial").length;
    const not_met = evaluated.filter((c) => c.status === "not_met").length;
    const not_applicable = evaluated.filter((c) => c.status === "not_applicable").length;
    const applicable = evaluated.length - not_applicable;
    const score = applicable > 0 ? Math.round(((met + partial * 0.5) / applicable) * 100) : 100;

    return {
      framework,
      generated_at: new Date().toISOString(),
      controls: evaluated,
      summary: { total: evaluated.length, met, partial, not_met, not_applicable, compliance_score: score },
    };
  }

  private evaluateControl(
    control: Omit<ComplianceControl, "status" | "evidence">,
    ctx: ComplianceContext
  ): ComplianceControl["status"] {
    const feature = control.spm_feature || "";

    if (feature.includes("risk-scorer")) return ctx.hasRiskScoring ? "met" : "not_met";
    if (feature.includes("classifiers") || feature.includes("egress")) return ctx.hasDlp ? "met" : "not_met";
    if (feature.includes("inventory")) return ctx.hasInventory ? "met" : "partial";
    if (feature.includes("audit-log")) return ctx.hasAuditLog ? "met" : "not_met";
    if (feature.includes("REQUIRE_HUMAN")) return ctx.hasHumanOversight ? "met" : "partial";
    if (feature.includes("provenance") || feature.includes("supply-chain")) return ctx.hasSupplyChainVerification ? "met" : "not_met";
    if (feature.includes("guardian") || feature.includes("anomaly")) return ctx.hasGuardian ? "met" : "not_met";
    if (feature.includes("identity") || feature.includes("agent-registry")) return ctx.hasIdentityManagement ? "met" : "not_met";
    if (feature.includes("policy-engine")) return "met"; // core always present

    return "partial";
  }

  private getEvidence(
    control: Omit<ComplianceControl, "status" | "evidence">,
    ctx: ComplianceContext
  ): string {
    return `Agent-SPM feature: ${control.spm_feature || "core"}`;
  }
}
