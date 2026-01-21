# Build Order (Non-Negotiable)

## Phase 1: Demo MVP (enforcement-first)
1) core engine: schemas + policy bundle loader + evaluator -> Decision
2) gateway: intercept tool calls -> call core -> enforce allow/deny/approval
3) approvals: Slack OR simple web approve endpoint (choose one)
4) audit log: append-only event stream + export (JSON)
5) minimal UI: agent list + policy list + event list (optional for demo)

## Forbidden until Phase 2
- multi-tenant billing
- RBAC / SSO
- complex dashboards
- full GRC / compliance module
- marketplace deployment
- model training security
