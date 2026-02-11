import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { DocHeading } from "@/data/docs-content";

interface DocsTOCProps {
  headings: DocHeading[];
}

export function DocsTOC({ headings }: DocsTOCProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const container = document.getElementById("docs-content-area");
    if (!container || headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible heading
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          // Pick the one closest to the top
          visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          setActiveId(visible[0].target.id);
        }
      },
      {
        root: container,
        rootMargin: "-48px 0px -70% 0px",
        threshold: 0,
      }
    );

    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [headings]);

  const scrollTo = useCallback((id: string) => {
    const container = document.getElementById("docs-content-area");
    const el = document.getElementById(id);
    if (!container || !el) return;
    const top = el.offsetTop - 64;
    container.scrollTo({ top, behavior: "smooth" });
  }, []);

  if (headings.length === 0) return null;

  return (
    <nav className="hidden xl:block w-52 shrink-0 sticky top-10 self-start max-h-[calc(100vh-8rem)]">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">On This Page</p>
      <ul className="space-y-1.5 border-l border-border">
        {headings.map((h) => (
          <li key={h.id}>
            <button
              onClick={() => scrollTo(h.id)}
              className={cn(
                "block text-left text-xs leading-relaxed py-0.5 transition-colors border-l-2 -ml-px w-full",
                h.level === 3 ? "pl-6" : "pl-3",
                activeId === h.id
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {h.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
