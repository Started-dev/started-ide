import * as React from "react";
import { motion } from "framer-motion";

type HeroProps = {
  title?: string;
  subtitle?: string;
  ctaPrimaryLabel?: string;
  onCtaPrimary?: () => void;
  ctaSecondaryLabel?: string;
  ctaSecondaryHref?: string;
  badgeText?: string;
};

const ORANGE = "#F5A623";

export default function Hero({
  title = "Ship production software\nwith AI agents.",
  subtitle = "Plan, generate, verify, and deploy real applications — inside a live AI-native development environment.",
  ctaPrimaryLabel = "Get Started",
  onCtaPrimary,
  ctaSecondaryLabel = "View Documentation",
  ctaSecondaryHref = "https://docs.started.dev",
  badgeText = "Now in Public Beta",
}: HeroProps) {
  return (
    <section className="relative w-full min-h-[calc(100vh-72px)] flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <HeroBackground />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-3xl mx-auto gap-6">
        {/* Micro-labels */}
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1 text-xs font-medium text-primary tracking-wide">
            {badgeText}
          </span>
          <span className="hidden sm:inline-flex items-center rounded-full border border-border/40 bg-muted/30 px-3 py-1 text-[11px] font-mono text-muted-foreground/60 tracking-wider">
            Deterministic build runtime
          </span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
          {renderTitleWithAccent(title)}
        </h1>

        <p className="text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
          {subtitle}
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
          <button
            onClick={onCtaPrimary}
            className="h-11 px-7 text-sm font-medium rounded-lg bg-primary text-primary-foreground shadow-[0_0_20px_hsl(38_92%_50%/0.15)] hover:shadow-[0_0_30px_hsl(38_92%_50%/0.25)] hover:bg-primary/90 transition-all duration-300 hover:scale-[1.02] inline-flex items-center gap-2"
          >
            {ctaPrimaryLabel}
            <span className="ml-1">→</span>
          </button>
          <a
            href={ctaSecondaryHref}
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 px-7 text-sm font-medium rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all duration-300 inline-flex items-center"
          >
            {ctaSecondaryLabel}
          </a>
        </div>

        <p className="text-xs text-muted-foreground/50 mt-1 tracking-wide">
          No setup required&ensp;•&ensp;Runs in your browser
        </p>
      </div>
    </section>
  );
}

function renderTitleWithAccent(title: string) {
  const lines = title.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const parts = splitKeep(line, "AI agents");
        return (
          <React.Fragment key={i}>
            {parts.map((p, idx) =>
              p === "AI agents" ? (
                <span key={idx} className="text-primary">
                  {p}
                </span>
              ) : (
                <span key={idx}>{p}</span>
              )
            )}
            {i < lines.length - 1 ? <br /> : null}
          </React.Fragment>
        );
      })}
    </>
  );
}

function splitKeep(input: string, token: string) {
  if (!input.includes(token)) return [input];
  const out: string[] = [];
  let rest = input;
  while (rest.includes(token)) {
    const idx = rest.indexOf(token);
    if (idx > 0) out.push(rest.slice(0, idx));
    out.push(token);
    rest = rest.slice(idx + token.length);
  }
  if (rest) out.push(rest);
  return out;
}

function HeroBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base background */}
      <div className="absolute inset-0 bg-background" />

      {/* Subtle vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 40%, transparent 40%, hsl(var(--background)) 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 40%, hsl(38 92% 50% / 0.06) 0%, transparent 70%)",
        }}
      />

      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Diagonal beam */}
      <motion.div
        className="absolute"
        style={{
          width: "200%",
          height: 1,
          top: "45%",
          left: "-50%",
          background: `linear-gradient(90deg, transparent 0%, ${ORANGE}15 30%, ${ORANGE}25 50%, ${ORANGE}15 70%, transparent 100%)`,
          transform: "rotate(-6deg)",
        }}
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Pipeline SVG overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.12] pointer-events-none">
        <svg viewBox="0 0 1000 500" className="w-full h-full max-w-5xl" preserveAspectRatio="xMidYMid meet">
          <Pipeline />
        </svg>
      </div>

      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32"
        style={{
          background: "linear-gradient(to top, hsl(var(--background)), transparent)",
        }}
      />
    </div>
  );
}

function Pipeline() {
  const nodes = [
    { x: 170, y: 310, label: "Intent" },
    { x: 330, y: 270, label: "Plan" },
    { x: 500, y: 310, label: "Patch" },
    { x: 670, y: 270, label: "Verify" },
    { x: 830, y: 310, label: "Deploy" },
  ];

  const d = `M ${nodes[0].x} ${nodes[0].y}
             C 240 250, 280 250, ${nodes[1].x} ${nodes[1].y}
             S 430 350, ${nodes[2].x} ${nodes[2].y}
             S 610 250, ${nodes[3].x} ${nodes[3].y}
             S 770 350, ${nodes[4].x} ${nodes[4].y}`;

  return (
    <>
      {/* Faint arcs */}
      <g opacity="0.15">
        <ellipse cx="500" cy="300" rx="350" ry="120" fill="none" stroke={ORANGE} strokeWidth="0.5" strokeDasharray="4 8" />
        <ellipse cx="500" cy="300" rx="250" ry="80" fill="none" stroke={ORANGE} strokeWidth="0.3" strokeDasharray="2 6" />
      </g>

      {/* Main pipeline path */}
      <path d={d} fill="none" stroke={ORANGE} strokeWidth="1.5" opacity="0.4" />

      {/* Animated pulse */}
      <motion.circle r="4" fill={ORANGE} opacity="0.8">
        <animateMotion dur="4s" repeatCount="indefinite" path={d} />
      </motion.circle>

      {/* Nodes */}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r="12" fill="none" stroke={ORANGE} strokeWidth="0.8" opacity="0.5" />
          <circle cx={n.x} cy={n.y} r="4" fill={ORANGE} opacity="0.7" />
          <motion.circle
            cx={n.x}
            cy={n.y}
            r="8"
            fill={ORANGE}
            opacity={0}
            animate={{ opacity: [0, 0.4, 0], r: [8, 16, 8] }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              delay: i * 0.5,
              ease: "easeInOut",
            }}
          />
          <text x={n.x} y={n.y + 28} textAnchor="middle" fontSize="9" fill={ORANGE} opacity="0.5" fontFamily="monospace" letterSpacing="0.1em">
            {n.label.toUpperCase()}
          </text>
        </g>
      ))}

      {/* Attestation stamps */}
      <Stamp x={400} y={220} label="HASH" />
      <Stamp x={750} y={220} label="ATTEST" />
    </>
  );
}

function Stamp({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g opacity="0.3">
      <rect x={x - 22} y={y - 8} width="44" height="16" rx="3" fill="none" stroke={ORANGE} strokeWidth="0.8" strokeDasharray="2 2" />
      <text x={x} y={y + 4} textAnchor="middle" fontSize="7" fill={ORANGE} fontFamily="monospace" letterSpacing="0.15em">
        {label}
      </text>
    </g>
  );
}
