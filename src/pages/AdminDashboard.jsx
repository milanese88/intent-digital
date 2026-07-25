import React, { useEffect, useState } from 'react';
import DashboardLayout from './DashboardLayout.jsx';
import Overview from './dashboard/Overview.jsx';
import Settings from './dashboard/Settings.jsx';
import UserProfile from './dashboard/UserProfile.jsx';
import EmailTemplates from './dashboard/EmailTemplates.jsx';
import Blogs from './dashboard/Blogs.jsx';

export default function AdminDashboard({ navigateTo }) {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

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
      case 'overview': return <Overview />;
      case 'user': return <UserProfile />;
      case 'settings': return <Settings />;
      case 'email-templates': return <EmailTemplates />;
      case 'blogs': return <Blogs />;
      default: return null;
    }
  };

  return (
    <DashboardLayout navigateTo={navigateTo} activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderActiveTab()}
    </DashboardLayout>
  );
}
