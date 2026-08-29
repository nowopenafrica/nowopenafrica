    import { useState } from 'react';
    import { Link, useLocation } from 'react-router-dom';
    import { Menu, X, LogOut, LogIn, User, Loader2, ChevronDown, LayoutGrid, Store, Heart, Sparkles, BadgeDollarSign, Cpu, UserPlus } from 'lucide-react';
    import { useAuth } from '../../contexts/AuthContext';
    import { useRole } from '../../hooks/useRole';
    import AuthModal from '../auth/AuthModal';
    import Logo from '../Logo';
    import ThemeToggle from '../ThemeToggle';
    import CurrencySelector from '../CurrencySelector';
import LanguageSelector from '../LanguageSelector';
import { useT } from '../../contexts/I18nContext';
import { useAudience } from '../../hooks/useAudience';
import { PRIMARY_NAV, menuFor, menuLabel, isNavItemActive } from '../../lib/navigation';
import AudienceSwitch from './AudienceSwitch';

    export default function Navigation() {
      const [isOpen, setIsOpen] = useState(false);
      const [showAuthModal, setShowAuthModal] = useState(false);
      const [isLoading, setIsLoading] = useState(false);
      const { user, signOut } = useAuth();
      const t = useT();
      const { role } = useRole();
      const isAdmin = role === 'admin';
      const location = useLocation();
      const { audience, canSwitch, setAudience } = useAudience();
      const menuItems = menuFor(audience);
      const isBusinessView = audience === 'business';

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
            <div className="site-container">
              <div className="flex items-center h-16 gap-4 xl:gap-6">
                <div className="flex items-center gap-6 xl:gap-8 shrink-0">
                  <Link to="/" className="flex items-center gap-2 font-bold text-xl shrink-0">
                    <Logo />
                  </Link>

                  {/* The primary lineup, shown to everyone. The people and
                      business surfaces live in the menu further along, so the
                      two never interleave here. */}
                  <div className="hidden lg:flex items-center gap-4 xl:gap-8">
                    {PRIMARY_NAV.map((item) => {
                      const active = isNavItemActive(item, location.pathname, location.search);
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          aria-current={active ? 'page' : undefined}
                          className={`whitespace-nowrap transition text-sm font-medium ${
                            active
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-gray-700 dark:text-gray-300 hover:text-blue-600'
                          }`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-2 xl:gap-4 shrink-0">
                  <div className="hidden lg:flex items-center gap-2 xl:gap-4">
                    {/* The people surfaces, or the business ones — one menu,
                        never a blend of both. Which it is follows the
                        Browse/Manage switch. */}
                    <div className="relative group shrink-0">
                      <button
                        type="button"
                        className="flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-gray-700 dark:text-gray-300 hover:text-blue-600 rounded-lg transition text-sm font-medium"
                        aria-haspopup="true"
                      >
                        {isBusinessView ? <Store size={15} /> : <Heart size={15} />}
                        {menuLabel(audience)}
                        <ChevronDown size={14} className="transition group-hover:rotate-180" />
                      </button>
                      <div className="absolute right-0 top-full pt-2 hidden group-hover:block group-focus-within:block">
                        <div className="w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-2">
                          {menuItems.map((item) => {
                            if (item.authOnly && !user) return null;
                            const Icon = item.icon;
                            const active = isNavItemActive(item, location.pathname, location.search);
                            return (
                              <Link
                                key={item.to}
                                to={item.to}
                                aria-current={active ? 'page' : undefined}
                                className={`flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                                  active ? 'bg-gray-50 dark:bg-gray-700/60' : ''
                                }`}
                              >
                                <Icon size={18} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                <span>
                                  <span className="block text-sm font-medium text-gray-900 dark:text-white">{item.label}</span>
                                  {item.blurb && (
                                    <span className="block text-xs text-gray-500 dark:text-gray-400">{item.blurb}</span>
                                  )}
                                </span>
                              </Link>
                            );
                          })}
                          {/* A signed-out visitor sees Nearby and Open now but
                              not Keeps, so tell them what the missing one is
                              for rather than simply hiding it. */}
                          {!user && !isBusinessView && (
                            <>
                              <div className="my-2 border-t border-gray-100 dark:border-gray-700" />
                              <Link to="/register" className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700">
                                <Heart size={18} className="text-rose-500 mt-0.5 flex-shrink-0" />
                                <span>
                                  <span className="block text-sm font-medium text-gray-900 dark:text-white">Keeps</span>
                                  <span className="block text-xs text-gray-500 dark:text-gray-400">Sign up to follow businesses</span>
                                </span>
                              </Link>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

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
                    {canSwitch && <AudienceSwitch audience={audience} onChange={setAudience} />}
                    {user ? (
                      <>
                        <Link
                          to={isBusinessView ? '/dashboard' : '/profile'}
                          className="flex items-center gap-2 whitespace-nowrap px-3 xl:px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition text-sm font-medium"
                          aria-label={isBusinessView ? t('nav.dashboard') : 'My NowOpen'}
                          title={isBusinessView ? t('nav.dashboard') : 'My NowOpen'}
                        >
                          <User size={18} />
                          <span className="hidden xl:inline">{isBusinessView ? t('nav.dashboard') : 'My NowOpen'}</span>
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
                  {/* Primary lineup, same as the desktop bar. */}
                  {PRIMARY_NAV.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={closeMenu}
                        className="flex items-center gap-2.5 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm"
                      >
                        <Icon size={16} /> {item.label}
                      </Link>
                    );
                  })}

                  {/* Then one audience menu — the people surfaces or the
                      business ones, never interleaved. */}
                  <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {menuLabel(audience)}
                  </p>
                  {menuItems.map((item) => {
                    if (item.authOnly && !user) return null;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={closeMenu}
                        className="flex items-center gap-2.5 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm"
                      >
                        <Icon size={16} /> {item.label}
                      </Link>
                    );
                  })}

                  {canSwitch && (
                    <button
                      type="button"
                      onClick={() => { setAudience(isBusinessView ? 'people' : 'business'); closeMenu(); }}
                      className="w-full text-left flex items-center gap-2.5 px-4 py-2 mt-1 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded text-sm"
                    >
                      <Store size={16} /> {isBusinessView ? 'Browse as a customer' : 'Manage my business'}
                    </button>
                  )}

                  <>
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
                  </>
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
