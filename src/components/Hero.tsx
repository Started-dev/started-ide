import { motion } from "framer-motion";
import ideMock from "@/assets/ide-hero-mock.png";

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
            Ship real s<span className="font-mono text-[hsl(38,92%,50%)]">ø</span>ftware<span className="text-[hsl(38,92%,50%)]">.</span>
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

        {/* IDE Screenshot */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          className="mt-20 sm:mt-28 mx-auto max-w-[900px]"
        >
          <div className="rounded-xl border border-[hsl(38,92%,50%,0.1)] bg-[#131316] shadow-[0_8px_40px_rgba(0,0,0,0.5)] overflow-hidden">
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

            {/* Screenshot */}
            <img
              src={ideMock}
              alt="Started IDE — AI-powered development environment"
              className="w-full h-auto block"
              loading="lazy"
            />
          </div>
        </motion.div>
      </div>

      {/* Subtle radial orange glow behind IDE */}
      <div
        className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, hsl(38 92% 50% / 0.03) 0%, transparent 70%)",
        }}
      />
    </section>
  );
}
