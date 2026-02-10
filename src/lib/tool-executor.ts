import { ToolName, ToolCall, ToolResult, PermissionPolicy, DEFAULT_PERMISSION_POLICY, PermissionDecision } from '@/types/tools';
import { IDEFile } from '@/types/ide';

// ─── Web3 MCP Permission Policies ───

export type Web3OpType = 'READ' | 'SIMULATE' | 'WRITE';

const WEB3_TOOL_CLASSIFICATION: Record<string, Web3OpType> = {
  // EVM RPC — all read-only
  evm_block_number: 'READ', evm_get_balance: 'READ', evm_call: 'READ',
  evm_get_logs: 'READ', evm_get_code: 'READ', evm_estimate_gas: 'READ',
  evm_get_transaction: 'READ', evm_get_transaction_receipt: 'READ',
  evm_get_block: 'READ', evm_chain_id: 'READ', evm_gas_price: 'READ',
  // Contract Intel — all read-only
  contract_get_abi: 'READ', contract_get_source: 'READ',
  contract_verified_status: 'READ', contract_decode_calldata: 'READ',
  contract_get_creation_tx: 'READ', contract_get_events: 'READ',
  contract_get_transactions: 'READ',
  // Solana — all read-only
  solana_get_balance: 'READ', solana_get_account_info: 'READ',
  solana_get_transaction: 'READ', solana_get_signatures: 'READ',
  solana_get_token_accounts: 'READ', solana_get_program_accounts: 'READ',
  solana_get_slot: 'READ', solana_get_block_height: 'READ',
  solana_get_recent_blockhash: 'READ', solana_get_supply: 'READ',
  solana_get_epoch_info: 'READ', solana_get_nft_metadata: 'READ',
  // Transaction Simulator — simulation tier
  sim_eth_call: 'SIMULATE', sim_estimate_gas: 'SIMULATE',
  sim_trace_call: 'SIMULATE', sim_tenderly_simulate: 'SIMULATE',
  sim_compare_gas: 'SIMULATE', sim_decode_revert: 'SIMULATE',
  // Wallet operations — WRITE tier (requires user approval)
  wallet_send_transaction: 'WRITE', wallet_sign_message: 'WRITE',
  wallet_get_address: 'READ',
};

export function getWeb3OpType(toolName: string): Web3OpType | null {
  return WEB3_TOOL_CLASSIFICATION[toolName] || null;
}

export function evaluateWeb3Permission(toolName: string): PermissionDecision {
  const opType = getWeb3OpType(toolName);
  if (!opType) return 'ask';
  switch (opType) {
    case 'READ': return 'allow';
    case 'SIMULATE': return 'allow';
    case 'WRITE': return 'ask';
  }
}

/**
 * Determines whether a tool call requires user permission.
 */
export function evaluatePermission(
  call: ToolCall,
  policy: PermissionPolicy = DEFAULT_PERMISSION_POLICY,
): PermissionDecision {
  // Check denied tools first
  if (policy.deniedTools.includes(call.tool)) return 'deny';

  // Check allowed tools (read-only tools)
  if (policy.allowedTools.includes(call.tool)) return 'allow';

  // For run_command, check command prefix lists
  if (call.tool === 'run_command') {
    const cmd = (call.input as { command: string }).command.trim();

    // Check denylist first
    for (const prefix of policy.deniedCommands) {
      if (cmd.startsWith(prefix)) return 'deny';
    }

    // Check allowlist
    for (const prefix of policy.allowedCommands) {
      if (cmd.startsWith(prefix)) return 'allow';
    }
  }

  // Default: ask for permission
  return 'ask';
}

/**
 * Get the risk level of a tool call for UI display.
 */
export function getToolRiskLevel(tool: ToolName): 'safe' | 'moderate' | 'dangerous' {
  switch (tool) {
    case 'read_file':
    case 'list_files':
    case 'grep':
    case 'git_status':
      return 'safe';
    case 'apply_patch':
    case 'run_command':
      return 'moderate';
    case 'web_fetch':
    case 'web_search':
      return 'dangerous';
    default:
      return 'moderate';
  }
}

/**
 * Get a human-readable description of what the tool call will do.
 */
export function describeToolCall(call: ToolCall): string {
  const input = call.input as Record<string, unknown>;
  switch (call.tool) {
    case 'read_file':
      return `Read file: ${input.path}`;
    case 'list_files':
      return `List files matching: ${input.glob}`;
    case 'grep':
      return `Search for "${input.pattern}"${input.paths_glob ? ` in ${input.paths_glob}` : ''}`;
    case 'apply_patch':
      return `Apply code patch (unified diff)`;
    case 'run_command':
      return `Run: ${input.command}${input.cwd ? ` (in ${input.cwd})` : ''}`;
    case 'git_status':
      return `Check git status`;
    case 'web_fetch':
      return `Fetch URL: ${input.url}`;
    case 'web_search':
      return `Web search: ${input.query}`;
    default:
      return `Execute tool: ${call.tool}`;
  }
}

/**
 * Execute a tool call against the local file system (in-memory).
 * This is the mock executor — TODO: wire to real backend POST endpoints.
 */
export function executeToolLocally(
  call: ToolCall,
  files: IDEFile[],
): ToolResult {
  const input = call.input as Record<string, unknown>;
  const startTime = Date.now();

  try {
    switch (call.tool) {
      case 'read_file': {
        const path = input.path as string;
        const file = files.find(f => f.path === path || f.path === `/${path}`);
        if (!file) return { ok: false, error: `File not found: ${path}`, duration_ms: Date.now() - startTime };
        return { ok: true, content: file.content, duration_ms: Date.now() - startTime };
      }

      case 'list_files': {
        const glob = (input.glob as string) || '*';
        const matchedFiles = files
          .filter(f => !f.isFolder)
          .filter(f => {
            if (glob === '*') return true;
            return f.path.includes(glob.replace('*', '').replace('**/', ''));
          })
          .map(f => f.path);
        return { ok: true, files: matchedFiles, duration_ms: Date.now() - startTime };
      }

      case 'grep': {
        const pattern = input.pattern as string;
        const regex = new RegExp(pattern, 'gi');
        const matches: Array<{ file: string; line: number; text: string }> = [];
        for (const file of files.filter(f => !f.isFolder)) {
          const lines = file.content.split('\n');
          lines.forEach((line, idx) => {
            if (regex.test(line)) {
              matches.push({ file: file.path, line: idx + 1, text: line.trim() });
            }
          });
        }
        return { ok: true, matches, duration_ms: Date.now() - startTime };
      }

      case 'git_status': {
        return {
          ok: true,
          stdout: 'On branch main\nnothing to commit, working tree clean',
          duration_ms: Date.now() - startTime,
        };
      }

      case 'run_command': {
        const command = input.command as string;
        // Mock runner: simulate common commands
        if (command.includes('test')) {
          return {
            ok: true, exit_code: 0, cwd: '/workspace',
            stdout: 'PASS  src/utils.test.ts\n  ✓ greet (2ms)\n  ✓ add (1ms)\n\nTest Suites: 1 passed, 1 total\nTests:       2 passed, 2 total',
            stderr: '',
            duration_ms: Date.now() - startTime + 1200,
          };
        }
        return {
          ok: true, exit_code: 0, cwd: '/workspace',
          stdout: `$ ${command}\n[mock] Command executed successfully`,
          stderr: '',
          duration_ms: Date.now() - startTime + 500,
        };
      }

      case 'apply_patch': {
        // Patches are handled separately by the PatchPreview component
        return { ok: true, content: 'Patch queued for preview', duration_ms: Date.now() - startTime };
      }

      case 'web_fetch':
      case 'web_search': {
        return {
          ok: false,
          error: 'Web tools require backend integration (not available in local mode)',
          duration_ms: Date.now() - startTime,
        };
      }

      default:
        return { ok: false, error: `Unknown tool: ${call.tool}`, duration_ms: Date.now() - startTime };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      duration_ms: Date.now() - startTime,
    };
  }
}
