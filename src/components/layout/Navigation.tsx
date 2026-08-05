import { useState } from 'react';
    import { Link } from 'react-router-dom';
    import { Menu, X, LogOut, LogIn, User, Loader2, ChevronDown, LayoutGrid, Sparkles } from 'lucide-react';
    import { useAuth } from '../../contexts/AuthContext';
    import AuthModal from '../auth/AuthModal';
    import Logo from '../Logo';
    import ThemeToggle from '../ThemeToggle';
    import CurrencySelector from '../CurrencySelector';

    export default function Navigation() {
      const [isOpen, setIsOpen] = useState(false);
      const [showAuthModal, setShowAuthModal] = useState(false);
      const [isLoading, setIsLoading] = useState(false);
      const { user, signOut } = useAuth();

      const handleSignOut = async () => {
        setIsLoading(true);
        try {
          await signOut();
        } catch (err) {
          console.error('Sign out failed:', err);
        } finally {
          setIsLoading(false);
          setIsOpen(false);
        }
      };

      const closeMenu = () => setIsOpen(false);

      return (
        <>
          <nav className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                <Link to="/" className="flex items-center gap-2 font-bold text-xl">
                  <Logo />
                </Link>

                <div className="hidden md:flex items-center gap-8">
                  <Link to="/" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 transition text-sm font-medium">
                    Home
                  </Link>
                  <Link to="/businesses" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 transition text-sm font-medium">
                    Discover
                  </Link>
                  <Link to="/adverts" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 transition text-sm font-medium">
                    Promote
                  </Link>
                  <Link to="/media" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 transition text-sm font-medium">
                    Create
                  </Link>
                  <Link to="/pricing" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 transition text-sm font-medium">
                    Pricing
                  </Link>
                </div>

                <div className="hidden md:flex items-center gap-4">
                  {/* The "Africa is NowOpen" CTA doubles as a dropdown grouping
                      the platform vision + waitlist (replaces the old flat
                      "Platform" nav link). */}
                  <div className="relative group">
                    <Link
                      to="/waitlist"
                      className="flex items-center gap-1.5 px-4 py-2 bg-black text-white hover:bg-gray-800 rounded-lg transition text-sm font-medium"
                    >
                      Africa is NowOpen
                      <ChevronDown size={14} className="transition group-hover:rotate-180" />
                    </Link>
                    <div className="absolute right-0 top-full pt-2 hidden group-hover:block group-focus-within:block">
                      <div className="w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-2">
                        <Link to="/platform" className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <LayoutGrid size={18} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                          <span>
                            <span className="block text-sm font-medium text-gray-900 dark:text-white">The NowOpen Platform</span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400">Industry operating systems</span>
                          </span>
                        </Link>
                        <Link to="/waitlist" className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <Sparkles size={18} className="text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                          <span>
                            <span className="block text-sm font-medium text-gray-900 dark:text-white">Africa is NowOpen</span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400">The vision & waitlist</span>
                          </span>
                        </Link>
                      </div>
                    </div>
                  </div>
                  {user ? (
                    <>
                      <Link
                        to="/dashboard"
                        className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition text-sm font-medium"
                      >
                        <User size={18} />
                        Dashboard
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white hover:bg-red-600 rounded-lg transition text-sm font-medium"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <LogOut size={18} />
                        )}
                        Sign Out
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setShowAuthModal(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-black text-white hover:bg-gray-800 rounded-lg transition text-sm font-medium"
                    >
                      <LogIn size={18} />
                      Sign In
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <CurrencySelector className="hidden sm:inline-flex" />
                  <ThemeToggle />
                  <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="md:hidden p-1.5"
                  >
                    {isOpen ? <X size={24} /> : <Menu size={24} />}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="md:hidden pb-4 space-y-2">
                  <div className="px-4 py-2 sm:hidden">
                    <CurrencySelector />
                  </div>
                  <Link to="/" onClick={closeMenu} className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm">
                    Home
                  </Link>
                  <Link to="/businesses" onClick={closeMenu} className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm">
                    Discover
                  </Link>
                  <Link to="/adverts" onClick={closeMenu} className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm">
                    Promote
                  </Link>
                  <Link to="/media" onClick={closeMenu} className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm">
                    Create
                  </Link>
                  <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Africa is NowOpen</p>
                  <Link to="/platform" onClick={closeMenu} className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm">
                    The NowOpen Platform
                  </Link>
                  <Link to="/waitlist" onClick={closeMenu} className="block px-4 py-2 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded text-sm">
                    Africa is NowOpen — Join the waitlist
                  </Link>
                  <Link to="/pricing" onClick={closeMenu} className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm">
                    Pricing
                  </Link>
                  {user ? (
                    <>
                      <Link to="/dashboard" onClick={closeMenu} className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm">
                        Dashboard
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-sm"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          'Sign Out'
                        )}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setShowAuthModal(true); closeMenu(); }}
                      className="w-full text-left px-4 py-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded text-sm">
                      Sign In
                    </button>
                  )}
                </div>
              )}
            </div>
          </nav>

          {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
        </>
      );
    }
