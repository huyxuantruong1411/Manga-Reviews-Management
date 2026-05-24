import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import MangaListPage from "./pages/MangaListPage";
import MangaDetailPage from "./pages/MangaDetailPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import TagsPage from "./pages/TagsPage";
import AuthorDetailPage from "./pages/AuthorDetailPage";
import { AlertProvider } from "./hooks/useAlert";

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AlertProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<MangaListPage />} />
            <Route path="manga/:id" element={<MangaDetailPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="tags" element={<TagsPage />} />
            <Route path="author/:name" element={<AuthorDetailPage />} />
          </Route>
        </Routes>
      </AlertProvider>
    </BrowserRouter>
  );
};

export default App;
