import React from 'react';

export default function Overview() {
  return (
    <div>
      <div style={{ marginBottom: '48px', textAlign: 'center' }}>
        <span style={{
          display: 'block',
          fontFamily: 'Montserrat, sans-serif',
          fontSize: '12px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(52, 41, 42, 0.6)',
          marginBottom: '16px'
        }}>
          OWNER PORTAL
        </span>
        <h1 style={{ 
          fontFamily: '"Cormorant Garamond", serif', 
          fontSize: '42px', 
          letterSpacing: '-0.02em', 
          color: '#34292A',
          margin: '0 0 8px 0'
        }}>
          Welcome Back, Florencia.
        </h1>
        <p style={{ 
          fontFamily: 'Montserrat, sans-serif', 
          fontSize: '15px', 
          color: 'rgba(52, 41, 42, 0.7)',
          margin: '0 auto',
          maxWidth: '600px',
          lineHeight: '1.6'
        }}>
          This is your private administrative dashboard. You can add secure management features here in the future.
        </p>
      </div>

      <div style={{ 
        maxWidth: '800px', 
        margin: '0 auto', 
        textAlign: 'center',
        backgroundColor: '#fff', 
        border: '1px solid rgba(52,41,42,0.1)', 
        borderRadius: '16px', 
        padding: '48px', 
        boxShadow: '0 4px 24px rgba(52, 41, 42, 0.05)' 
      }}>
        <h2 style={{ 
          fontFamily: '"Cormorant Garamond", serif', 
          fontSize: '24px', 
          color: '#34292A',
          marginBottom: '16px' 
        }}>
          Dashboard is Active
        </h2>
        <p style={{
          fontFamily: 'Montserrat, sans-serif',
          fontSize: '15px',
          color: 'rgba(52, 41, 42, 0.7)',
          lineHeight: '1.6',
          margin: 0
        }}>
          Your secure backend is perfectly functioning. Cal.com API and Resend API are both integrated and waiting for submissions.
        </p>
      </div>
    </div>
  );
}
