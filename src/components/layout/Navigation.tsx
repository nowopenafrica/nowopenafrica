import { useState } from 'react';
    import { Link } from 'react-router-dom';
    import { Menu, X, LogOut, LogIn, User, Loader2 } from 'lucide-react';
    import { useAuth } from '../../contexts/AuthContext';
    import AuthModal from '../auth/AuthModal';
    import Logo from '../Logo';

    export default function Navigation() {
      const [isOpen, setIsOpen] = useState(false);
      const [showAuthModal, setShowAuthModal] = useState(false);
      const [isLoading, setIsLoading] = useState(false);
      const { user, signOut } = useAuth();

      const handleSignOut = async () => {
        setIsLoading(true);
        await signOut();
        setIsLoading(false);
      };

      return (
        <>
          <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                <Link to="/" className="flex items-center gap-2 font-bold text-xl">
                  <Logo />
                </Link>

                <div className="hidden md:flex items-center gap-8">
                  <Link to="/" className="text-gray-700 hover:text-blue-600 transition text-sm font-medium">
                    Home
                  </Link>
                  <Link to="/businesses" className="text-gray-700 hover:text-blue-600 transition text-sm font-medium">
                    Discover
                  </Link>
                  <Link to="/adverts" className="text-gray-700 hover:text-blue-600 transition text-sm font-medium">
                    Promote
                  </Link>
                  <Link to="/media" className="text-gray-700 hover:text-blue-600 transition text-sm font-medium">
                    Create
                  </Link>
                  <Link to="/pricing" className="text-gray-700 hover:text-blue-600 transition text-sm font-medium">
                    Pricing
                  </Link>
                </div>

                <div className="hidden md:flex items-center gap-4">
                  <Link
                    to="/waitlist"
                    className="px-4 py-2 border border-blue-600 text-blue-600 hover:bg-blue-50 rounded-lg transition text-sm font-medium"
                  >
                    Join Waitlist
                  </Link>
                  {user ? (
                    <>
                      <Link
                        to="/dashboard"
                        className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition text-sm font-medium"
                      >
                        <User size={18} />
                        Dashboard
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500 text-red-600 hover:bg-red-100 rounded-lg transition text-sm font-medium"
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
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition text-sm font-medium"
                    >
                      <LogIn size={18} />
                      Sign In
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setIsOpen(!isOpen)}
                  className="md:hidden"
                >
                  {isOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
              </div>

              {isOpen && (
                <div className="md:hidden pb-4 space-y-2">
                  <Link to="/" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded text-sm">
                    Home
                  </Link>
                  <Link to="/businesses" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded text-sm">
                    Discover
                  </Link>
                  <Link to="/adverts" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded text-sm">
                    Promote
                  </Link>
                  <Link to="/media" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded text-sm">
                    Create
                  </Link>
                  <Link to="/pricing" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded text-sm">
                    Pricing
                  </Link>
                  <Link to="/waitlist" className="block px-4 py-2 text-blue-600 font-medium hover:bg-blue-50 rounded text-sm">
                    Join Waitlist
                  </Link>
                  {user ? (
                    <>
                      <Link to="/dashboard" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded text-sm">
                        Dashboard
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 rounded text-sm"
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
                      onClick={() => setShowAuthModal(true)}
                      className="w-full text-left px-4 py-2 text-blue-600 hover:bg-blue-50 rounded text-sm">
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
