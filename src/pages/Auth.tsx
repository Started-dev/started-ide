import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Loader2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Hero from '@/components/Hero';
import startedWordmark from '@/assets/started-wordmark.svg';

export default function Auth() {
  const { user, loading, signIn, signUp } = useAuth();
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

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {/* ── Top Nav ── */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <div className="flex items-center">
          <img src={startedWordmark} alt="Started" className="h-10" />
        </div>
        <div className="flex items-center gap-6">
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
            className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <Hero
        title={"Ship production software\nwith AI agents."}
        subtitle="Plan, generate, verify, and deploy real applications — inside a live AI-native development environment."
        ctaPrimaryLabel="Get Started"
        onCtaPrimary={() => { setShowAuth(true); setIsSignUp(true); }}
        ctaSecondaryLabel="View Documentation"
        ctaSecondaryHref="https://docs.started.dev"
        badgeText="Now in Public Beta"
      />

      {/* ── Auth Modal Overlay ── */}
      {showAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-sm mx-4 bg-card border border-border rounded-xl p-6 shadow-2xl animate-scale-in">
            <button
              onClick={() => { setShowAuth(false); setError(null); setSignUpSuccess(false); }}
              className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            {signUpSuccess ? (
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
