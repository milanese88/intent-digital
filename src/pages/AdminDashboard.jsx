import React, { useEffect, useState } from 'react';
import DashboardLayout from './DashboardLayout.jsx';

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

  return <DashboardLayout navigateTo={navigateTo} activeTab={activeTab} setActiveTab={setActiveTab} />;
}
