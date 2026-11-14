import React, { useEffect, useState } from 'react';
import { PortalThemeProvider } from '../context/PortalThemeContext.jsx';
import DashboardLayout from './DashboardLayout.jsx';
import Overview from './dashboard/Overview.jsx';
import Settings from './dashboard/Settings.jsx';
import UserProfile from './dashboard/UserProfile.jsx';
import EmailTemplates from './dashboard/EmailTemplates.jsx';
import Blogs from './dashboard/Blogs.jsx';
import InvestorStudio from '../components/investor/InvestorStudio.jsx';
import DesignerHub from '../components/designer/DesignerHub.jsx';
import LearningLabTab from '../components/learning/LearningLabTab.jsx';

const INVESTOR_PROPERTY_TABS = ['overview', 'comps', 'appraisal', 'site', 'deal', 'photos'];

function resolveDashboardTabFromSearch(searchStr) {
  const params = new URLSearchParams(searchStr);
  const rawTab = params.get('tab');
  if (params.get('property') && (!rawTab || INVESTOR_PROPERTY_TABS.includes(rawTab))) {
    return 'investor';
  }
  return rawTab || 'overview';
}

export default function AdminDashboard({ navigateTo }) {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      return resolveDashboardTabFromSearch(window.location.search);
    }
    return 'overview';
  });

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(resolveDashboardTabFromSearch(window.location.search));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', newTab);
      window.history.replaceState({}, '', url.toString());
    }
  };

  useEffect(() => {
    const verifySession = async () => {
      try {
        const res = await fetch('/api/verify');
        if (!res.ok) {
          throw new Error('Unauthorized');
        }
        setLoading(false);
      } catch (err) {
        const currentPath = window.location.pathname + window.location.search;
        navigateTo('login', null, currentPath);
      }
    };
    verifySession();
  }, [navigateTo]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ fontFamily: 'Montserrat, sans-serif' }}>Verifying session...</p>
      </div>
    );
  }

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'overview': return <Overview setActiveTab={handleTabChange} navigateTo={navigateTo} />;
      case 'user': return <UserProfile />;
      case 'settings': return <Settings />;
      case 'email-templates': return <EmailTemplates />;
      case 'blogs': return <Blogs />;
      case 'investor': return <InvestorStudio setActiveDashboardTab={handleTabChange} navigateTo={navigateTo} />;
      case 'designer': return <DesignerHub setActiveDashboardTab={handleTabChange} />;
      case 'learning-lab': return <LearningLabTab setActiveDashboardTab={handleTabChange} />;
      default:
        return (
          <div style={{
            padding: '60px 24px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontFamily: 'var(--font-sans, "Montserrat", sans-serif)'
          }}>
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              padding: '36px 44px',
              maxWidth: '520px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 8px 30px rgba(52, 41, 42, 0.06)',
              border: '1px solid rgba(52, 41, 42, 0.1)'
            }}>
              <h1 style={{
                fontFamily: 'var(--font-display, "Instrument Serif", Georgia, serif)',
                fontSize: '32px',
                color: 'var(--espresso, #34292A)',
                margin: '0 0 4px 0',
                fontWeight: 400
              }}>
                Page Not Found
                <span style={{ display: 'block', fontStyle: 'italic', fontSize: '20px', color: 'rgba(52, 41, 42, 0.65)', marginTop: '4px' }}>
                  The requested admin section does not exist.
                </span>
              </h1>
              <p style={{ fontSize: '13.5px', color: 'rgba(52, 41, 42, 0.7)', lineHeight: 1.5, margin: '16px 0 24px 0' }}>
                We couldn't find the admin page or tab you were looking for.
              </p>
              <button
                type="button"
                onClick={() => handleTabChange('investor')}
                style={{
                  backgroundColor: 'var(--secondary-color, #41101B)',
                  color: '#FAF8F5',
                  border: 'none',
                  borderRadius: '50px',
                  padding: '11px 26px',
                  fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
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
  };

  return (
    <PortalThemeProvider>
      <DashboardLayout navigateTo={navigateTo} activeTab={activeTab} setActiveTab={handleTabChange}>
        {renderActiveTab()}
      </DashboardLayout>
    </PortalThemeProvider>
  );
}
