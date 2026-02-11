

# Documentation Site for Started.dev

## Overview

Build a GitBook-style documentation experience as a new `/docs` route within the existing React/Vite application, reusing the app's design system (dark theme, orange accent, Inter/JetBrains Mono fonts, sidebar tokens).

**Important**: The request mentions Next.js, but this project is React + Vite. The docs will be built within the existing stack using React Router, which achieves the same result.

## Architecture

The docs system will use a JSON/TypeScript-based content model (not MDX, since this is Vite, not Next.js). Each doc page is a structured object with markdown-like content rendered by custom components.

```text
/docs                    --> Docs layout with sidebar + content
/docs/:section           --> Section page (e.g., /docs/introduction)
/docs/:section/:subsection --> Subsection (e.g., /docs/architecture/storage-zone)
```

## File Structure

```text
src/
  pages/
    Docs.tsx                    # Main docs page with layout
  components/docs/
    DocsLayout.tsx              # 3-column layout (sidebar, content, TOC)
    DocsSidebar.tsx             # Left navigation with collapsible sections
    DocsContent.tsx             # Main content renderer
    DocsTOC.tsx                 # Right "On This Page" table of contents
    DocsSearch.tsx              # Cmd+K search overlay
    DocsNav.tsx                 # Top breadcrumb + navigation bar
    DocsPrevNext.tsx            # Previous/Next page navigation
    DocsCallout.tsx             # Note, Warning, Tip, Danger callouts
    DocsCodeBlock.tsx           # Syntax-highlighted code with copy button
    DocsScrollProgress.tsx      # Subtle scroll progress indicator
  data/
    docs-content.ts             # All documentation content structured as data
    docs-navigation.ts          # Navigation tree definition
```

## Layout Design

- **Left Sidebar** (~260px): Collapsible sections using existing Sidebar UI components, active section highlighting, scrollable
- **Main Content** (centered, max-w-3xl): Rendered doc content with proper heading hierarchy, code blocks, callouts
- **Right TOC** (~200px, hidden on mobile): "On This Page" floating links with active scroll tracking
- **Top Bar**: Breadcrumbs + search trigger + dark/light toggle
- **Bottom**: Previous/Next navigation links

## Styling Approach

All components will use the existing design tokens:
- `bg-background`, `bg-card`, `bg-sidebar` for surfaces
- `text-foreground`, `text-muted-foreground` for text
- `border-border`, `border-sidebar-border` for borders
- `text-primary` (orange) for active states and accents
- `font-mono` for code elements
- Same scrollbar styling, same spacing patterns

## Content Sections (12 pages)

1. **Introduction** - Overview of Started.dev
2. **Architecture** (with subsections: Storage Zone, Compute Zone, Networking Zone, Proof Zone)
3. **Snapshots and Merkle Model** - Content-addressed storage
4. **Runner Mesh** - Distributed compute
5. **MCP Integrations** - Model Context Protocol servers
6. **Agent Mode** - Autonomous execution
7. **Build Attestations** - Verifiable builds
8. **API Reference** - Edge function APIs
9. **NBA Policy** - Never-Build-Alone policy engine
10. **Ship Mode** - Deployment workflow
11. **Security Model** - Permissions and safety
12. **FAQ** - Common questions

Each page will have coherent placeholder content relevant to the actual app features.

## Core Features

- **Syntax highlighting**: Custom CSS-based highlighting for TypeScript/JSON code blocks (no heavy dependency)
- **Copy-to-clipboard**: Button on every code block
- **Callout blocks**: Note (blue), Warning (orange), Tip (green), Danger (red) with icons
- **Cmd+K search**: Overlay that filters all doc pages by title and content keywords
- **Scroll progress**: Thin orange bar at the top of the content area
- **Active TOC tracking**: IntersectionObserver to highlight the current heading
- **Anchor links**: Click heading to copy link, hash-based navigation
- **Mobile responsive**: Sidebar becomes a sheet/drawer, TOC hidden, full-width content

## Technical Details

- Add `/docs/*` route to `App.tsx` (public, no auth required)
- Use `useParams` and `useLocation` for doc routing
- Scroll tracking via `IntersectionObserver`
- Search uses simple client-side filtering
- Framer Motion for subtle page transitions
- Reuse existing UI primitives: `ScrollArea`, `Sheet`, `Button`, `Separator`, `Collapsible`

## New Dependencies

None required. All built with existing packages (React Router, Framer Motion, Lucide icons, Radix UI primitives).

