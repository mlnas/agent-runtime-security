# Security

Security properties, threat model, and hardening guide for the Agent-SPM platform.

---

## Security Properties

### HMAC-SHA256 Policy Signatures

Policy bundles support HMAC-SHA256 signatures for integrity verification. Signatures are computed over the full bundle (excluding the `signature` field itself) with sorted keys for deterministic output.

- Verification uses **constant-time comparison** (`crypto.timingSafeEqual`) to prevent timing attacks.
- Missing signatures are rejected when a secret is configured.
- Sign bundles with `PolicyBundleLoader.signBundle(bundle, secret)`.

### AsyncMutex — TOCTOU Prevention

The plugin pipeline is serialized through an async mutex. This prevents time-of-check-to-time-of-use races in stateful plugins (rate limiter, session context) where concurrent requests could bypass limits.

### ReDoS-Safe Regex

Policy rules support `matches_regex` conditions. All regex patterns are validated before use:

- **Nested quantifiers** detected and rejected: `(a+)+`, `(a*)*`
- **Overlapping alternations** detected and rejected: `(a|a)+`
- **Maximum pattern length**: 512 characters
- **Pre-compilation**: All patterns are compiled and cached at policy load time
- **Fail-closed**: Invalid or unsafe patterns cause the rule condition to never match

### Path Traversal Prevention

Policy file loading uses path sanitization:

- Paths are resolved to absolute form
- The resolved path must be within the allowed base directory (default: `cwd`)
- Symlinks that escape the base directory are rejected
- Only regular files are accepted (no directories, devices, etc.)

### Fail-Closed Default

- Plugins default to `failOpen: false`. If a plugin throws an error, the request is **denied**.
- Security-critical plugins (kill switch, rate limiter) should never set `failOpen: true`.
- If no policy rule matches and `defaults.outcome` is `"DENY"`, the request is denied.
- Missing approval callbacks result in denial.
- Approval callback timeouts result in denial.

### Data Redaction

- Audit events use a `safe_payload` field containing redacted data only.
- Raw tool arguments are never stored in audit events.
- `user_input` is optional and can be omitted entirely.

### Bounded Audit Log

- In-memory audit log enforces a configurable max size (default: 10,000 events).
- FIFO eviction prevents memory exhaustion.
- Set to 0 for unlimited (not recommended in production).

---

## Threat Model

### What Agent-SPM Mitigates

| Threat | Mitigation |
|--------|-----------|
| **Data exfiltration** | Egress DLP classifiers detect PII/PCI/secrets in tool args and block unauthorized channels |
| **Unauthorized actions** | Policy rules with first-match evaluation, trust-level gating, role-based access |
| **Prompt injection via tool args** | `contains_any`, `not_contains`, `matches_regex` conditions scan tool arguments for malicious patterns |
| **Rogue agent behavior** | Guardian anomaly detection, auto-kill on threshold breach, kill switch for emergency stop |
| **Privilege escalation** | Trust level hierarchy, delegation depth limits, identity enforcement |
| **Shadow agents** | `requireRegistration: true` in identity enforcer denies unregistered agents |
| **Supply chain compromise** | MCP manifest scanning, SHA-256 provenance verification, command governance |
| **Policy tampering** | HMAC-SHA256 signatures, constant-time verification, policy expiration |
| **Stale policies** | `expires_at` validation rejects expired bundles at load time |
| **Rate-based attacks** | Per-agent and per-tool rate limiting with sliding window |
| **Session abuse** | Per-session tool usage limits with automatic TTL cleanup |

### Out of Scope

Agent-SPM is a runtime policy enforcement layer. It does not replace:

- **Network security** — Firewalls, WAFs, network segmentation
- **Application authentication** — OAuth, JWT, API keys
- **LLM model security** — Prompt hardening, output filtering at the model level
- **Infrastructure security** — Container isolation, OS hardening, secret management
- **Code security** — SAST/DAST, dependency scanning, code review

Agent-SPM is one layer in a defense-in-depth strategy.

---

## Hardening Guide

### Production Recommendations

1. **Set default outcome to DENY**
   ```json
   { "defaults": { "outcome": "DENY" } }
   ```

2. **Enable policy signatures**
   ```typescript
   PolicyBundleLoader.loadFromFile('./policy.json', {
     signatureSecret: process.env.POLICY_HMAC_SECRET,
   });
   ```

3. **Set policy expiration**
   Use short-lived policies (30-90 days) and automate renewal.

4. **Enable all core plugins**
   ```typescript
   plugins: [
     killSwitch(),
     rateLimiter({ maxPerMinute: 60 }),
     sessionContext({ limits: { ... } }),
   ]
   ```

5. **Require agent registration**
   ```typescript
   identityEnforcer({ agentRegistry, requireRegistration: true })
   ```

6. **Configure approval timeouts**
   ```typescript
   approvalTimeoutMs: 300_000 // 5 minutes — prevent hanging approvals
   ```

7. **Export audit events to SIEM**
   ```typescript
   onAuditEvent: (event) => siem.send(socFormatter.toCef(event).raw)
   ```

8. **Configure guardian thresholds**
   Use `BLUEPRINT_FINANCE` or `BLUEPRINT_SOC` as starting points with `auto_kill_threshold` enabled.

9. **Enable egress DLP**
   Configure classifiers for your data types and block all sensitive data egress channels.

10. **Restrict file loading paths**
    ```typescript
    PolicyBundleLoader.loadFromFile('./policy.json', {
      allowedBasePath: '/app/policies',
    });
    ```

---

## Responsible Disclosure

If you discover a security vulnerability in Agent-SPM, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities.
2. Email security findings to the maintainers (see repository contact info).
3. Include a description of the vulnerability, steps to reproduce, and potential impact.
4. We will acknowledge receipt within 48 hours and provide a fix timeline.

---

## Cross-References

- **Schema definitions** — [docs/schemas.md](./docs/schemas.md)
- **Policy authoring** — [docs/policies.md](./docs/policies.md)
- **Architecture** — [docs/architecture.md](./docs/architecture.md)
- **Compliance** — [docs/compliance.md](./docs/compliance.md)
