

# AI/Agent Quality Analysis and Skills Integration

## Part 1: Quality Analysis of Started's AI/Agent

### Strengths Found
- Well-structured FSM with 13 states and clear transition rules
- Deterministic NBA scoring algorithm with tunable weights via `nba.policy.json`
- JSON Schema validation for policy overrides
- Confidence states (HIGH/MEDIUM/LOW) enforced on every action
- Retrospective generation after autonomous runs
- Multi-provider AI routing (Gemini, GPT, Claude)
- Server-side MCP tool execution within agent loops
- Persistent agent run state with step-level tracking in DB

### Issues Identified

**1. Agent loop lies about results (Critical)**
In `agent-run/index.ts` lines 600 and 607, after a patch or command, the agent injects synthetic "success" messages:
- `"The patch was applied successfully."` -- even though no patch was actually applied
- `"Command executed successfully with exit code 0."` -- even though no command was run

This causes the agent to hallucinate success and skip verification.

**2. No real command execution (Critical)**
The agent loop emits `run_command` events but never actually executes them. The `run-command` edge function exists but is never called from within the agent loop. Commands are only suggested to the client.

**3. No file context truncation safety (Medium)**
`agent-run/index.ts` line 459 slices files to 20 but has no character limit per file. A single large file could blow context limits.

**4. Conversation history accumulates unbounded (Medium)**
Every iteration appends to `conversationHistory` but there's no truncation or summarization. After 10+ iterations, the context window may overflow.

**5. Retrospective only runs for `started/started-ai` model (Low)**
Line 566 conditionally generates retrospectives only for one model. All agent runs should benefit from retrospectives.

**6. NBA `reason` field always empty (Low)**
In `nba.ts` line 241, `toScoredAction` always sets `reason: ""`. Suggestions lack explanation.

**7. No skill/knowledge injection into agent prompts (Gap)**
The agent has no mechanism to load domain-specific skills or training context, limiting its effectiveness for specialized tasks.

---

## Part 2: Skills Collection and Integration

### Curated Skills Catalog (339+ from all three sources)

From the research across all three sources, here are the most relevant skills organized by category for Started's use case:

**Official / Tier 1 (from leading dev teams):**
- Anthropic: docx, pdf, xlsx, pptx, mcp-builder, webapp-testing, skill-creator, frontend-design, algorithmic-art
- Vercel: react-best-practices, web-design-guidelines, composition-patterns, next-best-practices, react-native-skills
- Cloudflare: agents-sdk, durable-objects, wrangler, web-perf, building-mcp-server
- Supabase: postgres-best-practices
- Google Labs: react-components, shadcn-ui, stitch-loop, design-md
- Hugging Face: CLI, datasets, model-trainer, evaluation, tool-builder, trackio
- Stripe: stripe-best-practices, upgrade-stripe
- Trail of Bits: 20+ security skills (static-analysis, property-based-testing, semgrep, variant-analysis, building-secure-contracts, etc.)
- Expo: expo-app-design, expo-deployment, upgrading-expo
- Sentry: code-review, find-bugs, create-pr, commit
- HashiCorp: terraform code/module/provider generation
- Microsoft: 80+ Azure SDK skills across .NET/Java/Python/TypeScript/Rust
- Remotion: programmatic video creation
- WordPress: 13 skills (blocks, themes, plugins, REST API, etc.)
- fal.ai: image/video/audio generation and editing
- Sanity: content modeling, SEO, experimentation
- Transloadit: media processing and CDN delivery

**Community / Tier 2 (high quality):**
- obra/superpowers: test-driven-development, systematic-debugging, root-cause-tracing, dispatching-parallel-agents, brainstorming, verification-before-completion, defense-in-depth
- Context Engineering: context-fundamentals, context-degradation, context-compression, memory-systems, multi-agent-patterns, tool-design, evaluation
- UI/UX: ui-skills, ui-ux-pro-max-skill, platform-design-skills (300+ design rules from Apple HIG, Material Design, WCAG)
- Marketing: 23+ marketing skills for SEO, copywriting, email, ads
- Dev Tools: playwright-skill, ios-simulator-skill, postgres, deep-research, changelog-generator
- n8n: 7 workflow automation skills

**ClawHub / Tier 3 (agent-native):**
- web-scraper, crawl4ai, playwright-scraper
- DuckDuckGo/Google/Perplexity search skills
- Agent memory systems (dory-memory, agent-memory-ultimate, sanctuary)
- Model routing (opus, model-router-premium)
- Data analysis (data-cog, csv-analyzer, powerdrill)
- Crypto/Web3 (hyperliquid-prime, crypto-alpha-scanner, botcoin, arkade-wallet)
- Integrations (LinkedIn API, Microsoft Excel, Google Merchant, WhatsApp, Telegram, Home Assistant)
- Dev tools (gh, codex-conductor, rust-analyzer-lsp, project-scaffolder)
- Antivirus/security scanning for skills

### Implementation Plan

### 1. Fix Agent Quality Issues

**File: `supabase/functions/agent-run/index.ts`**

- Replace synthetic success messages (lines 600, 607) with honest status: `"Patch emitted to client. Awaiting application confirmation."` and `"Command suggested to client. Awaiting execution result."`
- Add file context character cap: limit total `fileContext` to 100,000 characters with truncation notice
- Add conversation history window: keep only last 10 iterations of assistant+user messages, summarize older ones
- Enable retrospectives for all models (remove the `started/started-ai` guard at line 566)

**File: `src/lib/policies/nba.ts`**

- Populate the `reason` field in `toScoredAction` with a generated explanation based on which scoring factors contributed (e.g., "Last run failed (+40 urgency)")

### 2. Create Skills Data Infrastructure

**New file: `src/data/skills-catalog.ts`**

- Define `Skill` type with: `id`, `name`, `source` (awesome-agent-skills | skillsmp | clawhub), `category`, `subcategory`, `description`, `author`, `url`, `tags[]`, `tier` (official | community | marketplace), `compatibility[]` (claude-code, codex, gemini-cli, cursor, etc.)
- Export a `SKILLS_CATALOG` array with all 339+ skills curated above, organized into categories:
  - Development (React, Next.js, TypeScript, Python, Rust, Swift, etc.)
  - Security (Trail of Bits suite, contract auditing, static analysis)
  - DevOps/Infrastructure (Terraform, Cloudflare, AWS, Docker)
  - AI/ML (Hugging Face, fal.ai, model training)
  - Data/Analytics (CSV, BIM, visualization)
  - Web3/Crypto (Solana, EVM, DeFi)
  - Productivity (Notion, Linear, WhatsApp, Slack)
  - Content/Marketing (SEO, copywriting, social media)
  - Context Engineering (memory, compression, multi-agent)
  - UI/UX Design (design systems, accessibility)
  - Testing/QA (TDD, Playwright, property-based)
  - Agent Meta-Skills (model routing, skill creation, retrospectives)

### 3. Create Skills Browser UI

**New file: `src/components/ide/SkillsBrowser.tsx`**

- Searchable, filterable catalog of all skills
- Category chips for quick filtering
- Tier badges (Official / Community / Marketplace)
- Source indicator (awesome-agent-skills, SkillsMP, ClawHub)
- "Add to Agent Context" button that injects the skill description into the agent's system prompt
- Link to original skill source for full documentation
- Integrated into the IDE sidebar as a new panel tab

### 4. Skills Injection into Agent Prompts

**File: `supabase/functions/agent-run/index.ts`**

- Accept optional `skills` field in the `AgentRequest` interface: `skills?: Array<{ name: string; instructions: string }>`
- When skills are provided, inject them as an additional system message: `"ACTIVE SKILLS:\n{skill instructions}"` after the main system prompt
- Cap total skills context to 15,000 characters

**File: `src/components/ide/ChatPanel.tsx`**

- Add selected skills state that gets passed to agent runs
- Show active skills as chips in the context strip

### 5. Add Skills Panel to IDE Navigation

**File: `src/components/ide/IDELayout.tsx`**

- Add a "Skills" icon button to the left nav sidebar (using `Sparkles` or `BookOpen` icon)
- Wire it to toggle the SkillsBrowser panel

## Technical Details

### Files to Create
1. `src/data/skills-catalog.ts` -- Full curated catalog (339+ entries)
2. `src/components/ide/SkillsBrowser.tsx` -- Search/filter/browse UI

### Files to Modify
1. `supabase/functions/agent-run/index.ts` -- Fix 5 quality issues + add skills injection
2. `src/lib/policies/nba.ts` -- Populate `reason` field
3. `src/components/ide/ChatPanel.tsx` -- Active skills chips in context strip
4. `src/components/ide/IDELayout.tsx` -- Skills panel nav button
5. `src/types/agent.ts` -- Add `Skill` type if needed

### Sequencing
1. Fix agent quality issues first (critical bugs)
2. Create skills data catalog
3. Build Skills Browser UI
4. Wire skills injection into agent prompts
5. Add IDE navigation entry

