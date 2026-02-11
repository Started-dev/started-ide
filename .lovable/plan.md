

# Comprehensive Fix: Conversations, GitHub Integration, MCP Auth, and Agent Intelligence

## Problem Summary

1. **Chat conversations are NOT saving** -- The `conversations` table `id` column is `uuid` type, but the code generates IDs like `conv-1234567890-abcd` which are NOT valid UUIDs. Every insert silently fails.
2. **GitHub integration is basic** -- Currently requires pasting a Personal Access Token (PAT). No OAuth flow, no repo/branch display in the project UI.
3. **MCP tokens stored in `sessionStorage`** -- All tokens vanish when the browser tab closes. No persistent storage.
4. **Agent/AI lacks MCP execution results** -- The agent loop says "MCP tool was called, result will be provided" but never actually calls the tool or feeds back real results.

---

## Fix 1: Conversation Persistence (CRITICAL)

**Root Cause:** `makeNewConversation` generates `conv-${Date.now()}-xxxx` as the conversation ID, but the `conversations.id` column is `uuid` type. The Supabase insert fails silently.

**Fix:**
- Change `makeNewConversation` in `IDEContext.tsx` to use `crypto.randomUUID()` instead of the string-based ID format
- Add error logging to `createConversation` and `saveConversation` in `use-conversation-persistence.ts` so failures surface in the console
- Add a `beforeunload` listener to flush any pending debounced saves immediately when the user closes the browser

**Files:** `src/contexts/IDEContext.tsx`, `src/hooks/use-conversation-persistence.ts`

---

## Fix 2: GitHub OAuth Integration

**Current state:** Users paste a GitHub PAT into `sessionStorage` via the MCP Config panel. No OAuth, no repo display.

**Plan:**
- Add a GitHub OAuth flow using Supabase Auth's GitHub provider (the user clicks "Connect GitHub" and goes through the standard OAuth consent screen)
- Store the GitHub access token from the OAuth session rather than requiring manual PAT entry
- Add a `GitHubStatus` component to the `ProjectSwitcher` that displays the connected repo name and current branch when GitHub is connected
- Add GitHub tools: `github_create_repo`, `github_push_files`, `github_commit` to the MCP GitHub edge function
- The MCPConfig panel for GitHub will show "Connect with GitHub" button instead of the PAT input when no token exists

**New tools added to `mcp-github` edge function:**
- `github_create_repo` -- Create a new repository
- `github_push_files` -- Push file changes to a branch
- `github_list_commits` -- List recent commits

**Files:** `src/components/ide/MCPConfig.tsx`, `src/components/ide/ProjectSwitcher.tsx`, `supabase/functions/mcp-github/index.ts`, `src/types/mcp-servers.ts`

---

## Fix 3: Persistent MCP Token Storage

**Current state:** All MCP tokens are stored in `sessionStorage` and disappear when the tab closes.

**Plan:**
- Migrate token storage from `sessionStorage` to `localStorage` with an encrypted wrapper
- Add a `mcp_tokens` table in the database for server-side persistence (encrypted, per-user, per-project)
- On load, hydrate tokens from `localStorage` first, then sync from the database
- For services that support OAuth (GitHub, Google Sheets, Slack, Notion), show an "Connect with OAuth" button as the preferred option, with "Paste API Key" as fallback

**Database migration:**
```sql
CREATE TABLE mcp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  server_id text NOT NULL,
  token_key text NOT NULL,
  token_value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, project_id, server_id, token_key)
);
ALTER TABLE mcp_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tokens" ON mcp_tokens FOR ALL USING (user_id = auth.uid());
```

**Files:** `src/components/ide/MCPConfig.tsx`, `src/lib/mcp-client.ts`, new migration

---

## Fix 4: Agent MCP Tool Execution

**Current state:** When the agent decides to call an MCP tool, it emits an event but the conversation just says "MCP tool was called. The result will be provided." -- no actual execution happens.

**Plan:**
- In the `agent-run` edge function, when `action === "mcp_call"`, actually invoke the MCP edge function server-side and feed the result back into the conversation history
- The agent can then reason about real MCP results (e.g., list of GitHub repos, Slack messages, etc.)
- Add a server-side MCP dispatch function that routes tool calls to the correct edge function using the service role key

**Files:** `supabase/functions/agent-run/index.ts`

---

## Fix 5: AI Context and Memory Improvements

**Current state:** Chat only sends the last 10 messages. No cross-session memory.

**Plan:**
- Increase message history window from 10 to 20 for better context
- Add a `memory_notes` jsonb column to the `projects` table to store per-project AI memory (key learnings, user preferences, architectural decisions)
- The AI system prompt will include relevant memory notes
- After each conversation, extract and persist key facts to memory

**Files:** `src/contexts/IDEContext.tsx`, `supabase/functions/started/index.ts`, migration for `projects.memory_notes`

---

## Technical Details

### Conversation ID Fix (highest priority)
```typescript
// Before (broken):
const makeNewConversation = (pId: string): Conversation => ({
  id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  ...
});

// After (fixed):
const makeNewConversation = (pId: string): Conversation => ({
  id: crypto.randomUUID(),
  ...
});
```

### Browser Close Save Flush
```typescript
// In use-conversation-persistence.ts
useEffect(() => {
  const flush = () => {
    Object.values(saveTimers.current).forEach(clearTimeout);
    // Synchronous save via navigator.sendBeacon
  };
  window.addEventListener('beforeunload', flush);
  return () => window.removeEventListener('beforeunload', flush);
}, []);
```

### Agent MCP Execution (server-side)
```typescript
// In agent-run edge function, after parsing action === "mcp_call"
const mcpResult = await fetch(
  `${Deno.env.get("SUPABASE_URL")}/functions/v1/${parsed.mcp_server}`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tool: parsed.mcp_tool, input: parsed.mcp_input }),
  }
);
const mcpData = await mcpResult.json();
conversationHistory.push({
  role: "user",
  content: `MCP tool ${parsed.mcp_tool} returned: ${JSON.stringify(mcpData.result || mcpData.error)}`,
});
```

---

## Implementation Order

1. Fix conversation UUIDs (immediate impact -- chats will save)
2. Add `beforeunload` save flush
3. Migrate MCP tokens to `localStorage` 
4. Create `mcp_tokens` database table
5. Implement agent-side MCP execution
6. Add GitHub OAuth flow and repo/branch display
7. Add expanded GitHub tools (create repo, push files)
8. Add project memory notes
9. Increase chat context window

