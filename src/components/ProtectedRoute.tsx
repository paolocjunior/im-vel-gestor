import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfileComplete } from "@/hooks/useProfileComplete";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { complete, loading: profileLoading } = useProfileComplete();
  const location = useLocation();

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Allow access to profile completion page without redirect loop
  if (location.pathname === "/profile/complete") return <>{children}</>;

  if (complete === false) {
    return <Navigate to="/profile/complete" replace />;
  }

  return <>{children}</>;
}
