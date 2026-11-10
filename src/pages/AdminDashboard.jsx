import React, { useEffect, useState } from 'react';
import DashboardLayout from './DashboardLayout.jsx';
import Overview from './dashboard/Overview.jsx';
import Settings from './dashboard/Settings.jsx';
import UserProfile from './dashboard/UserProfile.jsx';
import EmailTemplates from './dashboard/EmailTemplates.jsx';
import Blogs from './dashboard/Blogs.jsx';
import InvestorStudio from '../components/investor/InvestorStudio.jsx';
import DesignerHub from '../components/designer/DesignerHub.jsx';

export default function AdminDashboard({ navigateTo }) {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('tab') || 'overview';
    }
    return 'overview';
  });

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
        navigateTo('login');
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
      case 'investor': return <InvestorStudio setActiveDashboardTab={handleTabChange} />;
      case 'designer': return <DesignerHub setActiveDashboardTab={handleTabChange} />;
      default: return null;
    }
  };

  return (
    <DashboardLayout navigateTo={navigateTo} activeTab={activeTab} setActiveTab={handleTabChange}>
      {renderActiveTab()}
    </DashboardLayout>
  );
}
