import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import OrbitApp from "./pages/OrbitApp";

function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster richColors position="top-right" /><OrbitApp /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

export default App;
