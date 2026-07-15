import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/layout/Navigation';
import Footer from './components/layout/Footer';
import Home from './pages/Home';
import Businesses from './pages/Businesses';
import BusinessDetail from './pages/BusinessDetail';
import Adverts from './pages/Adverts';
import AdvertDetail from './pages/AdvertDetail';
import Media from './pages/Media';
import MediaDetail from './pages/MediaDetail';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import DigitalForms from './pages/DigitalForms';
import Pricing from './pages/Pricing';
import Waitlist from './pages/Waitlist';
import ProtectedRoute from './components/ProtectedRoute';
import ChatBot from './components/ChatBot';
import './index.css';

function App() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/businesses" element={<Businesses />} />
          <Route path="/businesses/:id" element={<BusinessDetail />} />
          {/* Friendly profile URLs at the root, e.g. /kalahari-films.
              Static routes above always win over this dynamic segment.
              /business/:username is kept for backwards compatibility. */}
          <Route path="/business/:username" element={<BusinessDetail />} />
          <Route path="/:username" element={<BusinessDetail />} />
          <Route path="/adverts" element={<Adverts />} />
          <Route path="/adverts/:id" element={<AdvertDetail />} />
          <Route path="/media" element={<Media />} />
          <Route path="/media/:id" element={<MediaDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/digital-forms" element={<DigitalForms />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/waitlist" element={<Waitlist />} />
          <Route path="/profile" element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          {/* AdminDashboard does its own gating (role check + access-denied
              screen), which also enables the dev-only ?preview mode */}
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </main>
      <Footer />
      <ChatBot />
      <Toaster position="top-right" />
    </div>
  );
}

export default App;
