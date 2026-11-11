import React, { useState } from 'react';
import { usePortalTheme } from '../context/PortalThemeContext.jsx';

export default function DashboardLayout({ navigateTo, activeTab, setActiveTab, children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { cssVariables, hasUnsavedChanges } = usePortalTheme();

  const topTabs = [
    { id: 'overview', label: 'DASHBOARD' },
    { id: 'email-templates', label: 'EMAIL TEMPLATES' },
    { id: 'blogs', label: 'BLOGS' },
    { id: 'investor', label: 'INVESTOR STUDIO' },
    { id: 'designer', label: 'DESIGNER HUB' },
    { id: 'learning-lab', label: 'LEARNING LAB' }
  ];

  const bottomTabs = [
    { id: 'user', label: 'USER' },
    { id: 'settings', label: 'SETTINGS' }
  ];

  const handleLogout = async () => {
    if (hasUnsavedChanges) {
      const confirmLeave = window.confirm('You have unsaved appearance changes. Discard and log out?');
      if (!confirmLeave) return;
    }
    await fetch('/api/logout', { method: 'POST' });
    if (navigateTo) {
      navigateTo('login');
    } else {
      window.location.href = '/login';
    }
  };

  const handleTabClick = (tabId) => {
    if (hasUnsavedChanges && activeTab === 'settings' && tabId !== 'settings') {
      const confirmLeave = window.confirm('You have unsaved appearance changes. Discard them and switch tabs?');
      if (!confirmLeave) return;
    }
    setActiveTab(tabId);
    setMobileMenuOpen(false);
  };

  const renderTab = (tab) => {
    const isSelected = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        onClick={() => handleTabClick(tab.id)}
        style={{
          background: isSelected ? 'var(--surface)' : 'transparent',
          border: 'none',
          borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
          borderRadius: '6px',
          padding: '12px 14px',
          textAlign: 'left',
          fontFamily: 'var(--font-label, var(--font-body))',
          fontSize: '12px',
          fontWeight: isSelected ? 700 : 500,
          color: 'var(--sidebar-text)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          width: '100%'
        }}
      >
        {tab.label}
      </button>
    );
  };

  const SidebarContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--sidebar-bg)' }}>
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        <a href="#" onClick={(e) => { e.preventDefault(); navigateTo && navigateTo('home'); }}>
          <img 
            src="/intent-digital-logo-web.png" 
            alt="Intent Digital Logo" 
            style={{ width: '52px', height: '52px', marginBottom: '16px', objectFit: 'contain' }} 
          />
        </a>
        <h2 style={{ 
          fontFamily: 'var(--font-display)', 
          fontSize: '13px', 
          fontWeight: 'normal', 
          letterSpacing: '0.12em', 
          margin: 0, 
          color: 'var(--sidebar-text)',
          textTransform: 'uppercase'
        }}>
          Intent Digital
        </h2>
      </div>

      <nav style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {topTabs.map(renderTab)}
      </nav>

      <div style={{ marginTop: 'auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '16px 8px 8px 8px' }} />
        {bottomTabs.map(renderTab)}
      </div>

      <div style={{ padding: '24px 16px' }}>
        <button 
          onClick={handleLogout}
          style={{
            background: 'none',
            border: 'none',
            fontFamily: 'var(--font-body)',
            fontSize: '12px',
            color: 'var(--muted)',
            cursor: 'pointer',
            padding: '12px 14px',
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
    <div
      id="portal-root"
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: 'var(--cream)',
        color: 'var(--text-2)',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-body)',
        ...cssVariables
      }}
    >
      {/* DESKTOP SIDEBAR */}
      <aside className="dashboard-sidebar desktop-only" style={{ 
        width: '280px', 
        backgroundColor: 'var(--sidebar-bg)', 
        borderRight: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto'
      }}>
        <SidebarContent />
      </aside>

      {/* MOBILE HEADER & DRAWER */}
      <div className="mobile-only" style={{ width: '100%' }}>
      </div>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, backgroundColor: 'var(--cream)' }}>
        
        {/* MOBILE HEADER */}
        <header className="mobile-only" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          backgroundColor: 'var(--sidebar-bg)',
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          zIndex: 40
        }}>
          <img src="/intent-digital-logo-web.png" alt="Intent Digital Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
          <button 
            onClick={() => setMobileMenuOpen(true)}
            style={{ background: 'none', border: 'none', fontSize: '24px', color: 'var(--sidebar-text)', cursor: 'pointer' }}
          >
            ☰
          </button>
        </header>

        <div style={{ padding: (activeTab === 'investor' || activeTab === 'designer' || activeTab === 'learning-lab') ? 0 : '40px 5%' }}>
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
            backgroundColor: 'var(--sidebar-bg)',
            boxShadow: '4px 0 24px rgba(0,0,0,0.1)',
            animation: 'slideInLeft 0.3s ease forwards'
          }}>
            <button 
              onClick={() => setMobileMenuOpen(false)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', fontSize: '20px', color: 'var(--sidebar-text)', cursor: 'pointer' }}
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
