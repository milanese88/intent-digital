import React, { useEffect, useState } from 'react';

export default function UserProfile() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/get-settings')
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUser(data.user);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '40px' }}>
        <p style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '15px', color: 'rgba(52, 41, 42, 0.7)' }}>
          Loading profile...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: '40px' }}>
        <p style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '15px', color: 'rgba(52, 41, 42, 0.7)' }}>
          Could not load profile.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px' }}>
      <h1 style={{ 
        fontFamily: '"Cormorant Garamond", serif', 
        fontSize: '42px', 
        letterSpacing: '-0.02em', 
        color: '#34292A',
        margin: '0 0 32px 0'
      }}>
        User Profile
      </h1>

      <div style={{ 
        backgroundColor: '#fff', 
        border: '1px solid rgba(52, 41, 42, 0.1)', 
        borderRadius: '8px', 
        padding: '32px',
        display: 'flex',
        alignItems: 'center',
        gap: '32px'
      }}>
        <div style={{
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          backgroundColor: '#FAF8F5',
          backgroundImage: user.profile_image_url ? `url(${user.profile_image_url})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          border: '1px solid rgba(52, 41, 42, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0
        }}>
          {!user.profile_image_url && <span style={{ color: 'rgba(52, 41, 42, 0.4)', fontFamily: 'Montserrat' }}>No Image</span>}
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h2 style={{ 
            fontFamily: '"Cormorant Garamond", serif', 
            fontSize: '28px', 
            color: '#34292A', 
            margin: 0 
          }}>
            {user.full_name || 'Admin User'}
          </h2>
          <p style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '14px', color: 'rgba(52, 41, 42, 0.7)', margin: 0 }}>
            <strong style={{ color: '#34292A', fontWeight: 600 }}>Username:</strong> {user.username || 'Not set'}
          </p>
          <p style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '14px', color: 'rgba(52, 41, 42, 0.7)', margin: 0 }}>
            <strong style={{ color: '#34292A', fontWeight: 600 }}>Email:</strong> {user.email || 'Not set'}
          </p>
        </div>
      </div>
    </div>
  );
}
