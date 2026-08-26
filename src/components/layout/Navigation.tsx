    import { useState } from 'react';
    import { Link } from 'react-router-dom';
    import { Menu, X, LogOut, LogIn, User, Loader2, ChevronDown, LayoutGrid, Sparkles, BadgeDollarSign, Cpu, UserPlus } from 'lucide-react';
    import { useAuth } from '../../contexts/AuthContext';
    import { useRole } from '../../hooks/useRole';
    import AuthModal from '../auth/AuthModal';
    import Logo from '../Logo';
    import ThemeToggle from '../ThemeToggle';
    import CurrencySelector from '../CurrencySelector';
import LanguageSelector from '../LanguageSelector';
import { useT } from '../../contexts/I18nContext';

    export default function Navigation() {
      const [isOpen, setIsOpen] = useState(false);
      const [showAuthModal, setShowAuthModal] = useState(false);
      const [isLoading, setIsLoading] = useState(false);
      const { user, signOut } = useAuth();
      const t = useT();
      const { role } = useRole();
      const isAdmin = role === 'admin';

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
              <div className="flex items-center h-16 gap-4 xl:gap-6">
                <div className="flex items-center gap-6 xl:gap-8 shrink-0">
                  <Link to="/" className="flex items-center gap-2 font-bold text-xl shrink-0">
                    <Logo />
                  </Link>

                  <div className="hidden lg:flex items-center gap-4 xl:gap-8">
                    <Link to="/" className="whitespace-nowrap text-gray-700 dark:text-gray-300 hover:text-blue-600 transition text-sm font-medium">
                      {t('nav.home')}
                    </Link>
                    <Link to="/businesses" className="whitespace-nowrap text-gray-700 dark:text-gray-300 hover:text-blue-600 transition text-sm font-medium">
                      {t('nav.discover')}
                    </Link>
                    <Link to="/adverts" className="whitespace-nowrap text-gray-700 dark:text-gray-300 hover:text-blue-600 transition text-sm font-medium">
                      {t('nav.promote')}
                    </Link>
                    <Link to="/media" className="whitespace-nowrap text-gray-700 dark:text-gray-300 hover:text-blue-600 transition text-sm font-medium">
                      {t('nav.create')}
                    </Link>
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-2 xl:gap-4 shrink-0">
                  <div className="hidden lg:flex items-center gap-2 xl:gap-4">
                    {/* The "Africa is NowOpen" CTA doubles as a dropdown grouping
                        the platform vision + waitlist (replaces the old flat
                        "Platform" nav link). */}
                    <div className="relative group shrink-0">
                      <Link
                        to="/waitlist"
                        className="flex items-center gap-1.5 whitespace-nowrap px-3 xl:px-4 py-2 bg-black text-white hover:bg-gray-800 rounded-lg transition text-sm font-medium"
                      >
                        {t('nav.africaNowOpen')}
                        <ChevronDown size={14} className="transition group-hover:rotate-180" />
                      </Link>
                      <div className="absolute right-0 top-full pt-2 hidden group-hover:block group-focus-within:block">
                        <div className="w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-2">
                          <Link to="/platform" className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <LayoutGrid size={18} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                            <span>
                              <span className="block text-sm font-medium text-gray-900 dark:text-white">{t('nav.platform')}</span>
                              <span className="block text-xs text-gray-500 dark:text-gray-400">{t('nav.platform.desc')}</span>
                            </span>
                          </Link>
                          <Link to="/os" className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <Cpu size={18} className="text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                            <span>
                              <span className="block text-sm font-medium text-gray-900 dark:text-white">{t('nav.os')}</span>
                              <span className="block text-xs text-gray-500 dark:text-gray-400">{t('nav.os.desc')}</span>
                            </span>
                          </Link>
                          <Link to="/forms" className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <UserPlus size={18} className="text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                            <span>
                              <span className="block text-sm font-medium text-gray-900 dark:text-white">{t('nav.join')}</span>
                              <span className="block text-xs text-gray-500 dark:text-gray-400">{t('nav.join.desc')}</span>
                            </span>
                          </Link>
                          <Link to="/waitlist" className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <Sparkles size={18} className="text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                            <span>
                              <span className="block text-sm font-medium text-gray-900 dark:text-white">{t('nav.africaNowOpen')}</span>
                              <span className="block text-xs text-gray-500 dark:text-gray-400">{t('nav.vision.desc')}</span>
                            </span>
                          </Link>
                          <div className="my-2 border-t border-gray-100 dark:border-gray-700" />
                          <Link to="/pricing" className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <BadgeDollarSign size={18} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                            <span>
                              <span className="block text-sm font-medium text-gray-900 dark:text-white">{t('nav.pricing')}</span>
                              <span className="block text-xs text-gray-500 dark:text-gray-400">{t('nav.pricing.desc')}</span>
                            </span>
                          </Link>
                        </div>
                      </div>
                    </div>
                    {user ? (
                      <>
                        <Link
                          to="/dashboard"
                          className="flex items-center gap-2 whitespace-nowrap px-3 xl:px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition text-sm font-medium"
                          aria-label={t('nav.dashboard')}
                          title={t('nav.dashboard')}
                        >
                          <User size={18} />
                          <span className="hidden xl:inline">{t('nav.dashboard')}</span>
                        </Link>
                        {isAdmin && (
                          <Link
                            to="/admin-creator"
                            className="flex items-center gap-2 whitespace-nowrap px-3 xl:px-4 py-2 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition text-sm font-medium"
                            aria-label={t('nav.adminCreator')}
                            title={t('nav.adminCreator')}
                          >
                            <Sparkles size={18} />
                            <span className="hidden xl:inline">{t('nav.adminCreator')}</span>
                          </Link>
                        )}
                        <button
                          onClick={handleSignOut}
                          className="flex items-center gap-2 whitespace-nowrap px-3 xl:px-4 py-2 bg-red-500 text-white hover:bg-red-600 rounded-lg transition text-sm font-medium"
                          disabled={isLoading}
                          aria-label={t('nav.signOut')}
                          title={t('nav.signOut')}
                        >
                          {isLoading ? (
                            <Loader2 size={18} className="animate-spin" />
                          ) : (
                            <LogOut size={18} />
                          )}
                          <span className="hidden xl:inline">{t('nav.signOut')}</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setShowAuthModal(true)}
                        className="flex items-center gap-2 whitespace-nowrap px-4 py-2 bg-black text-white hover:bg-gray-800 rounded-lg transition text-sm font-medium"
                      >
                        <LogIn size={18} />
                        {t('nav.signIn')}
                      </button>
                    )}
                  </div>

                  <div className="hidden lg:block h-6 w-px bg-gray-200 dark:bg-gray-700" aria-hidden="true" />

                  <div className="flex items-center gap-1">
                    <LanguageSelector className="hidden sm:inline-flex" />
                    <CurrencySelector className="hidden sm:inline-flex" />
                    <ThemeToggle />
                    <button
                      onClick={() => setIsOpen(!isOpen)}
                      className="lg:hidden p-1.5"
                      aria-label={isOpen ? t('nav.closeMenu') : t('nav.openMenu')}
                      aria-expanded={isOpen}
                      aria-controls="mobile-menu"
                    >
                      {isOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </div>

              {isOpen && (
                <div id="mobile-menu" className="lg:hidden pb-4 space-y-2">
                  <div className="px-4 py-2 sm:hidden flex items-center gap-4">
                    <LanguageSelector />
                    <CurrencySelector />
                  </div>
                  <Link to="/" onClick={closeMenu} className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm">
                    {t('nav.home')}
                  </Link>
                  <Link to="/businesses" onClick={closeMenu} className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm">
                    {t('nav.discover')}
                  </Link>
                  <Link to="/adverts" onClick={closeMenu} className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm">
                    {t('nav.promote')}
                  </Link>
                  <Link to="/media" onClick={closeMenu} className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm">
                    {t('nav.create')}
                  </Link>
                  <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{t('nav.africaNowOpen')}</p>
                  <Link to="/platform" onClick={closeMenu} className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm">
                    {t('nav.platform')}
                  </Link>
                  <Link to="/os" onClick={closeMenu} className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm">
                    {t('nav.os')}
                  </Link>
                  <Link to="/forms" onClick={closeMenu} className="block px-4 py-2 text-purple-600 dark:text-purple-400 font-medium hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded text-sm">
                    {t('nav.joinMobile')}
                  </Link>
                  <Link to="/waitlist" onClick={closeMenu} className="block px-4 py-2 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded text-sm">
                    {t('nav.waitlistMobile')}
                  </Link>
                  <Link to="/pricing" onClick={closeMenu} className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm">
                    {t('nav.pricing')}
                  </Link>
                  {user ? (
                    <>
                      <Link to="/dashboard" onClick={closeMenu} className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm">
                        {t('nav.dashboard')}
                      </Link>
                      {isAdmin && (
                        <Link to="/admin-creator" onClick={closeMenu} className="block px-4 py-2 text-purple-600 dark:text-purple-400 font-medium hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded text-sm">
                          {t('nav.adminCreator')}
                        </Link>
                      )}
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-sm"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          t('nav.signOut')
                        )}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setShowAuthModal(true); closeMenu(); }}
                      className="w-full text-left px-4 py-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded text-sm">
                      {t('nav.signIn')}
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
