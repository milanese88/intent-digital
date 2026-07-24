import React, { useState } from 'react';

export default function DashboardLayout({ navigateTo, activeTab, setActiveTab, children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const tabs = [
    { id: 'overview', label: 'DASHBOARD' },
    { id: 'user', label: 'USER' },
    { id: 'settings', label: 'SETTINGS' }
  ];

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    if (navigateTo) {
      navigateTo('login');
    } else {
      window.location.href = '/login';
    }
  };

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
  };

  const SidebarContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        <a href="#" onClick={(e) => { e.preventDefault(); navigateTo && navigateTo('home'); }}>
          <img 
            src="/seal-logo.png" 
            alt="Intent Digital Seal" 
            style={{ width: '48px', height: '48px', marginBottom: '16px' }} 
          />
        </a>
        <h2 style={{ 
          fontFamily: '"Atelier Fleur", serif', 
          fontSize: '11px', 
          fontWeight: 'normal', 
          letterSpacing: '0.12em', 
          margin: 0, 
          color: '#34292A',
          textTransform: 'uppercase'
        }}>
          Intent Digital
        </h2>
      </div>

      <nav style={{ flex: 1, padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            style={{
              background: activeTab === tab.id ? 'rgba(52, 41, 42, 0.05)' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 16px',
              textAlign: 'left',
              fontFamily: 'Montserrat, sans-serif',
              fontSize: '13px',
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: '#34292A',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
              width: '100%'
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: '24px 16px' }}>
        <button 
          onClick={handleLogout}
          style={{
            background: 'none',
            border: 'none',
            fontFamily: 'Montserrat, sans-serif',
            fontSize: '13px',
            color: 'rgba(52, 41, 42, 0.7)',
            cursor: 'pointer',
            padding: '12px 16px',
            width: '100%',
            textAlign: 'left'
          }}
        >
          Log Out &rarr;
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#FAF8F5' }}>
      
      {/* DESKTOP SIDEBAR */}
      <aside className="dashboard-sidebar desktop-only" style={{ 
        width: '280px', 
        backgroundColor: '#fff', 
        borderRight: '1px solid rgba(52, 41, 42, 0.1)',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto'
      }}>
        <SidebarContent />
      </aside>

      {/* MOBILE HEADER & DRAWER */}
      <div className="mobile-only" style={{ width: '100%' }}>
        {/* We need the header inside the main content or absolutely positioned. 
            Actually, let's just make a mobile header at the top of the screen. */}
      </div>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        
        {/* MOBILE HEADER */}
        <header className="mobile-only" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          backgroundColor: '#fff',
          borderBottom: '1px solid rgba(52, 41, 42, 0.1)',
          position: 'sticky',
          top: 0,
          zIndex: 40
        }}>
          <img src="/seal-logo.png" alt="Intent Digital Seal" style={{ width: '32px', height: '32px' }} />
          <button 
            onClick={() => setMobileMenuOpen(true)}
            style={{ background: 'none', border: 'none', fontSize: '24px', color: '#34292A', cursor: 'pointer' }}
          >
            ☰
          </button>
        </header>

        <div style={{ padding: '40px 5%' }}>
          {children}
        </div>
      </main>

      {/* MOBILE DRAWER OVERLAY */}
      {mobileMenuOpen && (
        <div className="mobile-only" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(52, 41, 42, 0.5)',
          zIndex: 50
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: '280px',
            backgroundColor: '#fff',
            boxShadow: '4px 0 24px rgba(0,0,0,0.1)',
            animation: 'slideInLeft 0.3s ease forwards'
          }}>
            <button 
              onClick={() => setMobileMenuOpen(false)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', fontSize: '20px', color: '#34292A', cursor: 'pointer' }}
            >
              ✕
            </button>
            <SidebarContent />
          </div>
        </div>
      )}
    </div>
  );
}
