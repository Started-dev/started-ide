

# UI Refinements: Toolbar Labels, Modal Selectors, Collab Gating, and Billing Fix

## Changes Overview

### 1. Rename "TX" to "Web3" with a Selection Modal

**IDELayout.tsx**: Change the toolbar button label from "TX" to "Web3". Instead of directly opening `TransactionBuilder`, open a new **Web3 modal** that lists available Web3 integrations as selectable cards:
- Transaction Builder (current `TransactionBuilder` component)
- TX Simulator (links to the `mcp-tx-simulator` edge function tools)
- Contract Intel (links to `mcp-contract-intel`)
- EVM RPC (links to `mcp-evm-rpc`)
- Solana (links to `mcp-solana`)
- Web3 Gateway (links to `mcp-web3-gateway`)

Selecting "Transaction Builder" opens the existing `TransactionBuilder` component. Other items open the MCP config panel pre-filtered to that server, or show a brief description with a "Configure in MCP" action.

**New file**: `src/components/ide/Web3Modal.tsx` -- A selection dialog with icon cards for each Web3 integration.

### 2. Rename "Claw" to "Install" with a Selection Modal

**IDELayout.tsx**: Change the toolbar button label from "Claw" to "Install". Instead of directly opening `OpenClawPanel`, open a new **Install modal** listing available installable tools:
- OpenClaw / MoltBot (opens the existing `OpenClawPanel`)
- Future slots can be added here

This is explicitly separate from MCP -- Installs are full deployable services, not protocol connections.

**New file**: `src/components/ide/InstallModal.tsx` -- A selection dialog. Clicking "OpenClaw / MoltBot" opens the `OpenClawPanel`.

### 3. Rename "Perms" to "Permissions"

**IDELayout.tsx**: Change the toolbar button label from `Perms` to `Permissions`.

### 4. Gate Collaboration Behind Pro/Studio Plans

**IDELayout.tsx**: When the user clicks "Collab", check the current plan. If it's `free` or `builder`, show a toast or small dialog saying "Collaboration requires a Pro or Studio plan" instead of opening the panel. Only open `CollaborationPanel` for `pro` or `studio` users.

This requires reading the user's plan from `api_usage_ledger` (already fetched in `IDEContext` or fetching it once).

### 5. Fix "-1 projects" Display to Show "Unlimited"

**UserSettings.tsx line 376**: The current check is `plan.max_projects === 999`. The Studio plan actually has `max_projects: -1`. Update the condition to:
```
plan.max_projects < 0 || plan.max_projects >= 999 ? 'Unlimited' : plan.max_projects
```

---

## Technical Details

### Files Created
- `src/components/ide/Web3Modal.tsx` -- Grid of Web3 integration cards (TX Builder, TX Simulator, Contract Intel, EVM RPC, Solana, Web3 Gateway). Each card has an icon, title, and description. Clicking one either opens the corresponding component directly or navigates to MCP config.
- `src/components/ide/InstallModal.tsx` -- Grid of installable services. Currently only OpenClaw/MoltBot. Each card opens the relevant panel.

### Files Modified
- `src/components/ide/IDELayout.tsx`:
  - Import `Web3Modal` and `InstallModal`
  - Replace `showTxBuilder` state with `showWeb3` state
  - Replace `showOpenClaw` state with `showInstall` state
  - Toolbar button "TX" becomes "Web3"
  - Toolbar button "Claw" becomes "Install"
  - Toolbar button "Perms" becomes "Permissions"
  - Add plan-gating logic for Collab button (fetch plan_key from `api_usage_ledger` or pass from context)
  - Render `Web3Modal` and `InstallModal` instead of directly rendering `TransactionBuilder` / `OpenClawPanel`

- `src/pages/UserSettings.tsx`:
  - Line 376: Change `plan.max_projects === 999` to `plan.max_projects < 0 || plan.max_projects >= 999`

### Collab Plan Gating Approach
- Add a state `userPlanKey` in `IDELayout` that fetches the current user's plan from `api_usage_ledger` on mount
- When "Collab" is clicked, check if `userPlanKey` is `pro` or `studio`; if not, show a toast: "Collaboration is available on Pro and Studio plans. Upgrade in Settings."
- The OpenClaw MCP (`mcp-openclaw`) remains untouched and continues to work independently as an MCP server connection

