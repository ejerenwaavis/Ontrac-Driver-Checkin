import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-soft p-4">
      <div className="text-center animate-slide-up">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 rounded-2xl mb-5">
          <ShieldCheck className="w-9 h-9 text-brand-600" />
        </div>
        <h1 className="text-5xl font-extrabold text-gray-900 mb-2">404</h1>
        <p className="text-gray-500 mb-6">Page not found</p>
        <Link to="/" className="btn-primary">Go to Scanner</Link>
      </div>
    </div>
  );
}
