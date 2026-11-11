import React, { useState, useEffect, useRef } from 'react';
import AppearanceSettings from '../../components/settings/AppearanceSettings.jsx';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Subtab navigation: 'profile' | 'appearance'
  const [activeSubtab, setActiveSubtab] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('subtab') || 'profile';
    }
    return 'profile';
  });

  const handleSubtabChange = (newSubtab) => {
    setActiveSubtab(newSubtab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('subtab', newSubtab);
      window.history.replaceState({}, '', url.toString());
    }
  };
  
  // Profile state
  const [profile, setProfile] = useState({
    username: '',
    full_name: '',
    email: '',
    profile_image_url: ''
  });
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  // Password state
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  
  // UI states
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch('/api/get-settings')
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setProfile({
            username: data.user.username || '',
            full_name: data.user.full_name || '',
            email: data.user.email || '',
            profile_image_url: data.user.profile_image_url || ''
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleProfileChange = (e) => {
    setProfile({ ...profile, [e.target.name]: e.target.value });
  };

  const handlePasswordChange = (e) => {
    setPasswords({ ...passwords, [e.target.name]: e.target.value });
  };

  const uploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setProfileError('File must be smaller than 5MB.');
      return;
    }

    setSaving(true);
    setProfileError('');
    setProfileSuccess('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { upload } = await import('@vercel/blob/client');
      
      const newBlob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload-profile-image',
      });
      
      setProfile(prev => ({ ...prev, profile_image_url: newBlob.url }));
      setProfileSuccess('Profile picture updated successfully.');
    } catch (err) {
      setProfileError('Failed to upload image.');
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setProfileError('');
    setProfileSuccess('');

    try {
      const res = await fetch('/api/update-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'profile', data: profile })
      });
      const data = await res.json();
      
      if (res.ok) {
        setProfileSuccess('Profile updated successfully.');
      } else {
        setProfileError(data.error || 'Failed to update profile.');
      }
    } catch (err) {
      setProfileError('A network error occurred.');
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setSaving(true);
    setPasswordError('');
    setPasswordSuccess('');

    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordError('New passwords do not match.');
      setSaving(false);
      return;
    }

    if (passwords.newPassword.length < 10) {
      setPasswordError('Password must be at least 10 characters long.');
      setSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword
        })
      });
      const data = await res.json();
      
      if (res.ok) {
        setPasswordSuccess('Password changed successfully.');
        setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setPasswordError(data.error || 'Failed to change password.');
      }
    } catch (err) {
      setPasswordError('A network error occurred.');
    } finally {
      setSaving(false);
    }
  };

  const EyeButton = ({ show, toggle }) => {
    const [hover, setHover] = useState(false);
    return (
      <button
        type="button"
        aria-label={show ? "Hide password" : "Show password"}
        onClick={toggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: 'absolute',
          right: '12px',
          top: '38px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.2s ease',
          color: hover ? 'var(--espresso)' : 'var(--muted)'
        }}
      >
        {show ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        )}
      </button>
    );
  };

  if (loading) return <div style={{ padding: '24px', fontFamily: 'var(--font-body)', color: 'var(--espresso)' }}>Loading settings...</div>;

  return (
    <div style={{ maxWidth: activeSubtab === 'appearance' ? '1280px' : '800px', margin: '0 auto', transition: 'max-width 0.2s ease' }}>
      {/* Title */}
      <h1 style={{ 
        fontFamily: 'var(--font-display)', 
        fontSize: '42px', 
        letterSpacing: '-0.02em', 
        color: 'var(--espresso)',
        margin: '0 0 20px 0'
      }}>
        Settings
      </h1>

      {/* Subtab Segmented Control */}
      <div style={{
        display: 'inline-flex',
        backgroundColor: 'var(--surface)',
        padding: '4px',
        borderRadius: '999px',
        border: '1px solid var(--border)',
        marginBottom: '32px'
      }}>
        <button
          type="button"
          onClick={() => handleSubtabChange('profile')}
          style={{
            padding: '8px 20px',
            borderRadius: '999px',
            border: 'none',
            backgroundColor: activeSubtab === 'profile' ? 'var(--white)' : 'transparent',
            color: activeSubtab === 'profile' ? 'var(--espresso)' : 'var(--muted)',
            fontFamily: 'var(--font-body)',
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            boxShadow: activeSubtab === 'profile' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          Profile &amp; Security
        </button>
        <button
          type="button"
          onClick={() => handleSubtabChange('appearance')}
          style={{
            padding: '8px 20px',
            borderRadius: '999px',
            border: 'none',
            backgroundColor: activeSubtab === 'appearance' ? 'var(--white)' : 'transparent',
            color: activeSubtab === 'appearance' ? 'var(--espresso)' : 'var(--muted)',
            fontFamily: 'var(--font-body)',
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            boxShadow: activeSubtab === 'appearance' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          Appearance
        </button>
      </div>

      {/* SUBTAB: APPEARANCE */}
      {activeSubtab === 'appearance' && (
        <AppearanceSettings />
      )}

      {/* SUBTAB: PROFILE & SECURITY */}
      {activeSubtab === 'profile' && (
        <>
          <div style={{ 
            backgroundColor: 'var(--white)', 
            border: '1px solid var(--border)', 
            borderRadius: '8px', 
            padding: '32px',
            marginBottom: '32px'
          }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--espresso)', margin: '0 0 24px 0' }}>Profile Information</h2>
            
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                backgroundColor: 'var(--cream)',
                backgroundImage: profile.profile_image_url ? `url(${profile.profile_image_url})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                border: '1px solid var(--border)',
                marginRight: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
              }}>
                {!profile.profile_image_url && <span style={{ color: 'var(--muted)' }}>No Image</span>}
              </div>
              <div>
                <input 
                  type="file" 
                  accept="image/jpeg, image/png, image/webp"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={uploadImage}
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-cherry-outline"
                  disabled={saving}
                >
                  Upload New Picture
                </button>
                <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '8px', fontFamily: 'var(--font-body)' }}>JPG, PNG, WebP up to 5MB.</p>
              </div>
            </div>

            <form onSubmit={saveProfile} style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label className="form-pill-label" htmlFor="full_name">Full Name</label>
                <input 
                  className="form-pill-input" 
                  id="full_name" 
                  name="full_name" 
                  value={profile.full_name} 
                  onChange={handleProfileChange} 
                />
              </div>
              <div>
                <label className="form-pill-label" htmlFor="username">Username</label>
                <input 
                  className="form-pill-input" 
                  id="username" 
                  name="username" 
                  value={profile.username} 
                  onChange={handleProfileChange} 
                />
              </div>
              <div>
                <label className="form-pill-label" htmlFor="email">Email Address</label>
                <input 
                  className="form-pill-input" 
                  type="email" 
                  id="email" 
                  name="email" 
                  value={profile.email} 
                  onChange={handleProfileChange} 
                />
              </div>
              
              {profileError && <p style={{ color: 'var(--negative)', fontSize: '14px', margin: 0 }}>{profileError}</p>}
              {profileSuccess && <p style={{ color: 'var(--espresso)', fontSize: '14px', margin: 0, fontWeight: 500 }}>{profileSuccess}</p>}

              <button type="submit" className="btn-cherry" style={{ width: 'fit-content' }} disabled={saving}>
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </form>
          </div>

          <div style={{ 
            backgroundColor: 'var(--white)', 
            border: '1px solid var(--border)', 
            borderRadius: '8px', 
            padding: '32px'
          }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--espresso)', margin: '0 0 24px 0' }}>Change Password</h2>
            
            <form onSubmit={savePassword} style={{ display: 'grid', gap: '16px' }}>
              <div style={{ position: 'relative' }}>
                <label className="form-pill-label" htmlFor="currentPassword">Current Password</label>
                <input 
                  className="form-pill-input" 
                  type={showCurrent ? "text" : "password"} 
                  id="currentPassword" 
                  name="currentPassword" 
                  value={passwords.currentPassword} 
                  onChange={handlePasswordChange} 
                  required
                  style={{ paddingRight: '40px' }}
                />
                <EyeButton show={showCurrent} toggle={() => setShowCurrent(!showCurrent)} />
              </div>

              <div style={{ position: 'relative' }}>
                <label className="form-pill-label" htmlFor="newPassword">New Password</label>
                <input 
                  className="form-pill-input" 
                  type={showNew ? "text" : "password"} 
                  id="newPassword" 
                  name="newPassword" 
                  value={passwords.newPassword} 
                  onChange={handlePasswordChange} 
                  required
                  minLength={10}
                  style={{ paddingRight: '40px' }}
                />
                <EyeButton show={showNew} toggle={() => setShowNew(!showNew)} />
                {passwords.newPassword.length > 0 && passwords.newPassword.length < 10 && (
                  <p style={{ color: 'var(--negative)', fontSize: '12px', marginTop: '4px' }}>Password must be at least 10 characters.</p>
                )}
                {passwords.newPassword.length >= 10 && (
                  <p style={{ color: 'var(--positive)', fontSize: '12px', marginTop: '4px' }}>Password strength: Looks good!</p>
                )}
              </div>

              <div style={{ position: 'relative' }}>
                <label className="form-pill-label" htmlFor="confirmPassword">Confirm New Password</label>
                <input 
                  className="form-pill-input" 
                  type={showConfirm ? "text" : "password"} 
                  id="confirmPassword" 
                  name="confirmPassword" 
                  value={passwords.confirmPassword} 
                  onChange={handlePasswordChange} 
                  required
                  style={{ paddingRight: '40px' }}
                />
                <EyeButton show={showConfirm} toggle={() => setShowConfirm(!showConfirm)} />
              </div>
              
              {passwordError && <p style={{ color: 'var(--negative)', fontSize: '14px', margin: 0 }}>{passwordError}</p>}
              {passwordSuccess && <p style={{ color: 'var(--espresso)', fontSize: '14px', margin: 0, fontWeight: 500 }}>{passwordSuccess}</p>}

              <button type="submit" className="btn-cherry" style={{ width: 'fit-content' }} disabled={saving}>
                {saving ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
