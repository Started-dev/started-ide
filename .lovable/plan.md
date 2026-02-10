

# Fix: New Chat Tabs, Patch Preview Polish, and Auto-Apply Reliability

## Problems Found

### 1. New Chat replaces current tab instead of adding one
When `newConversation()` is called (line 251-263 in IDEContext), it creates a new conversation and calls `convPersistence.createConversation(newConv)`. That appends to the `conversations` array in the persistence hook (line 105). However, the `useEffect` on line 201-223 that initializes conversations has a dependency on `convPersistence.conversations` -- meaning every time a new conversation is created, this effect re-runs. The guard `convInitializedRef.current === projectId` prevents re-initialization, but only after the first load. The real issue is that `newConversation` saves the old conversation, sets new local state, but the old conversation's tab in the UI depends on `convPersistence.conversations` which updates asynchronously. If `createConversation` fails (no user logged in), the new conversation never appears in the tab bar at all, so it looks like the previous one vanished.

**Fix**: When the user is not authenticated, maintain a local-only conversations array so tabs always work. Also ensure `newConversation` optimistically adds to a local list before the DB write completes.

### 2. Patch Preview UI needs polish
- The component works but looks utilitarian. Will add: a subtle applied/failed status indicator with animation, compact the header, and show a small inline summary of changes (e.g., "2 files, +15 -3") instead of requiring expansion.
- For auto-applied patches, show a minimal "Applied" chip instead of the full preview card.

### 3. Auto-apply of AI-generated code is unreliable
The current `extractDiffFromMessage` only matches ` ```diff\n...``` ` blocks. Many AI responses use different formats:
- Fenced blocks without the `diff` language tag
- Inline file creation instructions with ` ```typescript `, ` ```python `, etc. and a file path header
- The AI prompt (`started-prompt.ts`) instructs the AI to output unified diffs, but responses may vary

The auto-apply also has a stale closure issue: `sendMessage`'s `onDone` callback references `files` from the time the message was sent, not the current files. If the AI modifies a file that was just created in the same response, the patch fails.

**Fix**: 
- Use a ref (`filesRef`) to always access the latest files when applying patches
- Enhance `extractDiffFromMessage` to also match code blocks with file-path headers (e.g., ` ```typescript src/main.ts `)
- Auto-create files from non-diff code blocks when a file path is detected
- Mark auto-applied patches as `'applied'` immediately (no preview step for auto mode)

---

## Changes

### 1. Fix New Chat session management (`src/contexts/IDEContext.tsx`)
- Add a `localConversations` state that merges DB conversations with locally-created ones
- `newConversation` adds to local state immediately (optimistic), then persists to DB
- The tab bar reads from this merged list so tabs never vanish
- When not authenticated, all conversations live in local state only

### 2. Fix New Chat tab rendering (`src/components/ide/ChatPanel.tsx`)  
- Use the merged conversations list from context
- Ensure the newly created conversation tab is always visible and active
- Add scroll-into-view for the active tab

### 3. Polish Patch Preview (`src/components/ide/PatchPreview.tsx`)
- For `status === 'applied'`: render a compact single-line chip showing file count and stats, not the full card
- For `status === 'preview'`: keep the current expandable card but add subtle border-left accent color
- Add a slide-in animation for new patches
- Clean up the header to be more compact

### 4. Fix auto-apply reliability (`src/contexts/IDEContext.tsx` + `src/lib/patch-utils.ts`)
- Add `filesRef = useRef(files)` that stays in sync, use it in `onDone` callbacks
- In `extractDiffFromMessage`: also match code blocks with explicit file paths in the header line
- Add a new function `extractFileBlocksFromMessage` that finds ` ```lang filepath\n...``` ` patterns and creates files from them
- In `sendMessage.onDone` and agent `onPatch`: use `filesRef.current` instead of the stale `files` closure
- Consolidate the duplicated patch-apply logic (chat and agent both have near-identical code) into a shared `autoApplyParsedPatches` function

### 5. Consolidate patch application logic (`src/contexts/IDEContext.tsx`)
- Extract the duplicated new-file-creation + folder-scaffolding + existing-file-patching code into a single `autoApplyParsedPatches(parsed: ParsedPatch[])` function
- Used by: `sendMessage.onDone`, `startAgent.onPatch`, and `applyPatchToFiles`
- This eliminates 3 copies of the same logic and ensures consistency

---

## Technical Details

### filesRef pattern
```typescript
const filesRef = useRef(files);
useEffect(() => { filesRef.current = files; }, [files]);
```
Used in async callbacks to avoid stale closures.

### extractFileBlocksFromMessage (new in patch-utils.ts)
```typescript
// Matches: ```typescript src/utils.ts\n...\n```
// Returns array of { path, content, language }
export function extractFileBlocksFromMessage(message: string): FileBlock[];
```

### autoApplyParsedPatches (new helper in IDEContext)
```typescript
const autoApplyParsedPatches = useCallback((parsed: ParsedPatch[]) => {
  for (const patch of parsed) {
    // Uses filesRef.current for latest state
    // Creates folders, new files, applies modifications
    // Calls saveFile for persistence
  }
}, [saveFile]);
```

### Compact applied patch chip (PatchPreview.tsx)
For applied/cancelled/failed patches, render a single-line summary:
```
[check icon] Applied 2 files (+15 -3)    [expand toggle]
```
Only show the full diff card if the user clicks to expand.

### Files Modified
1. `src/contexts/IDEContext.tsx` -- filesRef, autoApplyParsedPatches helper, fix newConversation
2. `src/lib/patch-utils.ts` -- extractFileBlocksFromMessage, improve extractDiffFromMessage
3. `src/components/ide/PatchPreview.tsx` -- compact applied state, polish styling
4. `src/components/ide/ChatPanel.tsx` -- scroll active tab into view

