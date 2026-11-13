import { BrowserRouter, Route, Routes } from "react-router-dom";
import { GuideProvider } from "@/state";
import { AdminPage } from "@/pages/AdminPage";
import { ChatPage } from "@/pages/ChatPage";
import { HomePage } from "@/pages/HomePage";
import { JoinPage } from "@/pages/JoinPage";
import { QuizPage } from "@/pages/QuizPage";
import { Shell } from "@/pages/Shell";
import { ShowPage } from "@/pages/ShowPage";
import { StartPage } from "@/pages/StartPage";

export function App() {
  return (
    <GuideProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<StartPage />} />
          <Route path="/j/:id" element={<JoinPage />} />
          <Route path="/app" element={<Shell />}>
            <Route index element={<HomePage />} />
            <Route path="quiz" element={<QuizPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="show" element={<ShowPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<StartPage />} />
        </Routes>
      </BrowserRouter>
    </GuideProvider>
  );
}
