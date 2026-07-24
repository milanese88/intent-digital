import React from 'react';

export default function Placeholder({ title }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'center',
      minHeight: '40vh',
      padding: '40px'
    }}>
      <h1 style={{ 
        fontFamily: '"Cormorant Garamond", serif', 
        fontSize: '42px', 
        letterSpacing: '-0.02em', 
        color: '#34292A',
        margin: '0 0 16px 0'
      }}>
        {title}
      </h1>
      <p style={{ 
        fontFamily: 'Montserrat, sans-serif', 
        fontSize: '15px', 
        color: 'rgba(52, 41, 42, 0.7)',
        margin: 0
      }}>
        Coming soon.
      </p>
    </div>
  );
}
