/**
 * SandboxManager — manages process-level, container, and WASM sandboxes.
 */

export type SandboxType = "process" | "container" | "wasm" | "none";

export interface SandboxConfig {
  type: SandboxType;
  /** For process sandboxes: restricted environment variables */
  allowed_env_vars?: string[];
  /** For process sandboxes: restricted filesystem paths */
  allowed_paths?: string[];
  /** For container sandboxes: image name */
  container_image?: string;
  /** Memory limit in MB */
  memory_limit_mb?: number;
  /** CPU limit (0-1, fraction of one core) */
  cpu_limit?: number;
  /** Execution timeout in ms */
  timeout_ms?: number;
  /** Network access allowed */
  network_enabled?: boolean;
}

export interface SandboxResult {
  success: boolean;
  output?: string;
  error?: string;
  execution_time_ms: number;
  sandbox_type: SandboxType;
  resource_usage?: {
    memory_mb?: number;
    cpu_time_ms?: number;
  };
}

/**
 * SandboxManager — provides sandbox execution capabilities for agents.
 * In this implementation, sandboxes are simulated for demonstration.
 * Production usage would integrate with Docker/OCI, WASM runtimes, etc.
 */
export class SandboxManager {
  private configs = new Map<string, SandboxConfig>();

  /**
   * Register a sandbox configuration for a tool or agent.
   */
  registerSandbox(name: string, config: SandboxConfig): void {
    this.configs.set(name, config);
  }

  /**
   * Get the sandbox configuration for a tool or agent.
   */
  getSandbox(name: string): SandboxConfig | undefined {
    return this.configs.get(name);
  }

  /**
   * Check if a tool call is allowed within its sandbox constraints.
   */
  checkConstraints(toolName: string, args: Record<string, any>): {
    allowed: boolean;
    violations: string[];
  } {
    const config = this.configs.get(toolName);
    if (!config || config.type === "none") {
      return { allowed: true, violations: [] };
    }

    const violations: string[] = [];

    // Check filesystem access
    if (config.allowed_paths && args.path) {
      const requestedPath = String(args.path);
      const isAllowed = config.allowed_paths.some((p) =>
        requestedPath.startsWith(p)
      );
      if (!isAllowed) {
        violations.push(`Path "${requestedPath}" not in allowed paths`);
      }
    }

    // Check network access
    if (config.network_enabled === false && (args.url || args.host)) {
      violations.push("Network access is disabled in sandbox");
    }

    // Check environment variable access
    if (config.allowed_env_vars && args.env_var) {
      if (!config.allowed_env_vars.includes(String(args.env_var))) {
        violations.push(`Environment variable "${args.env_var}" not in allowed list`);
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
    };
  }

  /**
   * Simulate sandbox execution (for demonstration).
   */
  async execute(
    toolName: string,
    fn: () => Promise<any>,
    timeoutOverride?: number
  ): Promise<SandboxResult> {
    const config = this.configs.get(toolName);
    const timeout = timeoutOverride || config?.timeout_ms || 30000;
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Sandbox execution timeout")), timeout)
        ),
      ]);

      return {
        success: true,
        output: typeof result === "string" ? result : JSON.stringify(result),
        execution_time_ms: Date.now() - startTime,
        sandbox_type: config?.type || "none",
      };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message,
        execution_time_ms: Date.now() - startTime,
        sandbox_type: config?.type || "none",
      };
    }
  }

  /**
   * List all registered sandboxes.
   */
  list(): Array<{ name: string; config: SandboxConfig }> {
    return Array.from(this.configs.entries()).map(([name, config]) => ({
      name,
      config,
    }));
  }
}
