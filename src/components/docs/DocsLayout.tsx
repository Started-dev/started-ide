import { useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { docsContent } from "@/data/docs-content";
import { DocsNav } from "./DocsNav";
import { DocsSidebar } from "./DocsSidebar";
import { DocsContent } from "./DocsContent";
import { DocsTOC } from "./DocsTOC";
import { DocsPrevNext } from "./DocsPrevNext";
import { DocsSearch } from "./DocsSearch";
import { DocsScrollProgress } from "./DocsScrollProgress";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function DocsLayout() {
  const { section, subsection } = useParams();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const slug = subsection ? `${section}/${subsection}` : section;

  // Default redirect
  if (!slug) return <Navigate to="/docs/introduction" replace />;

  const page = slug ? docsContent[slug] : undefined;
  if (!page) return <Navigate to="/docs/introduction" replace />;

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <DocsNav onSearchOpen={() => setSearchOpen(true)} onMenuOpen={() => setMenuOpen(true)} />
      <DocsScrollProgress />
      <DocsSearch open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Mobile sidebar sheet */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border">
          <DocsSidebar onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-64 shrink-0 border-r border-border bg-sidebar overflow-y-auto">
          <DocsSidebar />
        </aside>

        {/* Main content area — the ONLY scrollable region */}
        <main id="docs-content-area" className="flex-1 overflow-y-auto">
          <div className="flex gap-8 px-6 md:px-10 py-10 max-w-6xl mx-auto">
            <DocsContent page={page} />
            <DocsTOC headings={page.headings} />
          </div>
          <div className="px-6 md:px-10 pb-16 max-w-3xl mx-auto">
            <DocsPrevNext currentSlug={page.slug} />
          </div>
          {/* Footer */}
          <footer className="border-t border-border px-6 md:px-10 py-6 max-w-6xl mx-auto">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>© {new Date().getFullYear()} Started.dev</span>
              <div className="flex items-center gap-4">
                <a href="https://github.com" className="hover:text-foreground transition-colors" target="_blank" rel="noopener noreferrer">GitHub</a>
                <a href="https://started.dev" className="hover:text-foreground transition-colors" target="_blank" rel="noopener noreferrer">started.dev</a>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
