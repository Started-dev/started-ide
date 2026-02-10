import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { IDEProvider } from '@/contexts/IDEContext';
import { IDELayout } from '@/components/ide/IDELayout';
import OnboardingFlow from '@/components/OnboardingFlow';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Force remount of IDEProvider after onboarding creates a project
  const [ideKey, setIdeKey] = useState(0);

  useEffect(() => {
    if (!user) { setChecking(false); return; }
    // Check if user has any projects — if not, show onboarding
    (async () => {
      try {
        const { count } = await supabase
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', user.id);
        setShowOnboarding(count === 0);
      } catch {
        // fallback: show IDE
      } finally {
        setChecking(false);
      }
    })();
  }, [user]);

  if (checking) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <OnboardingFlow
        onComplete={async ({ projectName, templateFiles, goal }) => {
          if (!user) return;

          // Create the project
          const { data: proj, error } = await supabase
            .from('projects')
            .insert({ owner_id: user.id, name: projectName })
            .select('id')
            .single();

          if (error || !proj) {
            console.error('Failed to create onboarding project:', error);
            setShowOnboarding(false);
            return;
          }

          // Seed template files + always include STARTED.md
          const { STARTED_MD_CONTENT } = await import('@/contexts/IDEContext');
          const allFiles = [
            { path: '/STARTED.md', content: STARTED_MD_CONTENT },
            ...templateFiles.filter(f => f.path !== '/STARTED.md'),
          ];
          const rows = allFiles.map(f => ({
            project_id: proj.id,
            path: f.path,
            content: f.content,
            updated_at: new Date().toISOString(),
          }));
          await supabase.from('project_files').upsert(rows, { onConflict: 'project_id,path' });

          // Store goal for the IDE to pick up after mount
          if (goal) {
            sessionStorage.setItem('started_onboarding_goal', goal);
          }

          setShowOnboarding(false);
          setIdeKey(prev => prev + 1);
        }}
      />
    );
  }

  return (
    <IDEProvider key={ideKey}>
      <IDELayout />
    </IDEProvider>
  );
};

export default Index;
