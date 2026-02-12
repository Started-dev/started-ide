import { motion } from "framer-motion";
import ideScreenshot from "@/assets/ide-screenshot-real.png";

type HeroProps = {
  onCtaPrimary?: () => void;
};

export default function Hero({ onCtaPrimary }: HeroProps) {
  return (
    <section className="relative w-full min-h-screen flex flex-col justify-center overflow-hidden bg-background">
      <div className="relative z-10 w-full max-w-[1400px] mx-auto px-5 sm:px-8 lg:px-16 py-12 sm:py-16 lg:py-20">
        {/* Text block — centered on mobile, left-aligned on sm+ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="flex flex-col items-center sm:items-start gap-4 sm:gap-6"
        >
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-medium tracking-tight text-foreground leading-[1.08] text-center sm:text-left">
            Ship real s<span className="font-mono text-primary">ø</span>ftware
            <span className="text-primary">.</span>
          </h1>

          <p className="text-sm sm:text-base lg:text-lg text-muted-foreground max-w-md text-center sm:text-left">
            Started is your AI engineer that runs in your browser.
          </p>

          <button
            onClick={onCtaPrimary}
            className="mt-1 sm:mt-2 h-12 sm:h-11 px-7 text-sm font-medium rounded-lg bg-foreground text-background hover:opacity-90 active:scale-[0.97] transition-all duration-200 inline-flex items-center gap-2 w-full sm:w-auto justify-center"
          >
            Get Started
            <span>→</span>
          </button>
        </motion.div>

        {/* IDE Screenshot with perspective effect */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          className="mt-12 sm:mt-20 lg:mt-28 w-full sm:w-[calc(100%+6rem)] sm:-mx-12 lg:w-[calc(100%+16rem)] lg:-mx-32 max-w-none"
          style={{ perspective: "1200px" }}
        >
          <div
            className="group rounded-xl border border-primary/15 bg-card shadow-[0_12px_60px_rgba(0,0,0,0.6)] overflow-hidden transition-all duration-500 hover:border-primary/30 hover:shadow-[0_16px_70px_rgba(0,0,0,0.7)]"
            style={{
              transform: "rotateX(2deg)",
              transformOrigin: "center bottom",
            }}
          >
            {/* Title bar */}
            <div className="flex items-center px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border/40">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-destructive" />
                <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-primary" />
                <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[hsl(var(--ide-success))]" />
              </div>
              <span className="flex-1 text-center text-[10px] sm:text-[11px] text-muted-foreground font-medium tracking-wide">
                Started
              </span>
              <div className="w-10 sm:w-[52px]" />
            </div>

            {/* Screenshot */}
            <img
              src={ideScreenshot}
              alt="Started IDE — AI-powered development environment"
              className="w-full h-auto block object-cover"
              loading="eager"
            />
          </div>

          {/* Bottom fade gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-20 sm:h-32 pointer-events-none bg-gradient-to-t from-background to-transparent" />
        </motion.div>
      </div>

      {/* Subtle radial orange glow behind IDE */}
      <div
        className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[600px] sm:w-[800px] h-[300px] sm:h-[400px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(var(--primary) / 0.04) 0%, transparent 70%)",
        }}
      />
    </section>
  );
}
