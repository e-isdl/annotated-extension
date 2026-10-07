import { useEffect, useLayoutEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import ThemeFlyer from './components/ThemeFlyer';
import AppSidebar from './components/AppSidebar';
import RightRail from './components/RightRail';
import Feed from './pages/Feed';
import ForYouPage from './pages/ForYouPage';
import FollowingPage from './pages/FollowingPage';
import TrendingTopicsPage from './pages/TrendingTopicsPage';
import TrendingAnnotatorsPage from './pages/TrendingAnnotatorsPage';
import ClipPage from './pages/ClipPage';
import Profile from './pages/Profile';
import AuthCallback from './pages/AuthCallback';
import Leaderboard from './pages/Leaderboard';
import SearchPage from './pages/SearchPage';
import ExplorePage from './pages/ExplorePage';
import CreatePage from './pages/CreatePage';
import SavedPage from './pages/SavedPage';
import DraftsPage from './pages/DraftsPage';
import DraftEditPage from './pages/DraftEditPage';
import CommunityPage from './pages/CommunityPage';
import NotificationsPage from './pages/NotificationsPage';
import ClaimPage from './pages/ClaimPage';
import SourcePage from './pages/SourcePage';
import MobileNav from './components/MobileNav';
import { supabase } from './lib/supabase';
import { ToastProvider } from './components/ToastProvider';

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ToastProvider>
        <div className="app-root min-h-screen bg-bg-base text-text-primary font-ui">
          <Navbar />
          <AppShell />
          <MobileNav />
          <ThemeFlyer />
        </div>
      </ToastProvider>
    </BrowserRouter>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function AppShell() {
  const location = useLocation();
  const isFeedSurface = location.pathname === '/' || location.pathname === '/for-you' || location.pathname === '/popular' || location.pathname === '/latest' || location.pathname.startsWith('/c/');
  const isRailPage = location.pathname === '/explore' || location.pathname === '/saved' || location.pathname.startsWith('/u/');
  const hasRightRail = isFeedSurface || isRailPage || location.pathname.startsWith('/post/') || location.pathname.startsWith('/clip/') || location.pathname.startsWith('/@');

  return (
    <div className={`app-shell ${hasRightRail ? '' : 'app-shell-focused'}`}>
      <AppSidebar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Feed />} />
          <Route path="/for-you" element={<ForYouPage />} />
          <Route path="/following" element={<FollowingPage />} />
          <Route path="/trending-topics" element={<TrendingTopicsPage />} />
          <Route path="/trending-annotators" element={<TrendingAnnotatorsPage />} />
          <Route path="/popular" element={<Feed sortOverride="top" />} />
          <Route path="/latest" element={<Feed sortOverride="new" />} />
          <Route path="/clip/:id" element={<ClipPage />} />
          <Route path="/:username/post/:slug/comment/:commentId" element={<ClipPage />} />
          <Route path="/:username/post/:slug" element={<ClipPage />} />
          <Route path="/post/:id/comment/:commentId" element={<ClipPage />} />
          <Route path="/post/:id" element={<ClipPage />} />
          <Route path="/c/:community/:post" element={<ClipPage />} />
          <Route path="/u/:handle" element={<Profile />} />
          <Route path="/u" element={<ProfileEntry />} />
          <Route path="/u/:handle/annotations" element={<Profile />} />
          <Route path="/u/:handle/comments" element={<Profile />} />
          <Route path="/u/:handle/connections" element={<Profile />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/drafts" element={<DraftsPage />} />
          <Route path="/drafts/:id" element={<DraftEditPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/claims/:id" element={<ClaimPage />} />
          <Route path="/source/:domain" element={<SourcePage />} />
          <Route path="/c" element={<ExplorePage />} />
          <Route path="/c/:slug" element={<CommunityPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {hasRightRail && <RightRail />}
    </div>
  );
}

function ProfileEntry() {
  const [target, setTarget] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const handle = user?.user_metadata?.user_name || user?.email?.split('@')[0] || user?.id;
      setTarget(handle || false);
    });
  }, []);
  if (target) return <Navigate to={`/u/${target}`} replace />;
  if (target === false) return <div className="empty-state"><h1 className="text-xl font-semibold">Sign in to open your profile.</h1><p className="text-sm text-text-secondary">Use the sign-in button in the top bar, then return here.</p></div>;
  return <div className="empty-state"><p className="text-sm text-text-muted">Loading profile…</p></div>;
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
