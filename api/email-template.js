export const generateEmailHTML = ({ name, formattedDate, method }) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Booking Confirmation - Intent Digital</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Montserrat:wght@400;500;600&display=swap');
        
        body {
          margin: 0;
          padding: 0;
          background-color: #FAF8F5; /* Toasted Cream */
          color: #34292A; /* Ganache */
          font-family: 'Montserrat', sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #FAF8F5;
          padding: 40px 20px;
        }

        .header {
          text-align: center;
          padding-bottom: 30px;
          border-bottom: 1px solid rgba(52, 41, 42, 0.1);
        }

        .logo {
          font-family: 'Cormorant Garamond', serif;
          font-size: 28px;
          font-weight: 700;
          color: #34292A;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          text-decoration: none;
        }

        .content {
          padding: 40px 0;
        }

        h1 {
          font-family: 'Cormorant Garamond', serif;
          font-size: 32px;
          font-weight: 600;
          color: #34292A;
          margin-top: 0;
          margin-bottom: 20px;
        }

        p {
          font-size: 15px;
          line-height: 1.6;
          color: #34292A;
          margin-bottom: 20px;
        }

        .details-box {
          background-color: #FFFFFF;
          border: 1px solid rgba(52, 41, 42, 0.1);
          border-radius: 8px;
          padding: 30px;
          margin: 30px 0;
          box-shadow: 0 4px 20px rgba(52, 41, 42, 0.03);
        }

        .detail-item {
          margin-bottom: 15px;
        }
        
        .detail-item:last-child {
          margin-bottom: 0;
        }

        .detail-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #859DCE; /* Periwinkle Blue */
          font-weight: 600;
          margin-bottom: 4px;
          display: block;
        }

        .detail-value {
          font-size: 16px;
          font-weight: 500;
        }

        .btn {
          display: inline-block;
          background-color: #34292A;
          color: #FAF8F5;
          text-decoration: none;
          font-family: 'Montserrat', sans-serif;
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 14px 32px;
          border-radius: 40px;
          margin-top: 10px;
        }

        .footer {
          text-align: center;
          padding-top: 30px;
          border-top: 1px solid rgba(52, 41, 42, 0.1);
          font-size: 12px;
          color: rgba(52, 41, 42, 0.6);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <a href="https://intentdigital.com" class="logo">Intent Digital</a>
        </div>
        
        <div class="content">
          <h1>Request Confirmed.</h1>
          <p>Hello ${name},</p>
          <p>Thank you for reaching out to Intent Digital. We have successfully received your consultation request and calendar booking.</p>
          <p>We are looking forward to discussing your vision and how our branding agency can elevate your digital presence.</p>
          
          <div class="details-box">
            <div class="detail-item">
              <span class="detail-label">Date & Time</span>
              <span class="detail-value">${formattedDate}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Meeting Method</span>
              <span class="detail-value">${method}</span>
            </div>
          </div>

          <p>If you need to reschedule or have any additional details to share before our call, simply reply directly to this email.</p>
        </div>

        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Intent Digital. All rights reserved.</p>
          <p>This email was sent automatically based on your consultation request.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};
