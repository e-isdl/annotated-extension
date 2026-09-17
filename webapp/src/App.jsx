import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Feed from './pages/Feed';
import ClipPage from './pages/ClipPage';
import Profile from './pages/Profile';
import AuthCallback from './pages/AuthCallback';
import Leaderboard from './pages/Leaderboard';
import SearchPage from './pages/SearchPage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-bg-base text-text-primary font-ui">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<Feed />} />
            <Route path="/clip/:id" element={<ClipPage />} />
            <Route path="/u/:handle" element={<Profile />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/search" element={<SearchPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
