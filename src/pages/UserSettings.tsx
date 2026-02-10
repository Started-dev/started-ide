import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ProfileForm } from '@/components/settings/ProfileForm';
import { SecuritySection } from '@/components/settings/SecuritySection';
import { PreferencesTab } from '@/components/settings/PreferencesTab';
import {
  ArrowLeft, CreditCard, Settings, Loader2,
  Zap, Clock, MessageSquare, HardDrive, Check, Crown, ExternalLink, Sliders,
} from 'lucide-react';

type TabId = 'settings' | 'billing' | 'preferences';

interface BillingPlan {
  key: string;
  monthly_price_usd: number;
  included_mcp_calls: number;
  included_runner_minutes: number;
  included_tokens: number;
  max_projects: number;
  max_concurrent_runs: number;
  features: Record<string, unknown>;
}

interface UsageLedger {
  mcp_calls: number;
  runner_minutes: number;
  model_tokens: number;
  storage_mb: number;
  plan_key: string;
  period_start: string;
  period_end: string;
}

export default function UserSettings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabId>('billing');
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [usage, setUsage] = useState<UsageLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const [plansRes, usageRes] = await Promise.all([
        supabase.from('billing_plans').select('*').order('monthly_price_usd', { ascending: true }),
        supabase.from('api_usage_ledger').select('*').eq('owner_id', user.id).order('period_start', { ascending: false }).limit(1),
      ]);
      if (plansRes.data) setPlans(plansRes.data as unknown as BillingPlan[]);
      if (usageRes.data && usageRes.data.length > 0) {
        setUsage(usageRes.data[0] as unknown as UsageLedger);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  // Handle checkout success redirect
  useEffect(() => {
    const checkoutStatus = searchParams.get('checkout');
    const plan = searchParams.get('plan');
    if (checkoutStatus === 'success' && plan) {
      toast.success(`Successfully upgraded to ${plan} plan!`);
      setSearchParams({});
      if (user) {
        supabase.from('api_usage_ledger').select('*').eq('owner_id', user.id)
          .order('period_start', { ascending: false }).limit(1)
          .then(({ data }) => {
            if (data && data.length > 0) setUsage(data[0] as unknown as UsageLedger);
          });
      }
    } else if (checkoutStatus === 'cancelled') {
      toast.info('Checkout was cancelled.');
      setSearchParams({});
    }
  }, [searchParams, user, setSearchParams]);

  const handleUpgrade = async (planKey: string) => {
    setCheckoutLoading(planKey);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: { action: 'create_checkout', plan_key: planKey },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data?.error || 'Failed to create checkout session');
      }
    } catch (err: any) {
      toast.error(err.message || 'Checkout failed');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setCheckoutLoading('portal');
    try {
      const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: { action: 'create_portal' },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data?.error || 'Failed to open subscription portal');
      }
    } catch (err: any) {
      toast.error(err.message || 'Could not open portal');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const currentPlanKey = usage?.plan_key ?? 'free';
  const currentPlan = plans.find(p => p.key === currentPlanKey);

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'billing', label: 'Billing & Usage', icon: <CreditCard className="h-4 w-4" /> },
    { id: 'settings', label: 'Account', icon: <Settings className="h-4 w-4" /> },
    { id: 'preferences', label: 'Preferences', icon: <Sliders className="h-4 w-4" /> },
  ];

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-12 border-b border-border shrink-0">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to IDE
        </button>
        <div className="w-px h-5 bg-border" />
        <span className="text-sm font-semibold">Account & Billing</span>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <div className="w-56 border-r border-border p-3 space-y-1 shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm transition-colors ${
                tab === t.id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-8 max-w-4xl">
          {tab === 'settings' && <AccountTab />}
          {tab === 'billing' && (
            <BillingTab
              plans={plans}
              usage={usage}
              currentPlan={currentPlan ?? null}
              currentPlanKey={currentPlanKey}
              onUpgrade={handleUpgrade}
              onManageSubscription={handleManageSubscription}
              checkoutLoading={checkoutLoading}
            />
          )}
          {tab === 'preferences' && <PreferencesTab />}
        </div>
      </div>
    </div>
  );
}

// ─── Account Tab ───

function AccountTab() {
  return (
    <div className="space-y-10">
      <ProfileForm />
      <div className="border-t border-border" />
      <SecuritySection />
    </div>
  );
}

// ─── Billing Tab ───

function BillingTab({
  plans,
  usage,
  currentPlan,
  currentPlanKey,
  onUpgrade,
  onManageSubscription,
  checkoutLoading,
}: {
  plans: BillingPlan[];
  usage: UsageLedger | null;
  currentPlan: BillingPlan | null;
  currentPlanKey: string;
  onUpgrade: (planKey: string) => void;
  onManageSubscription: () => void;
  checkoutLoading: string | null;
}) {
  const usageMeters = currentPlan ? [
    {
      label: 'MCP Calls',
      icon: <Zap className="h-4 w-4 text-primary" />,
      used: usage?.mcp_calls ?? 0,
      limit: currentPlan.included_mcp_calls,
      unit: 'calls',
    },
    {
      label: 'Runner Minutes',
      icon: <Clock className="h-4 w-4 text-ide-info" />,
      used: Math.round(Number(usage?.runner_minutes ?? 0)),
      limit: currentPlan.included_runner_minutes,
      unit: 'min',
    },
    {
      label: 'Model Tokens',
      icon: <MessageSquare className="h-4 w-4 text-ide-success" />,
      used: Math.round(Number(usage?.model_tokens ?? 0)),
      limit: currentPlan.included_tokens,
      unit: 'tokens',
      formatUsed: (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v),
      formatLimit: (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v),
    },
    {
      label: 'Storage',
      icon: <HardDrive className="h-4 w-4 text-ide-warning" />,
      used: Math.round(Number(usage?.storage_mb ?? 0)),
      limit: 500,
      unit: 'MB',
    },
  ] : [];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-1">Billing & Usage</h2>
        <p className="text-sm text-muted-foreground">
          {usage
            ? `Current period: ${usage.period_start} → ${usage.period_end}`
            : 'No usage data yet for this billing period.'}
        </p>
      </div>

      {/* Current Plan Badge */}
      {currentPlan && (
        <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Crown className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold capitalize">{currentPlan.key} Plan</p>
              <p className="text-xs text-muted-foreground">
                {currentPlan.monthly_price_usd === 0 ? 'Free' : `$${currentPlan.monthly_price_usd}/mo`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">Active</span>
            {currentPlan.monthly_price_usd > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1.5"
                disabled={checkoutLoading === 'portal'}
                onClick={onManageSubscription}
              >
                {checkoutLoading === 'portal' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ExternalLink className="h-3 w-3" />
                )}
                Manage Subscription
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Usage Meters */}
      {usageMeters.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {usageMeters.map(m => {
            const pct = m.limit > 0 ? Math.min((m.used / m.limit) * 100, 100) : 0;
            const fmt = (v: number, formatter?: (v: number) => string) => formatter ? formatter(v) : String(v);
            const isHigh = pct > 80;
            return (
              <div key={m.label} className="p-4 rounded-lg border border-border bg-card space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {m.icon}
                    <span className="text-sm font-medium">{m.label}</span>
                  </div>
                  <span className={`text-xs font-mono ${isHigh ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {fmt(m.used, (m as any).formatUsed)} / {fmt(m.limit, (m as any).formatLimit)} {m.unit}
                  </span>
                </div>
                <Progress value={pct} className="h-2" />
              </div>
            );
          })}
        </div>
      )}

      {!usage && (
        <div className="p-6 rounded-lg border border-border bg-card text-center">
          <p className="text-sm text-muted-foreground">No usage recorded yet. Usage tracking begins when you make MCP calls or run commands.</p>
        </div>
      )}

      {/* Plans Grid */}
      <div>
        <h3 className="text-sm font-semibold mb-4">Available Plans</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map(plan => {
            const isCurrent = plan.key === currentPlanKey;
            return (
              <div
                key={plan.key}
                className={`p-4 rounded-lg border space-y-4 ${
                  isCurrent
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-muted-foreground/30 transition-colors'
                }`}
              >
                <div>
                  <p className="text-sm font-semibold capitalize">{plan.key}</p>
                  <p className="text-2xl font-bold mt-1">
                    {plan.monthly_price_usd === 0 ? 'Free' : `$${plan.monthly_price_usd}`}
                    {plan.monthly_price_usd > 0 && <span className="text-xs text-muted-foreground font-normal">/mo</span>}
                  </p>
                </div>

                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-ide-success shrink-0" />
                    {plan.included_mcp_calls.toLocaleString()} MCP calls
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-ide-success shrink-0" />
                    {plan.included_runner_minutes.toLocaleString()} runner min
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-ide-success shrink-0" />
                    {plan.included_tokens >= 1_000_000
                      ? `${(plan.included_tokens / 1_000_000).toFixed(0)}M`
                      : `${(plan.included_tokens / 1_000).toFixed(0)}K`} tokens
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-ide-success shrink-0" />
                    {plan.max_projects < 0 || plan.max_projects >= 999 ? 'Unlimited' : plan.max_projects} projects
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-ide-success shrink-0" />
                    {plan.max_concurrent_runs} concurrent runs
                  </li>
                </ul>

                {isCurrent ? (
                  <Button size="sm" variant="outline" disabled className="w-full text-xs">
                    Current Plan
                  </Button>
                ) : plan.monthly_price_usd === 0 ? null : (
                  <Button
                    size="sm"
                    className="w-full text-xs"
                    disabled={checkoutLoading === plan.key}
                    onClick={() => onUpgrade(plan.key)}
                  >
                    {checkoutLoading === plan.key ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : null}
                    {plan.monthly_price_usd > (plans.find(p => p.key === currentPlanKey)?.monthly_price_usd ?? 0)
                      ? 'Upgrade'
                      : 'Switch'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
