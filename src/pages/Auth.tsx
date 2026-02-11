import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import startedLogo from '@/assets/started-logo.png';

const FLOATING_CHARS = [
  { char: '{', top: '8%', left: '12%', size: 'text-2xl', delay: '0s' },
  { char: '}', top: '15%', left: '78%', size: 'text-3xl', delay: '0.5s' },
  { char: '=>', top: '25%', left: '5%', size: 'text-xl', delay: '1s' },
  { char: '()', top: '35%', left: '85%', size: 'text-2xl', delay: '0.3s' },
  { char: '//', top: '50%', left: '10%', size: 'text-lg', delay: '0.8s' },
  { char: '[]', top: '60%', left: '90%', size: 'text-xl', delay: '0.2s' },
  { char: '< />', top: '72%', left: '15%', size: 'text-2xl', delay: '1.2s' },
  { char: '&&', top: '80%', left: '75%', size: 'text-lg', delay: '0.6s' },
  { char: '===', top: '88%', left: '50%', size: 'text-xl', delay: '0.9s' },
  { char: '::',  top: '42%', left: '65%', size: 'text-2xl', delay: '0.4s' },
  { char: '|>',  top: '18%', left: '45%', size: 'text-lg', delay: '1.1s' },
  { char: '{}',  top: '92%', left: '25%', size: 'text-xl', delay: '0.7s' },
];

export default function Auth() {
  const { user, loading, signIn, signUp } = useAuth();
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
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* ── Left Panel ── */}
      <div className="relative w-full lg:w-1/2 flex flex-col items-center justify-center px-6 py-12 lg:py-0 overflow-hidden">
        {/* Floating code characters */}
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
          {FLOATING_CHARS.map((c, i) => (
            <span
              key={i}
              className={`absolute font-mono ${c.size} text-muted-foreground/10`}
              style={{ top: c.top, left: c.left }}
            >
              {c.char}
            </span>
          ))}
        </div>

        <div className="relative z-10 w-full max-w-sm space-y-8">
          {/* Logo */}
          <div className="flex items-center justify-center">
            <img src={startedLogo} alt="Started" className="h-16 w-16 rounded-full" />
          </div>

          {/* Headline */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Build &amp; Ship Software
            </h1>
            <p className="text-base text-muted-foreground">
              with AI — <span className="text-primary font-semibold">in minutes</span>
            </p>
          </div>

          {/* Auth card */}
          {signUpSuccess ? (
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <Mail className="h-8 w-8 text-primary mx-auto mb-3" />
              <h2 className="text-sm font-semibold text-foreground mb-2">Check your email</h2>
              <p className="text-xs text-muted-foreground mb-4">
                We sent a verification link to{' '}
                <span className="font-medium text-foreground">{email}</span>. Click it to activate
                your account.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSignUpSuccess(false);
                  setIsSignUp(false);
                }}
                className="text-xs"
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-card border border-border rounded-lg p-6 space-y-4"
            >
              <h2 className="text-sm font-semibold text-foreground text-center">
                {isSignUp ? 'Create an account' : 'Sign in to your IDE'}
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
                    className="pl-9 h-9 text-sm bg-background"
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
                    className="pl-9 h-9 text-sm bg-background"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <Button type="submit" disabled={submitting} className="w-full h-9 text-sm">
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
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setError(null);
                  }}
                  className="text-primary hover:underline font-medium"
                >
                  {isSignUp ? 'Sign in' : 'Sign up'}
                </button>
              </p>
            </form>
          )}

          {/* Footer links */}
          <p className="text-[11px] text-center text-muted-foreground/60">
            By continuing you agree to our Terms&nbsp;of&nbsp;Service and Privacy&nbsp;Policy.
          </p>
        </div>
      </div>

      {/* ── Right Panel (hidden on mobile) ── */}
      <div
        className="hidden lg:flex w-1/2 flex-col items-center justify-center p-12 relative overflow-hidden"
        style={{
          background:
            'linear-gradient(135deg, hsl(38 92% 50% / 0.15) 0%, hsl(var(--background)) 100%)',
        }}
      >
        {/* Badge */}
        <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-6">
          AI-Powered IDE
        </span>

        {/* Headline */}
        <h2 className="text-3xl font-bold tracking-tight text-foreground text-center mb-2">
          Ship Code Faster
        </h2>
        <p className="text-sm text-muted-foreground text-center max-w-xs mb-10">
          From idea to production in one conversation. Let the agent write, test, and deploy your
          code.
        </p>

        {/* Browser mockup */}
        <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
          {/* Title bar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/50">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-primary/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-ide-success/60" />
            <span className="flex-1 text-center text-[10px] text-muted-foreground font-mono truncate">
              started.dev — IDE
            </span>
          </div>
          {/* Content area — mini IDE preview */}
          <div className="p-4 space-y-2 font-mono text-[11px] leading-relaxed text-muted-foreground/80 min-h-[180px]">
            <p>
              <span className="text-primary">const</span> app ={' '}
              <span className="text-primary">createApp</span>
              <span className="text-foreground/60">()</span>;
            </p>
            <p>
              <span className="text-primary">await</span> app.
              <span className="text-primary">deploy</span>
              <span className="text-foreground/60">(</span>
              <span className="text-ide-success">'production'</span>
              <span className="text-foreground/60">)</span>;
            </p>
            <p className="text-ide-success">✓ Build succeeded — 1.2 s</p>
            <p className="text-ide-success">✓ Deployed to edge (48 regions)</p>
            <p className="mt-3 text-foreground/40">▌</p>
          </div>
        </div>
      </div>
    </div>
  );
}
