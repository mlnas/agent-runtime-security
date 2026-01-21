import { AgentActionRequest, Decision } from "@agent-security/core";

/**
 * Minimal approval model for gateway
 * In-memory storage, no persistence, no auth, no side effects
 */

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ApprovalRequest {
  approval_id: string;
  request_id: string;
  agent_id: string;
  tool_name: string;
  environment: string;
  status: ApprovalStatus;
  created_at: string; // ISO timestamp
  decided_at?: string; // ISO timestamp
}

// In-memory storage
const approvals: Map<string, ApprovalRequest> = new Map();

/**
 * Create a new approval request
 */
export function createApproval(
  request: AgentActionRequest,
  decision: Decision
): ApprovalRequest {
  const approval_id = Date.now().toString(36) + Math.random().toString(36).substr(2);
  
  const approval: ApprovalRequest = {
    approval_id,
    request_id: request.request_id,
    agent_id: request.agent.agent_id,
    tool_name: request.action.tool_name,
    environment: request.agent.environment,
    status: "PENDING",
    created_at: new Date().toISOString(),
  };
  
  approvals.set(approval_id, approval);
  return approval;
}

/**
 * Approve an approval request
 * Returns null if not found or not pending
 */
export function approveApproval(approval_id: string): ApprovalRequest | null {
  const approval = approvals.get(approval_id);
  
  if (!approval || approval.status !== "PENDING") {
    return null;
  }
  
  approval.status = "APPROVED";
  approval.decided_at = new Date().toISOString();
  
  return approval;
}

/**
 * Reject an approval request
 * Returns null if not found or not pending
 */
export function rejectApproval(approval_id: string): ApprovalRequest | null {
  const approval = approvals.get(approval_id);
  
  if (!approval || approval.status !== "PENDING") {
    return null;
  }
  
  approval.status = "REJECTED";
  approval.decided_at = new Date().toISOString();
  
  return approval;
}

/**
 * Get all pending approval requests
 */
export function getPendingApprovals(): ApprovalRequest[] {
  return Array.from(approvals.values()).filter(a => a.status === "PENDING");
}

/**
 * Get a specific approval request
 */
export function getApproval(approval_id: string): ApprovalRequest | undefined {
  return approvals.get(approval_id);
}
