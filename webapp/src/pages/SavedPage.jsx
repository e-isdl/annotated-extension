import { Link } from 'react-router-dom';

export default function SavedPage() {
  return (
    <div className="empty-state saved-empty">
      <span className="text-4xl text-accent">☆</span>
      <p className="eyebrow">YOUR READING LIST</p>
      <h1 className="text-2xl font-semibold text-text-primary">Save the arguments you want to return to.</h1>
      <p className="text-sm text-text-secondary max-w-sm">Saved threads will live here. For now, explore the editorial feed and keep an eye out for something worth revisiting.</p>
      <Link to="/" className="btn-primary">Browse Home</Link>
    </div>
  );
}
