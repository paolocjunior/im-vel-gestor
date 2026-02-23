import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import PasswordResetPage from "./pages/PasswordResetPage";
import HubPage from "./pages/HubPage";
import StudyDashboard from "./pages/StudyDashboard";
import EditStudyPage from "./pages/EditStudyPage";
import StepAPage from "./pages/StepAPage";
import StepBPage from "./pages/StepBPage";
import StepCPage from "./pages/StepCPage";
import StepDPage from "./pages/StepDPage";
import StepEPage from "./pages/StepEPage";
import VendorsPage from "./pages/VendorsPage";
import ProvidersPage from "./pages/ProvidersPage";
import ProviderFormPage from "./pages/ProviderFormPage";
import ProviderDetailPage from "./pages/ProviderDetailPage";
import SettingsPage from "./pages/SettingsPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import BillsPage from "./pages/BillsPage";
import BillFormPage from "./pages/BillFormPage";
import ConstructionPage from "./pages/ConstructionPage";
import QuotationRequestPage from "./pages/QuotationRequestPage";
import ProfileCompletionPage from "./pages/ProfileCompletionPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const P = ({ children }: { children: React.ReactNode }) => <ProtectedRoute>{children}</ProtectedRoute>;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/hub" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/password-reset" element={<PasswordResetPage />} />
            <Route path="/profile/complete" element={<P><ProfileCompletionPage /></P>} />
            <Route path="/hub" element={<P><HubPage /></P>} />
            <Route path="/settings" element={<P><SettingsPage /></P>} />
            <Route path="/settings/change-password" element={<P><ChangePasswordPage /></P>} />
            <Route path="/studies/:id/dashboard" element={<P><StudyDashboard /></P>} />
            <Route path="/studies/:id/edit" element={<P><EditStudyPage /></P>} />
            <Route path="/studies/:id/steps/a" element={<P><StepAPage /></P>} />
            <Route path="/studies/:id/steps/b" element={<P><StepBPage /></P>} />
            <Route path="/studies/:id/steps/c" element={<P><StepCPage /></P>} />
            <Route path="/studies/:id/steps/d" element={<P><StepDPage /></P>} />
            <Route path="/studies/:id/steps/e" element={<P><StepEPage /></P>} />
            <Route path="/studies/:id/vendors" element={<P><VendorsPage /></P>} />
            <Route path="/studies/:id/bills" element={<P><BillsPage /></P>} />
            <Route path="/studies/:id/bills/new" element={<P><BillFormPage /></P>} />
            <Route path="/studies/:id/bills/:billId" element={<P><BillFormPage /></P>} />
            <Route path="/studies/:id/providers" element={<P><ProvidersPage /></P>} />
            <Route path="/studies/:id/providers/new" element={<P><ProviderFormPage /></P>} />
            <Route path="/studies/:id/providers/:providerId/edit" element={<P><ProviderFormPage /></P>} />
            <Route path="/studies/:id/providers/:providerId/view" element={<P><ProviderDetailPage /></P>} />
            <Route path="/studies/:id/construction" element={<P><ConstructionPage /></P>} />
            <Route path="/studies/:id/quotation-request" element={<P><QuotationRequestPage /></P>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
