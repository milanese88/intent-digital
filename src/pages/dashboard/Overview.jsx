import React from 'react';

export default function Overview() {
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const stats = [
    { label: 'Upcoming Bookings', value: '—' },
    { label: 'New Inquiries This Week', value: '—' },
    { label: 'Subscriber Count', value: '—' },
    { label: 'Last Campaign Sent', value: '—' },
  ];

  return (
    <div>
      <div style={{ marginBottom: '48px' }}>
        <h1 style={{ 
          fontFamily: '"Cormorant Garamond", serif', 
          fontSize: '42px', 
          letterSpacing: '-0.02em', 
          color: '#34292A',
          margin: '0 0 8px 0'
        }}>
          Welcome back, Florencia
        </h1>
        <p style={{ 
          fontFamily: 'Montserrat, sans-serif', 
          fontSize: '14px', 
          color: 'rgba(52, 41, 42, 0.7)',
          margin: 0
        }}>
          {date}
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '24px'
      }}>
        {stats.map((stat, i) => (
          <div 
            key={i}
            className="stat-card"
            style={{
              border: '1px solid rgba(52, 41, 42, 0.1)',
              borderRadius: '4px',
              padding: '24px',
              backgroundColor: '#fff',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              cursor: 'default'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(52, 41, 42, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <p style={{ 
              fontFamily: 'Montserrat, sans-serif', 
              fontSize: '12px', 
              fontWeight: 600, 
              color: 'rgba(52, 41, 42, 0.6)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              margin: '0 0 12px 0'
            }}>
              {stat.label}
            </p>
            <p style={{ 
              fontFamily: '"Cormorant Garamond", serif', 
              fontSize: '36px', 
              color: '#34292A',
              margin: 0,
              lineHeight: 1
            }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
