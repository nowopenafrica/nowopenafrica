import { Link } from 'react-router-dom';
import { Compass, Home, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-900/30">
          <Compass className="h-8 w-8 text-blue-600 dark:text-blue-400" />
        </div>
        <p className="text-5xl font-extrabold text-gray-900 dark:text-white">404</p>
        <h1 className="mt-2 text-xl font-bold text-gray-900 dark:text-white">This page isn't open</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          The page you're looking for doesn't exist or may have moved. Let's get you back on track.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to="/" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition">
            <Home size={16} /> Go home
          </Link>
          <Link to="/businesses" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition">
            <Search size={16} /> Browse businesses
          </Link>
        </div>
      </div>
    </div>
  );
}
