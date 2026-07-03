import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import HomePage from "./routes/HomePage";
import NewPuzzlePage from "./routes/NewPuzzlePage";
import PlayPage from "./routes/PlayPage";
import RoomPage from "./routes/RoomPage";
import JoinPage from "./routes/JoinPage";
import { Background } from "./components/Background";
import { useSettings } from "./stores/settingsStore";

export default function App() {
  const theme = useSettings((s) => s.theme);
  const location = useLocation();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#1a0f2e" : "#f6f1ff");
  }, [theme]);

  return (
    <div className="relative min-h-full">
      <Background />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<HomePage />} />
          <Route path="/new" element={<NewPuzzlePage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/room/:code" element={<RoomPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </AnimatePresence>
    </div>
  );
}
