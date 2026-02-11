import { motion } from "framer-motion";

type HeroProps = {
  onCtaPrimary?: () => void;
};

export default function Hero({ onCtaPrimary }: HeroProps) {
  return (
    <section className="relative w-full min-h-screen flex flex-col justify-center overflow-hidden bg-[#0d0d0f]">
      <div className="relative z-10 w-full max-w-[1100px] mx-auto px-8 lg:px-16 py-20">
        {/* Text block — left aligned */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="flex flex-col items-start gap-6"
        >
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-medium tracking-tight text-white leading-[1.08]">
            Ship real s<span className="font-mono">ø</span>ftware.
          </h1>

          <p className="text-base sm:text-lg text-gray-400 max-w-md">
            Started is y<span className="font-mono">ø</span>ur AI engineer.
          </p>

          <button
            onClick={onCtaPrimary}
            className="mt-2 h-11 px-7 text-sm font-medium rounded-lg bg-white text-[#0d0d0f] hover:opacity-90 transition-opacity duration-200 inline-flex items-center gap-2 w-full sm:w-auto justify-center"
          >
            Get Started
            <span>→</span>
          </button>

          <p className="text-xs text-gray-500 tracking-wide">
            Runs in y<span className="font-mono">ø</span>ur br<span className="font-mono">ø</span>wser.
          </p>
        </motion.div>

        {/* IDE Mock */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          className="mt-20 sm:mt-28 mx-auto max-w-[900px]"
        >
          <IDEMock />
        </motion.div>
      </div>

      {/* Subtle radial fade behind IDE area */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, rgba(255,255,255,0.015) 0%, transparent 70%)",
        }}
      />
    </section>
  );
}

/* ─── IDE Mock ─── */

function IDEMock() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#131316] shadow-[0_8px_40px_rgba(0,0,0,0.4)] overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="flex-1 text-center text-[11px] text-gray-500 font-medium tracking-wide">
          Started
        </span>
        <div className="w-[52px]" />
      </div>

      {/* Content area — split panels */}
      <div className="flex flex-col sm:flex-row min-h-[280px] sm:min-h-[320px]">
        {/* Left: Agent panel */}
        <div className="sm:w-[260px] border-b sm:border-b-0 sm:border-r border-white/[0.06] p-4 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">
              Ready for review
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-300 font-medium">Build landing page</span>
            <span className="text-[10px] text-gray-500">Completed</span>
          </div>

          <div className="flex flex-col gap-2.5 mt-2">
            <TaskItem label="Create layout components" />
            <TaskItem label="Add responsive styles" />
            <TaskItem label="Write unit tests" />
          </div>
        </div>

        {/* Right: Editor / terminal preview */}
        <div className="flex-1 flex flex-col">
          {/* URL bar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
            <span className="text-[11px] font-mono text-gray-500">
              localhost:3000
            </span>
          </div>

          {/* Terminal output */}
          <div className="flex-1 p-4 font-mono text-[12px] leading-relaxed text-gray-500 flex flex-col gap-1">
            <span>
              <span className="text-gray-400">›</span> Creating production-ready app...
            </span>
            <span>
              <span className="text-gray-400">›</span> Installing dependencies
            </span>
            <span>
              <span className="text-gray-400">›</span> Running test suite
            </span>
            <span className="text-emerald-500/70">
              <span className="text-gray-400">›</span> Tests passed.
            </span>
            <span className="text-emerald-500/70">
              <span className="text-gray-400">›</span> Deployment ready.
            </span>
            <span className="mt-1 inline-flex items-center">
              <span className="text-gray-400">›</span>
              <span className="w-[6px] h-[14px] bg-gray-500 ml-1 animate-pulse" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskItem({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 shrink-0" />
      <span className="text-[11px] text-gray-500">{label}</span>
    </div>
  );
}
