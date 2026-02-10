

# Fix: Chat and Agent Session Management

## Problems Identified

1. **New Conversation button hidden when no conversations exist**: The "+" (new conversation) button in `ChatPanel.tsx` is wrapped inside `{conversations.length > 0 && (...)}` (line 89). If the user is not authenticated or conversations fail to load from the database, `conversations` is empty and the entire tab bar -- including the "+" button -- disappears. This means users lose the ability to create new sessions.

2. **Agent panel has no "New Run" button**: When an agent run completes or fails, the `AgentTimeline` component shows the completed timeline but offers no way to start a new agent run. The only option is to go back to the chat panel, toggle Agent mode on, and type a new goal. There should be a "New Run" button directly in the agent panel.

3. **Conversation initialization race condition**: When `convPersistence.createConversation()` fails (e.g., user not logged in), the conversation is never added to `convPersistence.conversations` state, so the tab bar never appears. The local state (`chatMessages`, `activeConversationId`) works fine, but the UI for managing sessions is broken.

## Changes

### 1. Always show conversation header bar (`src/components/ide/ChatPanel.tsx`)
- Remove the `conversations.length > 0` guard around the conversation tab bar
- Always render the header area with at least the "+" (new conversation) button
- When there are no DB-backed conversations, still show a single "New Chat" tab representing the current session
- This ensures the "+" button is always accessible

### 2. Add "New Run" button to Agent panel (`src/components/ide/AgentTimeline.tsx`)
- Add a `onNewRun` callback prop
- When the agent run is completed or failed (not active), show a "New Run" button in the header area
- Also add a "New Run" button to the empty state (when `agentRun` is null)
- Wire this up in `IDELayout.tsx` to clear the agent run and switch focus to the chat input with agent mode enabled

### 3. Add `clearAgentRun` to IDEContext (`src/contexts/IDEContext.tsx`)
- Add a new function `clearAgentRun` that sets `agentRun` to null
- Expose it through the context so `IDELayout` can pass it to `AgentTimeline`

### 4. Wire up new run flow (`src/components/ide/IDELayout.tsx`)
- Pass an `onNewRun` handler to `AgentTimeline` that clears the agent run and switches to the chat panel with a focus hint

## Technical Details

### ChatPanel.tsx changes
- Lines 89-124: Remove the `conversations.length > 0` wrapper
- Always show the tab bar; if `conversations` is empty, show a single virtual "New Chat" tab for the current local session
- The "+" button remains always visible

### AgentTimeline.tsx changes
- Add `onNewRun?: () => void` to `AgentTimelineProps`
- In the empty state (line 76-86): Add a text input + button to start a new agent run directly, or a simpler "Start Agent Run" button
- When run is complete/failed: Add a "New Run" button next to the status badge in the header

### IDEContext.tsx changes
- Add `clearAgentRun` function: `() => setAgentRun(null)`
- Add to context type and provider value

### IDELayout.tsx changes
- Import `clearAgentRun` from context
- Pass `onNewRun` to `AgentTimeline` that calls `clearAgentRun()` and switches `activeRightPanel` to `'chat'`

### Files Modified
1. `src/components/ide/ChatPanel.tsx` -- Always show conversation tabs + "+" button
2. `src/components/ide/AgentTimeline.tsx` -- Add "New Run" button for completed/empty states
3. `src/contexts/IDEContext.tsx` -- Add `clearAgentRun`
4. `src/components/ide/IDELayout.tsx` -- Wire up `onNewRun` handler

