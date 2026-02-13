// @ts-nocheck
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { PrivyProvider } from "@/components/PrivyProvider";
import { AuthProvider, useAuth } from "@/contexts/PrivyAuthContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import UserSettings from "./pages/UserSettings";
import Docs from "./pages/Docs";
import NotFound from "./pages/NotFound";
import GitHubCallback from "./pages/GitHubCallback";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, ready, authenticated } = useAuth();
  if (!ready || loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!authenticated || !user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <QueryClientProvider client={queryClient}>
      <PrivyProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/github/callback" element={<GitHubCallback />} />
                <Route path="/docs" element={<Docs />} />
                <Route path="/docs/:section" element={<Docs />} />
                <Route path="/docs/:section/:subsection" element={<Docs />} />
                <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><UserSettings /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </PrivyProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
