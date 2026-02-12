import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Hero from '@/components/Hero';
import startedWordmark from '@/assets/started-wordmark.svg';
import startedWordmarkLight from '@/assets/started-wordmark-light.svg';
import { useTheme } from 'next-themes';
import { useIsMobile } from '@/hooks/use-mobile';

export default function Auth() {
  const { user, loading, signIn, signUp } = useAuth();
  const { resolvedTheme } = useTheme();
  const isMobile = useIsMobile();
  const wordmark = resolvedTheme === 'light' ? startedWordmarkLight : startedWordmark;
  const [showAuth, setShowAuth] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (isSignUp) {
      const { error } = await signUp(email, password);
      if (error) setError(error);
      else setSignUpSuccess(true);
    } else {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    }
    setSubmitting(false);
  };

  const closeAuth = () => {
    setShowAuth(false);
    setError(null);
    setSignUpSuccess(false);
  };

  const authContent = signUpSuccess ? (
    <div className="text-center py-4">
      <Mail className="h-8 w-8 text-primary mx-auto mb-3" />
      <h2 className="text-sm font-semibold text-foreground mb-2">Check your email</h2>
      <p className="text-xs text-muted-foreground mb-4">
        We sent a verification link to{' '}
        <span className="font-medium text-foreground">{email}</span>. Click it to activate your account.
      </p>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => { setSignUpSuccess(false); setIsSignUp(false); }}
        className="text-xs"
      >
        Back to sign in
      </Button>
    </div>
  ) : (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-base font-semibold text-foreground text-center">
        {isSignUp ? 'Create an account' : 'Sign in to Started'}
      </h2>

      {error && (
        <div className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-9 h-10 text-sm bg-background"
            required
          />
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pl-9 h-10 text-sm bg-background"
            required
            minLength={6}
          />
        </div>
      </div>

      <Button type="submit" disabled={submitting} className="w-full h-10 text-sm">
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            {isSignUp ? 'Sign up' : 'Sign in'}
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </>
        )}
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
        <button
          type="button"
          onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
          className="text-primary hover:underline font-medium"
        >
          {isSignUp ? 'Sign in' : 'Sign up'}
        </button>
      </p>

      <p className="text-[11px] text-center text-muted-foreground/50">
        By continuing you agree to our Terms&nbsp;of&nbsp;Service and Privacy&nbsp;Policy.
      </p>
    </form>
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {/* ── Top Nav ── */}
      <nav className="relative z-10 flex items-center justify-between px-4 md:px-10 py-3 md:py-4 mx-3 md:mx-8 mt-2 md:mt-3 rounded-2xl border border-border/30 bg-card/40 backdrop-blur-md shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        <div className="flex items-center">
          <img src={wordmark} alt="Started" className="h-7 md:h-10" />
        </div>
        <div className="flex items-center gap-4 md:gap-6">
          <a
            href="https://docs.started.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            Docs
          </a>
          <button
            onClick={() => { setShowAuth(true); setIsSignUp(false); }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 whitespace-nowrap"
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <Hero onCtaPrimary={() => { setShowAuth(true); setIsSignUp(true); }} />

      {/* ── Auth Modal Overlay ── */}
      <AnimatePresence>
        {showAuth && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
              onClick={closeAuth}
            />

            {/* Modal content */}
            {isMobile ? (
              /* Bottom sheet on mobile */
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl p-6 pb-8 shadow-2xl"
              >
                {/* Drag handle */}
                <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-5" />
                <button
                  onClick={closeAuth}
                  className="absolute top-4 right-4 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
                {authContent}
              </motion.div>
            ) : (
              /* Centered modal on desktop */
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
              >
                <div className="relative w-full max-w-sm mx-4 bg-card border border-border rounded-xl p-6 shadow-2xl pointer-events-auto">
                  <button
                    onClick={closeAuth}
                    className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  {authContent}
                </div>
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
