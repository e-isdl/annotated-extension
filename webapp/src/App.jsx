import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import AppSidebar from './components/AppSidebar';
import RightRail from './components/RightRail';
import Feed from './pages/Feed';
import ClipPage from './pages/ClipPage';
import Profile from './pages/Profile';
import AuthCallback from './pages/AuthCallback';
import Leaderboard from './pages/Leaderboard';
import SearchPage from './pages/SearchPage';
import ExplorePage from './pages/ExplorePage';
import CreatePage from './pages/CreatePage';
import SavedPage from './pages/SavedPage';
import CommunityPage from './pages/CommunityPage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-bg-base text-text-primary font-ui">
        <Navbar />
        <AppShell />
      </div>
    </BrowserRouter>
  );
}

function AppShell() {
  const location = useLocation();
  const isFeedSurface = location.pathname === '/' || location.pathname.startsWith('/c/');

  return (
    <div className={`app-shell ${isFeedSurface ? '' : 'app-shell-focused'}`}>
      <AppSidebar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Feed />} />
          <Route path="/clip/:id" element={<ClipPage />} />
          <Route path="/u/:handle" element={<Profile />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/c/:slug" element={<CommunityPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {isFeedSurface && <RightRail />}
    </div>
  );
}

function NotFound() {
  return (
    <div className="empty-state">
      <span className="text-4xl">✎</span>
      <h1 className="text-2xl font-semibold text-text-primary">This page wandered off.</h1>
      <p className="text-sm text-text-secondary">The conversation you are looking for is not here.</p>
    </div>
  );
}
