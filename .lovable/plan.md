
# Fix: Stop Platform From Refreshing State and Opening New Chats

## Root Cause

The IDE keeps re-initializing because of unstable React dependencies creating cascading re-render loops:

1. **Auth token refreshes** fire `onAuthStateChange`, which calls `setUser()` with a new object reference every time -- even when the user ID hasn't changed
2. **Both persistence hooks** (`useProjectPersistence` and `useConversationPersistence`) depend on the full `user` object, causing them to re-fetch data on every token refresh
3. **The conversation init effect** includes `convPersistence.conversations` in its dependency array -- this array gets a new reference on every message save, making the effect fire constantly
4. During re-fetches, `loading` flips `true -> false`, and the combination of timing and new array references can bypass the initialization guard, creating duplicate "New Chat" conversations

Evidence: The database contains 9+ "New Chat" conversations created in rapid succession (every 5-20 minutes), matching auth token refresh intervals.

## Fixes

### 1. Stabilize the `user` reference in AuthContext

**File: `src/contexts/AuthContext.tsx`**

- In `onAuthStateChange`, only call `setUser()` if the user ID actually changed (compare `user?.id` to `session?.user?.id`)
- Same guard for `getSession` -- skip the state update if user is already set with the same ID
- This prevents all downstream hooks from re-running on token refreshes

### 2. Use `user?.id` instead of `user` object as dependency

**File: `src/hooks/use-conversation-persistence.ts`**

- Change the load effect dependency from `[projectId, user]` to `[projectId, userId]` where `userId = user?.id`
- Store `user` in a ref for use in callbacks (since we still need it for DB operations), but don't use it as a dependency

**File: `src/hooks/use-project-persistence.ts`**

- Same pattern: depend on `user?.id` instead of `user` to prevent re-fetching on every token refresh

### 3. Remove `convPersistence.conversations` from the init effect dependency

**File: `src/contexts/IDEContext.tsx`**

- Change the conversation initialization effect dependency from `[projectId, convPersistence.loading, convPersistence.conversations]` to just `[projectId, convPersistence.loading]`
- The effect only needs to run when `projectId` changes or loading state changes -- not when conversation content updates
- Read `convPersistence.conversations` inside the effect body instead of depending on it reactively

### 4. Add a deduplication guard for conversation creation

**File: `src/contexts/IDEContext.tsx`**

- Add a `creatingConvRef` flag that prevents the init effect from creating multiple conversations simultaneously
- Check if a conversation was already created for this project before inserting another

## Technical Details

### AuthContext stabilization:
```typescript
// Before (fires on every token refresh):
setUser(session?.user ?? null);

// After (only fires when user actually changes):
setUser(prev => {
  const newId = session?.user?.id;
  if (prev?.id === newId) return prev;  // same user, keep stable reference
  return session?.user ?? null;
});
```

### Conversation init effect fix:
```typescript
// Before:
}, [projectId, convPersistence.loading, convPersistence.conversations]);

// After:
}, [projectId, convPersistence.loading]);
```

### Persistence hook dependency fix:
```typescript
// Before:
}, [projectId, user]);

// After:
const userId = user?.id ?? null;
}, [projectId, userId]);
```

## Files to Modify

1. `src/contexts/AuthContext.tsx` -- Stabilize user reference on token refresh
2. `src/hooks/use-conversation-persistence.ts` -- Use stable `userId` dependency
3. `src/hooks/use-project-persistence.ts` -- Use stable `userId` dependency
4. `src/contexts/IDEContext.tsx` -- Remove `conversations` from init effect deps, add creation guard

## Sequencing

1. Fix AuthContext first (biggest impact, stops cascade at the source)
2. Fix persistence hook dependencies (belt-and-suspenders)
3. Fix init effect dependency array (prevents unnecessary re-fires)
4. Add deduplication guard (safety net)
