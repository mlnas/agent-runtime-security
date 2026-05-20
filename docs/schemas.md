# Schema Reference (v0.3)

Complete type definitions for the Agent-SPM platform. Source of truth: [`core/src/schemas.ts`](../core/src/schemas.ts).

---

## Version History

| Version | Changes |
|---------|---------|
| v0.1 | Initial schemas: `AgentActionRequest`, `Decision`, `Event`, `PolicyBundle`, `PolicyRule` |
| v0.2 | Flexible environments (any string), extensible context, advanced `when` conditions (`not_contains`, `matches_regex`, `tool_args_match`), plugin system (`SecurityPlugin`, lifecycle hooks), 3 decision outcomes |
| v0.3 | Agent identity (`AgentIdentity`, `AgentTrustLevel`, `AgentType`, `AgentAttestation`), tool identity (`ToolIdentity`), identity-aware policy matching (`agent_type`, `trust_level_min`, `agent_roles_any`, `tool_provider`), 6 decision outcomes (`STEP_UP`, `REQUIRE_TICKET`, `REQUIRE_HUMAN`), 11 event outcomes, delegation chains |

---

## Agent Identity

### `AgentTrustLevel`

Hierarchical trust levels. Higher levels inherit all privileges of lower levels.

```typescript
type AgentTrustLevel = 'untrusted' | 'basic' | 'verified' | 'privileged' | 'system';
```

| Level | Numeric | Description |
|-------|---------|-------------|
| `untrusted` | 0 | Unknown or unverified agent. Most restrictive. |
| `basic` | 1 | Registered but minimally verified. |
| `verified` | 2 | Identity confirmed, standard operations. |
| `privileged` | 3 | Elevated access for sensitive operations. |
| `system` | 4 | Internal platform agents. Highest trust. |

### `AgentType`

```typescript
type AgentType = 'ide_agent' | 'pr_agent' | 'chat_agent' | 'workflow_agent' | 'autonomous_agent' | string;
```

Built-in types cover common agent categories. Custom strings are accepted for organization-specific types.

### `AgentAttestation`

Cryptographic proof of agent identity.

```typescript
interface AgentAttestation {
  issuer: string;           // Who issued the attestation
  issued_at: string;        // ISO-8601
  expires_at?: string;      // ISO-8601
  signature?: string;       // Cryptographic signature
}
```

### `AgentIdentity`

Full agent identity descriptor. Used by the [identity package](./packages.md#agent-securityidentity) for registration and trust evaluation.

```typescript
interface AgentIdentity {
  agent_id: string;
  name: string;
  owner: string;                      // Email or team identifier
  environment: string;                // Any string: "dev", "staging", "prod", "sandbox", etc.
  agent_type?: AgentType;
  trust_level?: AgentTrustLevel;
  roles?: string[];                   // e.g. 'finance.reader', 'email.sender'
  capabilities?: string[];            // e.g. 'tool_call', 'code_execute', 'web_browse'
  max_delegation_depth?: number;      // Max levels of agent-to-agent delegation
  attestation?: AgentAttestation;
}
```

---

## Tool Identity

### `ToolIdentity`

Metadata for verifying tool provenance and permissions. Used by the [supply chain package](./packages.md#agent-securitysupply-chain) for manifest verification.

```typescript
interface ToolIdentity {
  tool_name: string;
  version?: string;
  provider?: string;                  // 'built-in' | 'mcp' | 'langchain' | 'custom'
  manifest_hash?: string;             // SHA-256 hash for integrity verification
  permissions_required?: string[];    // e.g. 'network.outbound', 'fs.read'
  data_access?: string[];             // Data categories this tool accesses
  verified?: boolean;                 // Whether provenance has been verified
}
```

---

## Agent Action Request

### `AgentActionRequest`

The canonical request object evaluated by the policy engine. Constructed internally from [`CheckToolCallParams`](#checktoolcallparams).

```typescript
interface AgentActionRequest {
  request_id: string;       // UUID v4
  timestamp: string;        // ISO-8601

  agent: {
    agent_id: string;
    name: string;
    owner: string;
    environment: string;
    agent_type?: AgentType;
    trust_level?: AgentTrustLevel;
    roles?: string[];
    capabilities?: string[];
    max_delegation_depth?: number;
    attestation?: AgentAttestation;
  };

  action: {
    type: string;           // "tool_call", "memory_access", "web_browse", "code_execute", etc.
    tool_name: string;
    tool_args: Record<string, any>;
    tool_identity?: ToolIdentity;
  };

  context: {
    user_input?: string;
    data_labels?: string[];        // e.g. ["PII", "PCI"]
    risk_hints?: string[];         // e.g. ["BULK_EXPORT", "EXTERNAL_SEND"]
    trace_id?: string;
    session_id?: string;
    parent_agent_id?: string;      // For multi-agent hierarchies
    delegation_chain?: string[];   // Ordered list of agent IDs in the delegation path
    [key: string]: any;            // Extensible context
  };
}
```

---

## Decision

### `DecisionOutcome`

```typescript
type DecisionOutcome =
  | "ALLOW"
  | "DENY"
  | "REQUIRE_APPROVAL"
  | "STEP_UP"
  | "REQUIRE_TICKET"
  | "REQUIRE_HUMAN";
```

| Outcome | Description | Callback |
|---------|-------------|----------|
| `ALLOW` | Action permitted. Executes immediately. | `onAllow` |
| `DENY` | Action blocked. Never executes. | `onDeny` |
| `REQUIRE_APPROVAL` | Needs manager/role-based approval. | `onApprovalRequired` |
| `STEP_UP` | Requires additional identity verification. | `onStepUpRequired` |
| `REQUIRE_TICKET` | Requires a valid change ticket (Jira, Linear, GitHub). | `onTicketRequired` |
| `REQUIRE_HUMAN` | Hard human-in-the-loop. No automated bypass. | `onHumanRequired` |

See the [policies guide](./policies.md#decision-outcomes) for when to use each outcome.

### `Decision`

```typescript
interface Decision {
  outcome: DecisionOutcome;
  reasons: Array<{
    code: string;          // Rule ID or system code
    message: string;       // Human-readable explanation
  }>;
  approver_role?: string;
  constraints?: Record<string, any>;  // e.g. { max_rows: 100, rate_limit_per_min: 10 }
}
```

---

## Audit Event

### `EventOutcome`

Superset of `DecisionOutcome` with lifecycle states.

```typescript
type EventOutcome =
  | "ALLOW"
  | "DENY"
  | "REQUIRE_APPROVAL"
  | "STEP_UP"
  | "REQUIRE_TICKET"
  | "REQUIRE_HUMAN"
  | "APPROVED"
  | "REJECTED"
  | "KILL_SWITCH"
  | "RATE_LIMITED"
  | "TIMEOUT";
```

| Outcome | Source |
|---------|--------|
| `APPROVED` | Approval callback returned `true` |
| `REJECTED` | Approval callback returned `false` |
| `KILL_SWITCH` | Kill switch plugin blocked the agent |
| `RATE_LIMITED` | Rate limiter plugin blocked the request |
| `TIMEOUT` | Approval callback timed out |

### `Event`

```typescript
interface Event {
  event_id: string;        // UUID v4
  timestamp: string;       // ISO-8601
  request_id: string;      // Links to the original request
  agent_id: string;
  tool_name: string;
  outcome: EventOutcome;
  reasons: Array<{
    code: string;
    message: string;
  }>;
  safe_payload: Record<string, any>;  // Redacted request data
  plugin_source?: string;             // Which plugin generated this event
}
```

> **Security Note:** The `safe_payload` field contains redacted data only. Raw tool arguments are never stored in audit events.

---

## Policy Rules

### `PolicyRule`

A single rule in the policy bundle. Rules are evaluated in order; first match wins. See the [policies guide](./policies.md) for authoring details.

```typescript
interface PolicyRule {
  id: string;
  description: string;

  match: {
    tool_name: string | string[];          // Exact, array, glob prefix ("query_*"), or "*"
    environment: string;                   // Any string or "*"
    agent_type?: AgentType | AgentType[];  // Filter by agent type
    trust_level_min?: AgentTrustLevel;     // Minimum trust level required
    agent_roles_any?: string[];            // Agent must have at least one role
    tool_provider?: string | string[];     // Filter by tool provider
  };

  when?: {
    contains_any?: string[];               // At least one keyword in user_input + tool_args
    not_contains?: string[];               // None of these keywords should appear
    matches_regex?: string;                // Regex pattern (ReDoS-safe)
    data_labels_any?: string[];            // At least one data label present
    tool_args_match?: Record<string, any>; // Match specific tool_args values
  };

  outcome: DecisionOutcome;
  approver_role?: string;
  constraints?: Record<string, any>;
}
```

#### Match Fields

| Field | Type | Description |
|-------|------|-------------|
| `tool_name` | `string \| string[]` | Exact name, array of names, glob prefix (`query_*`), or wildcard `*` |
| `environment` | `string` | Any environment string or `*` for all |
| `agent_type` | `AgentType \| AgentType[]` | Optional. Match one or more agent types. |
| `trust_level_min` | `AgentTrustLevel` | Optional. Agent must meet or exceed this trust level. |
| `agent_roles_any` | `string[]` | Optional. Agent must have at least one of these roles. |
| `tool_provider` | `string \| string[]` | Optional. Match tool provider (from `ToolIdentity`). |

#### When Conditions

All conditions must be true for the rule to match (AND logic).

| Condition | Type | Description |
|-----------|------|-------------|
| `contains_any` | `string[]` | At least one keyword appears in user input or tool args (case-insensitive). |
| `not_contains` | `string[]` | None of these keywords appear in user input or tool args (case-insensitive). |
| `matches_regex` | `string` | Regex pattern tested against searchable text. Unsafe patterns are rejected (fail-closed). Max length: 512 chars. |
| `data_labels_any` | `string[]` | At least one of these data labels is present in `context.data_labels`. |
| `tool_args_match` | `Record<string, any>` | Each key must match in `action.tool_args`. Supports numeric operators. |

#### Numeric Operators for `tool_args_match`

```json
{ "amount": { "gt": 1000 } }
```

| Operator | Description |
|----------|-------------|
| `gt` | Greater than |
| `gte` | Greater than or equal |
| `lt` | Less than |
| `lte` | Less than or equal |
| `eq` | Equal (strict) |
| `neq` | Not equal (strict) |

### `PolicyBundle`

```typescript
interface PolicyBundle {
  version: string;
  generated_at: string;       // ISO-8601
  expires_at: string;         // ISO-8601
  rules: PolicyRule[];
  defaults: {
    outcome: DecisionOutcome;
  };
  signature?: string;         // HMAC-SHA256 for integrity verification
}
```

> **Security Note:** Expired policy bundles are rejected at load time. Use HMAC signatures for tamper detection — see [SECURITY.md](../SECURITY.md#policy-integrity).

---

## Plugin System

### `SecurityPlugin`

Interface that all security plugins must implement. Plugins hook into the 5-phase evaluation pipeline.

```typescript
interface SecurityPlugin {
  readonly name: string;
  readonly version?: string;
  readonly failOpen?: boolean;      // Default: false (fail-closed)

  initialize?(): Promise<void>;
  beforeCheck?(context: BeforeCheckContext): Promise<PluginResult | void>;
  afterDecision?(context: AfterDecisionContext): Promise<PluginResult | void>;
  afterExecution?(context: AfterExecutionContext): Promise<void>;
  destroy?(): Promise<void>;
}
```

| Phase | Hook | Can Short-Circuit | Description |
|-------|------|-------------------|-------------|
| 1 | `beforeCheck` | Yes | Kill switch, rate limiting, identity checks |
| 2 | *(evaluation)* | — | Core policy engine (not a plugin hook) |
| 3 | `afterDecision` | Yes | Modify decisions, apply timeouts |
| 5 | `afterExecution` | No | Output validation, audit enrichment |

> **Security Note:** Plugins default to `failOpen: false`. If a plugin throws, the request is denied. Security-critical plugins (kill switch, rate limiter) should never set `failOpen: true`.

### `BeforeCheckContext`

```typescript
interface BeforeCheckContext {
  request: AgentActionRequest;
}
```

### `AfterDecisionContext`

```typescript
interface AfterDecisionContext {
  request: AgentActionRequest;
  decision: Decision;
}
```

### `AfterExecutionContext`

```typescript
interface AfterExecutionContext {
  request: AgentActionRequest;
  decision: Decision;
  result?: any;
  error?: Error;
}
```

### `PluginResult`

```typescript
interface PluginResult {
  decision?: Decision;                    // Short-circuit with this decision
  modifiedRequest?: AgentActionRequest;   // Replace request for subsequent processing
}
```

---

## API Surface

### `CheckToolCallParams`

The simplified parameter object passed to `AgentSecurity.checkToolCall()`. The platform constructs an `AgentActionRequest` internally.

```typescript
interface CheckToolCallParams {
  toolName: string;
  toolArgs: Record<string, any>;
  agentId: string;
  agentName?: string;
  environment?: string;
  owner?: string;
  actionType?: string;
  userInput?: string;
  dataLabels?: string[];
  riskHints?: string[];
  sessionId?: string;
  parentAgentId?: string;

  // Identity-aware fields
  agentType?: AgentType;
  trustLevel?: AgentTrustLevel;
  roles?: string[];
  capabilities?: string[];
  maxDelegationDepth?: number;
  attestation?: AgentAttestation;
  toolIdentity?: ToolIdentity;
  delegationChain?: string[];
}
```

### `SecurityCheckResult`

```typescript
interface SecurityCheckResult {
  allowed: boolean;
  decision: Decision;
  event: Event;
}
```

### `AgentSecurityConfig`

Full configuration for the `AgentSecurity` constructor. See [QUICKSTART.md](../QUICKSTART.md) for usage examples.

```typescript
interface AgentSecurityConfig {
  // Policy sources (at least one required)
  policyPath?: string;
  policyJson?: string;
  policyBundle?: PolicyBundle;
  policyLoader?: () => Promise<PolicyBundle | string>;

  // Plugins
  plugins?: SecurityPlugin[];

  // Callbacks
  onApprovalRequired?: (request: AgentActionRequest, decision: Decision) => Promise<boolean>;
  onStepUpRequired?: (request: AgentActionRequest, decision: Decision) => Promise<boolean>;
  onTicketRequired?: (request: AgentActionRequest, decision: Decision) => Promise<string | null>;
  onHumanRequired?: (request: AgentActionRequest, decision: Decision) => Promise<boolean>;
  onDeny?: (request: AgentActionRequest, decision: Decision) => void;
  onAllow?: (request: AgentActionRequest, decision: Decision) => void;
  onAuditEvent?: (event: Event) => void;
  onError?: (error: Error, context: string) => void;

  // Defaults
  defaultEnvironment?: string;
  defaultOwner?: string;
  approvalTimeoutMs?: number;
  maxAuditLogSize?: number;         // Default: 10,000. FIFO eviction.
}
```

---

## Cross-References

- **Policy authoring** — [docs/policies.md](./policies.md)
- **Package APIs** — [docs/packages.md](./packages.md)
- **Architecture** — [docs/architecture.md](./architecture.md)
- **Security properties** — [SECURITY.md](../SECURITY.md)
























  ## 1. What this is and why it comes first

  This is the canonical data model for a security finding in XSPM. The whole ASVS/CAF wrapper hangs off it:

  - the **Aikido parser** produces `FindingsDocument` objects from raw Aikido JSON
  - the **report generator** consumes `FindingsDocument` to produce the HTML/PDF report
  - the **evidence pack** stores the serialised `FindingsDocument` as `findings.json`

  It is the upstream dependency of the entire build: a wrong schema forces a rebuild later, so it is built before the parser or the report generator — both are defined against it.

  **It carries through every build stage unchanged.** The wrapper (Aikido-backed) and the Kainos-owned platform that follows it produce the *identical* schema — only the parser input differs (Aikido
  JSON vs normalised SARIF). A later stage persists it in a database; the XSPM-module stage ingests it into the cross-domain dashboard. There is no second findings model later. This is it.

  **Why this spec exists.** Earlier internal notes described a findings model in two incompatible shapes — a cross-domain schema in one, a flat application-security-only model in another. Both claimed
  the schema would reach the XSPM platform with no migration work; only a domain-shaped schema makes that true. This spec reconciles them into one model; §8 records each change and its reason.

  ---

  ## 2. Design shape — core + extension

  Every security finding, whatever the domain, shares a spine: an identity, a severity, a status, a thing it is attached to, controls it implicates, remediation. What differs is the domain detail. So
  the model is a **stable core** every domain fills, plus a **typed payload** for the domain-specific fields. The wrapper produces only `application` findings, so only the `ApplicationDetail` payload
  exists today.

  ```
  FindingsDocument
  ├── schema_version
  ├── scan: ScanMeta              (scan_id, scanned_at, mode, target, engine, versions, mapping_sources)
  └── findings: list[Finding]
         │
         Finding ──── CORE (every domain) ───────────────┐
         │  id · fingerprint · domain                    │
         │  title · description                          │  report generator,
         │  severity · status                            │  compliance overlay,
         │  first_seen · last_seen                        │  evidence pack
         │  resource · control_refs[] · remediation       │  ALL bind here —
         │  evidence[] · cross_domain_links[]             │  never to the payload
         └── application: ApplicationDetail | None  ◄─ EXTENSION (the wrapper fills this)
                pillar · location · cwe · cvss · cve
                package · package_version · raw_severity
                source_tools[] · tool_rule_ids[]
  ```

  Adding a domain later (DSPA, cloud, AI) is purely additive: define a new payload class, add it to the `domain` enum's payload map, touch nothing else. The report generator and overlay only ever read
  the core, so they never break.

  ---

  ## 3. The schema (Pydantic v2)

  Target: Python 3.10+, Pydantic v2. `str, Enum` mix-ins are used (not `StrEnum`) so the schema runs on 3.10. All values JSON-serialise to plain strings.

  ### 3.1 Enums

  ```python
  from enum import Enum


  class Domain(str, Enum):
      APPLICATION = "application"
      DATA = "data"            # reserved — DSPA payload, later stage
      CLOUD = "cloud"          # reserved
      AI = "ai"                # reserved
      IDENTITY = "identity"    # reserved
      NETWORK = "network"      # reserved
      ENDPOINT = "endpoint"    # reserved
      SUPPLY_CHAIN = "supply_chain"  # reserved


  class Severity(str, Enum):
      CRITICAL = "critical"
      HIGH = "high"
      MEDIUM = "medium"
      LOW = "low"
      INFO = "info"            # ZAP / Semgrep informational findings


  class Status(str, Enum):
      OPEN = "open"
      RESOLVED = "resolved"
      FALSE_POSITIVE = "false_positive"
      ACCEPTED_RISK = "accepted_risk"
      NOT_ASSESSED = "not_assessed"


  class Pillar(str, Enum):     # application domain only
      SAST = "sast"
      SCA = "sca"
      DAST = "dast"


  class Framework(str, Enum):
      ASVS = "asvs"                          # in use now
      CAF = "caf"                            # in use now
      ISO_27001 = "iso_27001"                # reserved
      GOVASSURE = "govassure"                # reserved
      NIS2 = "nis2"                          # reserved
      DORA = "dora"                          # reserved
      CYBER_ESSENTIALS = "cyber_essentials"  # reserved


  class Effort(str, Enum):
      QUICK_WIN = "quick_win"
      MEDIUM = "medium"
      SIGNIFICANT = "significant"
  ```

  The full `Domain` and `Framework` enums are defined now even though the wrapper uses only `application` / `asvs` + `caf`. Enum members are string labels — defining them costs nothing and reserves the
  namespace. The premature-design risk lives in the *payload classes*, not the labels, so no payload class beyond `ApplicationDetail` is written here.

  ### 3.2 Supporting types

  ```python
  from datetime import datetime

  from pydantic import BaseModel, ConfigDict, Field


  class _Base(BaseModel):
      model_config = ConfigDict(extra="forbid")  # reject unknown fields — catch drift early


  class ControlRef(_Base):
      """A finding's mapping to one control in one framework."""
      framework: Framework
      control_id: str                 # "V5.3.4" (ASVS 4.0.3), "B3.a" (CAF v4.0)
      control_name: str | None = None
      level: str | None = None        # "L1"/"L2"/"L3" for ASVS; None for frameworks without levels
      reference_url: str | None = None  # deeplink to the authoritative source (from OpenCRE's hyperlink for OpenCRE-derived refs; URL pattern for Kainos-derived CAF refs)
      note: str | None = None         # one line: what this finding means for the control


  class ResourceRef(_Base):
      """What a finding (or a scan) is attached to."""
      kind: str                       # "repository" | "web_application" | "api"
      identifier: str                 # repo URL, app URL, resource id
      name: str | None = None


  class Evidence(_Base):
      """Supporting evidence for a finding. The wrapper leaves this empty (see §6)."""
      kind: str                       # "code_snippet" | "http_trace" | "raw_finding"
      label: str | None = None
      content: str


  class Remediation(_Base):
      guidance: str
      effort: Effort | None = None


  class Review(_Base):
      """Consultant triage of a finding — who reviewed it, when, and the rationale for
      the status (especially false_positive / accepted_risk). Null until reviewed."""
      reviewed_by: str | None = None
      reviewed_at: datetime | None = None
      note: str | None = None         # rationale for the status / consultant annotation
  ```

  ### 3.3 ApplicationDetail — the application extension payload

  ```python
  class AppLocation(_Base):
      file: str | None = None         # SAST / SCA — source file path
      line: int | None = None         # SAST — line number
      endpoint: str | None = None     # DAST — URL or API endpoint


  class ApplicationDetail(_Base):
      pillar: Pillar
      location: AppLocation
      cwe: str | None = None          # "CWE-89" — OPTIONAL: SCA CVEs often carry no CWE
      cvss: float | None = Field(default=None, ge=0.0, le=10.0)
      cve: str | None = None          # SCA — the CVE id
      package: str | None = None      # SCA — affected package
      package_version: str | None = None  # SCA — affected version
      raw_severity: str | None = None     # the scanner's original severity label (for FP review)
      source_tools: list[str] = Field(min_length=1)  # ["aikido"] or merged ["semgrep","aikido"]
      tool_rule_ids: list[str] = Field(default_factory=list)  # raw rule/check ids — provenance + dedup
  ```

  ### 3.4 Finding — the cross-domain core

  ```python
  from datetime import datetime
  from pydantic import model_validator


  class Finding(_Base):
      # --- identity ---
      id: str                         # sha256(fingerprint)[:16] — stable across scans (see §4)
      fingerprint: str                # canonical pre-hash string — stored for dedup auditability
      domain: Domain
      # --- description ---
      title: str
      description: str
      # --- risk ---
      severity: Severity
      status: Status = Status.OPEN
      # --- consultant review (null until a consultant triages the finding) ---
      review: Review | None = None
      # --- lifecycle ---
      first_seen: datetime
      last_seen: datetime
      # --- what it is attached to ---
      resource: ResourceRef
      # --- framework mapping (filled by the normaliser via OpenCRE + the Kainos CAF mapping) ---
      control_refs: list[ControlRef] = Field(default_factory=list)
      # --- remediation ---
      remediation: Remediation
      # --- evidence (wrapper: empty; part of the stable core for later stages) ---
      evidence: list[Evidence] = Field(default_factory=list)
      # --- cross-domain (wrapper: empty; lazy-populated by the overlay later) ---
      cross_domain_links: list[str] = Field(default_factory=list)
      # --- domain payload: exactly the one matching `domain` is set ---
      application: ApplicationDetail | None = None

      @model_validator(mode="after")
      def _payload_matches_domain(self) -> "Finding":
          # extend this map as DataDetail / CloudDetail / ... are added
          payloads: dict[str, object | None] = {"application": self.application}
          present = {name for name, value in payloads.items() if value is not None}
          if self.domain.value in payloads and self.domain.value not in present:
              raise ValueError(f"domain={self.domain.value} requires its matching payload")
          stray = present - {self.domain.value}
          if stray:
              raise ValueError(f"payload(s) {sorted(stray)} set but domain={self.domain.value}")
          return self
  ```

  The validator enforces the one invariant that matters: the payload set must match `domain`. In the wrapper every finding is `domain="application"` with an `ApplicationDetail`. When `DataDetail` is
  added later it joins the `payloads` map and the validator covers it for free.

  ### 3.5 FindingsDocument — the scan envelope

  `findings.json` is not a bare list. It is a versioned document carrying scan metadata, so the evidence pack is a self-contained audit artifact.

  ```python
  class ScanMeta(_Base):
      scan_id: str                    # uuid4 for this run
      client: str                     # the client organisation this scan is for
      scanned_at: datetime
      scan_mode: str                  # "static" | "full"
      target: ResourceRef
      engine: str                     # "aikido" (wrapper) | "asa-foss" (owned platform)
      tool_versions: dict[str, str] = Field(default_factory=dict)
      framework_versions: dict[str, str] = Field(default_factory=dict)  # {"asvs": "4.0.3", "caf": "v4.0"}
      mapping_sources: dict[str, str] = Field(default_factory=dict)     # audit-trail of which mapping infrastructure produced each framework's refs — e.g., {"asvs": "opencre@2026-05-20", "caf":
  "kainos:caf-mapping-v1.0"}


  class FindingsDocument(_Base):
      schema_version: str = "1.0"
      scan: ScanMeta
      findings: list[Finding] = Field(default_factory=list)
  ```

  `schema_version` is mandatory and bumped on any *breaking* change to the schema — schema versioning is in place from day one. `framework_versions` records *which version of each framework* was active
  in the scan; `mapping_sources` records *which mapping infrastructure produced the refs* (OpenCRE snapshot vs Kainos table). Both live on the scan, not on each finding — they are scan-level facts, not
  repeated 200 times.

  ---

  ## 4. The finding id — a stable fingerprint

  The `id` is **not** a per-run UUID. It is a deterministic hash of a canonical fingerprint, so the *same vulnerability in the same place* gets the *same id on every scan*. That is what lets a later
  stage add trend-tracking with no schema change — "is this finding still open three scans later?" is just an id match.

  > An earlier model carried a per-run "Finding ID" **and** a separate dedup hash — the same concept twice. This spec unifies them: the dedup fingerprint *is* the id.

  **Fingerprint recipe — `|`-joined, lowercased, pillar-specific:**

  | Pillar | Fingerprint parts |
  |--------|-------------------|
  | SAST | `application` \| `sast` \| `cwe` \| `file` \| `rule_id` |
  | SCA  | `application` \| `sca`  \| `cve` \| `package` \| `package_version` |
  | DAST | `application` \| `dast` \| `cwe` \| `endpoint` \| `rule_id` |

  `rule_id` is the scanner's rule/check id. A `None` slot renders as an empty string — file + rule (SAST) or package + version (SCA) still disambiguate, so a missing CWE never breaks the id.

  ```python
  import hashlib


  def compute_fingerprint(domain: str, pillar: str, parts: list[str]) -> str:
      fields = [domain, pillar] + [(p or "").strip().lower() for p in parts]
      return "|".join(fields)


  def compute_id(fingerprint: str) -> str:
      return hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()[:16]
  ```

  16 hex chars = 64 bits — collision-safe for the thousands-of-findings scale this operates at. Within a single scan, two raw findings producing the same id *are the same finding* — see §5.

  ---

  ## 5. Deduplication falls out of the id

  Deduplication is not a separate algorithm. Two raw findings with the same fingerprint produce the same `id` — they are the same finding. The normaliser merges them: union `source_tools`, union
  `tool_rule_ids`, keep the highest severity.

  - **The wrapper (Aikido only):** dedup matters when Aikido itself reports an issue twice.
  - **The owned platform (Semgrep + Trivy + ZAP):** dedup is heavy — the same issue surfaces from multiple tools and merges into one record citing all of them.
  - **Cross-pillar** correlation (a SAST and a DAST finding describing one issue) is deferred to a later stage.

  ---

  ## 6. What the wrapper populates vs leaves empty

  Defining a core field is not the same as filling it in the wrapper. The core contract is fixed now so it never changes; the wrapper simply does not exercise every field.

  | Field | Wrapper behaviour |
  |-------|-------------------|
  | `id`, `fingerprint` | Computed by the normaliser (§4) |
  | `domain` | Always `application` |
  | `title`, `description`, `severity`, `resource` | From the Aikido finding |
  | `status` | `open` initially; the consultant may set to `false_positive` or `accepted_risk` during review. `resolved` is set by a follow-up scan that confirms remediation (not in the wrapper).
  `not_assessed` is reserved for cross-domain use. |
  | `review` | Empty until a consultant triages a finding; `reviewed_by` / `reviewed_at` / `note` set during the false-positive review step |
  | `first_seen`, `last_seen` | Both = the scan timestamp (single scan; first = last) |
  | `control_refs` | Filled by the normaliser via [OpenCRE](https://www.opencre.org) lookup for the CWE → ASVS leg (currently provides ASVS 4.0.3 via the CRE graph; community refresh to 5.0 pending)
  plus the Kainos CWE → CAF v4.0 mapping (the IP layer). `reference_url` is populated from OpenCRE's `hyperlink` for OpenCRE-derived refs and from a URL pattern for Kainos-derived CAF refs. |
  | `remediation` | `guidance` from Aikido; `effort` auto-assigned by CWE category, consultant may override |
  | `application` | Fully populated |
  | `evidence` | Empty `[]` — reserved core field for later stages |
  | `cross_domain_links` | Empty `[]` — reserved; lazy-populated by the overlay later |

  **Not stored anywhere:** posture score, ASVS coverage heatmap, CAF gap map. All three are *projections* the report generator computes from the findings. Storing a derived value invites drift — the
  report generator recomputes them every run.

  ---

  ## 7. Worked example

  One SAST finding, serialised. Control identifiers are taken from real OpenCRE-derived data — the ASVS V5.3.4 deeplink is exactly what OpenCRE returns today for the parameterised-queries CRE (732-873).
   The CAF B3.a reference URL follows the NCSC public URL pattern.

  ```json
  {
    "schema_version": "1.0",
    "scan": {
      "scan_id": "f1e2d3c4-5b6a-7980-1234-567890abcdef",
      "client": "Example Client Ltd",
      "scanned_at": "2026-05-20T09:14:22Z",
      "scan_mode": "static",
      "target": {"kind": "repository", "identifier": "https://github.com/client/app", "name": "client-app"},
      "engine": "aikido",
      "tool_versions": {"aikido": "2026.05"},
      "framework_versions": {"asvs": "4.0.3", "caf": "v4.0"},
      "mapping_sources": {"asvs": "opencre@2026-05-20", "caf": "kainos:caf-mapping-v1.0"}
    },
    "findings": [
      {
        "id": "9b1c4e7a2f8d0a16",
        "fingerprint": "application|sast|cwe-89|src/api/users.py|python.sql.injection",
        "domain": "application",
        "title": "SQL injection in user lookup query",
        "description": "User-supplied input is concatenated directly into a SQL query in the user lookup handler, allowing an attacker to alter query logic.",
        "severity": "high",
        "status": "open",
        "first_seen": "2026-05-20T09:14:22Z",
        "last_seen": "2026-05-20T09:14:22Z",
        "resource": {"kind": "repository", "identifier": "https://github.com/client/app", "name": "client-app"},
        "control_refs": [
          {
            "framework": "asvs",
            "control_id": "V5.3.4",
            "control_name": "Parameterised database queries",
            "level": "L1",
            "reference_url": "https://github.com/OWASP/ASVS/blob/v4.0.3/4.0/en/0x13-V5-Validation-Sanitization-Encoding.md#v53-output-encoding-and-injection-prevention",
            "note": null
          },
          {
            "framework": "caf",
            "control_id": "B3.a",
            "control_name": "Understanding data",
            "level": null,
            "reference_url": "https://www.ncsc.gov.uk/collection/cyber-assessment-framework/principle-b3-data-security/b3-a-understanding-data",
            "note": "Unmitigated injection weakens the data-protection claim in a CAF B3 submission."
          }
        ],
        "remediation": {"guidance": "Use parameterised queries or an ORM binding for all user-supplied values in the user lookup handler.", "effort": "quick_win"},
        "evidence": [],
        "cross_domain_links": [],
        "application": {
          "pillar": "sast",
          "location": {"file": "src/api/users.py", "line": 142, "endpoint": null},
          "cwe": "CWE-89",
          "cvss": null,
          "cve": null,
          "package": null,
          "package_version": null,
          "raw_severity": "high",
          "source_tools": ["aikido"],
          "tool_rule_ids": ["python.sql.injection"]
        }
      }
    ]
  }
  ```

  ---

  ## 8. Reconciliation — what changed and why

  This schema replaces an earlier flat, application-only model. Every change from that model is recorded here with its reason.

  | # | Topic | Earlier flat model | This schema | Why |
  |---|-------|--------------------|-------------|-----|
  | 1 | Identity | Per-scan-run "Finding ID" + separate dedup hash | One stable fingerprint hash, used as `id` | Trend-tracking later needs stable identity; the two were the same concept |
  | 2 | Severity | 4 levels (CRITICAL/HIGH/MEDIUM/LOW) | 5 levels (adds `info`) | ZAP and Semgrep emit informational findings; 4 levels discards or misfiles them |
  | 3 | Status | open / false positive / accepted risk / resolved | open / resolved / false_positive / accepted_risk / **not_assessed** | Adds `not_assessed` for cross-domain use; snake_case for enum 
  hygiene |
  | 4 | Structure | Flat, application-only | Cross-domain core + `application` extension | The locked design decision (2026-05-19) |
  | 5 | Framework mapping | ASVS + CAF as fixed top-level fields | `control_refs: list[ControlRef]` | Multiple compliance frameworks are in scope (see the `Framework` enum); a list absorbs all of them |
  | 6 | Framework version | "ASVS Version" on every finding | `framework_versions` on the scan envelope | A scan-level fact — not repeated per finding |
  | 7 | CWE | Implied present | Explicitly `Optional` | SCA CVEs frequently carry no CWE |
  | 8 | ASVS level | Stored field | On `ControlRef.level` | Kept (self-contained evidence pack) but moved onto the control ref where it belongs |
  | 9 | Effort estimate | In the model | In `Remediation.effort` (core) | Placed in the core remediation type |
  | 10 | Consultant review | Status only — no reviewer, time, or rationale | Adds a `review` object: `reviewed_by` / `reviewed_at` / `note` | Status records the decision; the audit trail needs who 
  reviewed it and why |
  | 11 | Mapping provenance | None | `ControlRef.reference_url` (per ref) + `ScanMeta.mapping_sources` (per scan) | Evidence pack is self-describing; auditor can click through to source 
  (`reference_url`) and verify which mapping infrastructure produced the refs (`mapping_sources`). Added v0.2 after the OpenCRE verification (2026-05-20) |

  ---

  ## 9. Status — one check before this is final

  This is draft v0.2. The schema is designed against SARIF, the public CWE standard, and the OpenCRE-mediated ASVS/CAF mapping — so it can be implemented now without waiting on anything external.

  One check remains before it is declared final (v1.0): **validate it against a real Aikido findings export** — confirm an Aikido finding actually carries a usable CWE, a CVSS score, and a rule id. That
   is a check on the parser's input assumptions, not on the schema's shape; it does not block writing `schema.py`.

  ---

  ## 10. Deferred — explicitly not in the wrapper

  - **Other domain payloads** — `DataDetail`, `CloudDetail`, `AIDetail`, `IdentityDetail`. Added when each assessor is specced. Additive; no core change.
  - **Cross-domain link population** — the `cross_domain_links` field exists; populating it is overlay/post-processing work at a later stage.
  - **Persistence** — no database, no SQLAlchemy in the wrapper. `FindingsDocument` serialises to a JSON file. A later stage adds the store.
  - **The mapping infrastructure underneath `control_refs`.** The CWE → ASVS leg is provided by [OpenCRE](https://www.opencre.org) — the OWASP-overseen knowledge graph that links security standards via
  Common Requirement (CRE) nodes (REST endpoints: `/rest/v1/standard/<name>`, `/rest/v1/id/<cre-id>`). OpenCRE currently exposes ASVS at v4.0.3; the community refresh to ASVS 5.0 is pending. The CWE →
  CAF v4.0 mapping is the next Kainos build artefact and the IP layer — NCSC CAF is absent from OpenCRE's catalog (verified 2026-05-20). Open question: contribute the CAF mappings upstream to OpenCRE
  (community-leveraged moat) or maintain privately (closed Kainos table). Either way, this schema provides the *slots* (`control_refs` carrying `reference_url` per ref, `mapping_sources` per scan); the
  mapping data itself is integrated at scan time, not part of the schema.

  ---

  ## 11. Build checklist

  For the implementer.

  **Files:**
  - `src/xspm/findings/schema.py` — all models and enums in §3 and §3.5
  - `src/xspm/findings/fingerprint.py` — `compute_fingerprint` + `compute_id` from §4
  - `src/xspm/findings/__init__.py` — re-exports
  - `docs/findings-model.md` — this document
  - `tests/unit/test_findings_schema.py`

  **Acceptance criteria:**
  - mypy strict passes; Ruff passes
  - Round-trip is identity: `FindingsDocument.model_validate_json(doc.model_dump_json()) == doc`
  - Hypothesis property test confirms the round-trip across generated findings (strategy must produce *valid* findings — `domain="application"` with a populated `ApplicationDetail` — because the model
  validator rejects domain/payload mismatches)
  - The `_payload_matches_domain` validator rejects: `domain="application"` with no payload; a payload set that does not match `domain`
  - `extra="forbid"` rejects an unknown field
  - The §7 worked example parses and re-serialises cleanly
  - `ScanMeta.mapping_sources` round-trips correctly: empty-dict default; populated dict (e.g., `{"asvs": "opencre@2026-05-20", "caf": "kainos:caf-mapping-v1.0"}`) preserved
  - `ControlRef.reference_url` round-trips correctly: `None` default; populated URL preserved
  - `compute_fingerprint` / `compute_id` behaviour: identical inputs produce identical id; `compute_id` returns 16 hex chars; the §4 lowercase + strip normalisation holds (case-insensitive — `"CWE-89"`
  and `"cwe-89"` produce the same id; whitespace-trimmed — leading/trailing spaces in any part are stripped)
