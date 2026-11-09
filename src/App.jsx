import React, { useState, useEffect } from 'react';
import Home from './pages/Home.jsx';
import About from './pages/About.jsx';
import Services from './pages/Services.jsx';
import Contact from './pages/Contact.jsx';
import News from './pages/News.jsx';
import Login from './pages/Login.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';

function App() {
  const [resetToken, setResetToken] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('token') || '';
    }
    return '';
  });

  const [currentPage, setCurrentPage] = useState(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path.startsWith('/news')) {
        return 'news';
      }
      if (path === '/reset-password') {
        return 'reset-password';
      }
      if (path === '/admin' || path.startsWith('/admin')) {
        return 'admin';
      }

      const params = new URLSearchParams(window.location.search);
      const route = params.get('route');
      if (route === 'reset-password') {
        return 'reset-password';
      }
      if (route) {
        // Optionally clean up the URL
        window.history.replaceState({}, document.title, window.location.pathname);
        return route;
      }
    }
    return 'home';
  });

  const [newsSlug, setNewsSlug] = useState(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path.startsWith('/news/')) {
        return path.split('/news/')[1].split('/')[0];
      }
    }
    return null;
  });

  const navigateTo = (page, targetId, slug = null, token = null) => {
    if (token) {
      setResetToken(token);
    }

    if (page === 'news') {
      const newPath = slug ? `/news/${slug}` : '/news';
      window.history.pushState({}, '', newPath);
      setNewsSlug(slug);
    } else if (page === 'home') {
      window.history.pushState({}, '', '/');
    } else if (page === 'reset-password') {
      const tokenParam = token || resetToken ? `&token=${encodeURIComponent(token || resetToken)}` : '';
      window.history.pushState({}, '', `/?route=reset-password${tokenParam}`);
    } else {
      window.history.pushState({}, '', `/?route=${page}`);
    }

    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (targetId) {
      setTimeout(() => {
        const element = document.getElementById(targetId);
        if (element) {
          const navHeight = 80;
          const elementPosition = element.getBoundingClientRect().top + window.scrollY;
          window.scrollTo({
            top: elementPosition - navHeight,
            behavior: 'smooth'
          });
        }
      }, 150);
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);

  if (currentPage === 'about') {
    return <About navigateTo={navigateTo} />;
  }

  if (currentPage === 'services') {
    return <Services navigateTo={navigateTo} />;
  }

  if (currentPage === 'contact') {
    return <Contact navigateTo={navigateTo} />;
  }

  if (currentPage === 'news') {
    return <News navigateTo={navigateTo} slug={newsSlug} />;
  }

  if (currentPage === 'login') {
    return <Login navigateTo={navigateTo} />;
  }

  if (currentPage === 'reset-password') {
    return <ResetPassword token={resetToken} navigateTo={navigateTo} />;
  }

  if (currentPage === 'admin') {
    return <AdminDashboard navigateTo={navigateTo} />;
  }

  return <Home navigateTo={navigateTo} />;
}

export default App;
