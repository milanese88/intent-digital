import React, { useState, useEffect } from 'react';
import Home from './pages/Home.jsx';
import About from './pages/About.jsx';
import Services from './pages/Services.jsx';
import Contact from './pages/Contact.jsx';
import News from './pages/News.jsx';
import Login from './pages/Login.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import LearningLab from './pages/LearningLab.jsx';
import DealReportPage from './pages/investor/DealReportPage.jsx';

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
      if (path.startsWith('/admin/investor/report/')) {
        const propId = path.split('/admin/investor/report/')[1]?.split('?')[0]?.split('/')[0];
        if (!propId) {
          return 'admin-not-found';
        }
        return 'deal-report';
      }
      if (path === '/login') {
        return 'login';
      }
      if (path.startsWith('/news')) {
        return 'news';
      }
      if (path === '/reset-password') {
        return 'reset-password';
      }
      if (path === '/admin' || path.startsWith('/admin')) {
        return 'admin';
      }
      if (path === '/learning-lab' || path.startsWith('/learning-lab')) {
        return 'learning-lab';
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

  const [reportPropertyId, setReportPropertyId] = useState(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const match = path.match(/^\/admin\/investor\/report\/([^/?#]+)/);
      return match ? match[1] : '';
    }
    return '';
  });

  const navigateTo = (page, targetId, slug = null, token = null) => {
    if (token) {
      setResetToken(token);
    }

    if (page === 'news') {
      const newPath = slug ? `/news/${slug}` : '/news';
      window.history.pushState({}, '', newPath);
      setNewsSlug(slug);
    } else if (page === 'deal-report') {
      const propId = slug || reportPropertyId;
      const anIdParam = token ? `?analysis=${encodeURIComponent(token)}` : '';
      const newPath = `/admin/investor/report/${propId}${anIdParam}`;
      window.history.pushState({}, '', newPath);
      setReportPropertyId(propId);
    } else if (page === 'login') {
      const redirectTarget = slug || (typeof window !== 'undefined' ? (window.location.pathname + window.location.search) : '');
      const redirectParam = (redirectTarget && redirectTarget !== '/' && !redirectTarget.includes('route=login')) 
        ? `&redirect=${encodeURIComponent(redirectTarget)}` 
        : '';
      window.history.pushState({}, '', `/?route=login${redirectParam}`);
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

  if (currentPage === 'deal-report') {
    return <DealReportPage propertyId={reportPropertyId} navigateTo={navigateTo} />;
  }

  if (currentPage === 'admin-not-found') {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#FAF8F5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
      }}>
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '40px 44px',
          maxWidth: '520px',
          width: '100%',
          boxShadow: '0 8px 30px rgba(52, 41, 42, 0.08)',
          textAlign: 'center',
          border: '1px solid rgba(52, 41, 42, 0.1)'
        }}>
          <h1 style={{
            fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
            fontSize: '34px',
            color: 'var(--espresso, #34292A)',
            margin: '0 0 6px 0',
            fontWeight: 400,
            lineHeight: 1.15
          }}>
            Page Not Found
            <span style={{ display: 'block', fontStyle: 'italic', fontSize: '20px', color: 'rgba(52, 41, 42, 0.65)', marginTop: '4px' }}>
              The requested admin page does not exist.
            </span>
          </h1>
          <p style={{ fontSize: '13.5px', color: 'rgba(52, 41, 42, 0.7)', lineHeight: 1.5, margin: '16px 0 28px 0' }}>
            We couldn't locate the admin route or report you requested.
          </p>
          <button
            type="button"
            onClick={() => {
              window.history.pushState({}, '', '/admin?tab=investor');
              setCurrentPage('admin');
            }}
            style={{
              backgroundColor: 'var(--secondary-color, #41101B)',
              color: '#FAF8F5',
              border: 'none',
              borderRadius: '50px',
              padding: '11px 26px',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(65, 16, 27, 0.25)'
            }}
          >
            Back to Investor Studio →
          </button>
        </div>
      </div>
    );
  }

  if (currentPage === 'learning-lab') {
    return <LearningLab navigateTo={navigateTo} />;
  }

  return <Home navigateTo={navigateTo} />;
}

export default App;
