import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexProvider } from "convex/react";
import { MotionConfig } from "framer-motion";
import "./index.css";
import App from "./App";
import { convexClient } from "./lib/convexClient";
import { useSettings } from "./stores/settingsStore";

function Root() {
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const app = (
    <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MotionConfig>
  );
  return convexClient ? <ConvexProvider client={convexClient}>{app}</ConvexProvider> : app;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
