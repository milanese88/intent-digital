import { generateEmailHTML } from './_lib/email-template.js';
import { getDb } from './_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.CAL_COM_API_KEY || process.env.CAL_API_KEY;
  const eventTypeId = process.env.CAL_EVENT_TYPE_ID || process.env.CAL_COM_EVENT_TYPE_ID || '6441308';
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!apiKey || !eventTypeId) {
    return res.status(500).json({ 
      error: 'Server configuration error: Missing Cal.com API key or Event Type ID. Please configure CAL_COM_API_KEY and CAL_EVENT_TYPE_ID in the production environment variables.' 
    });
  }

  const { start, responses, timeZone } = req.body;

  if (!start || !responses || !responses.email || !responses.name) {
    return res.status(400).json({ error: 'Missing required booking fields (start, name, email)' });
  }

  try {
    const url = `https://api.cal.com/v2/bookings`;
    
    const payload = {
      eventTypeId: parseInt(eventTypeId, 10),
      start: start, // ISO 8601 string
      responses: responses,
      metadata: {},
      timeZone: timeZone || 'America/New_York',
      language: 'en'
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`Cal.com booking failed: ${response.status} ${JSON.stringify(errData)}`);
    }

    const json = await response.json();

    // After successful booking, optionally send the branded email via Resend
    if (resendApiKey && resendApiKey !== 'your_resend_api_key_here') {
      try {
        const sql = getDb();
        // Format the date nicely for the email
        const d = new Date(start);
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timeZone || 'America/New_York' };
        const formattedDate = new Intl.DateTimeFormat('en-US', options).format(d);
        
        // Extract method if possible from notes or default to Zoom
        const notesStr = responses.notes || '';
        let method = 'Zoom';
        if (notesStr.includes('Method: ')) {
          method = notesStr.split('Method: ')[1].split(',')[0];
        }

        // Fetch custom template
        const templates = await sql`
          SELECT subject, body FROM email_templates
          WHERE category = 'contact_reply' AND is_active = true
          LIMIT 1
        `;

        let customSubject = null;
        let customBody = null;

        if (templates && templates.length > 0) {
          const t = templates[0];
          const nameMatch = new RegExp('{{name}}', 'g');
          const emailMatch = new RegExp('{{email}}', 'g');
          // message can be found in responses.notes but this is a booking form.
          // Wait, the prompt says substitute {{name}}, {{email}} and {{message}}
          // If we are booking a slot, the message might be in notes. We'll use notesStr.
          const messageMatch = new RegExp('{{message}}', 'g');
          
          if (t.subject) {
            customSubject = t.subject
              .replace(nameMatch, responses.name || '')
              .replace(emailMatch, responses.email || '')
              .replace(messageMatch, notesStr || '');
          }
          if (t.body) {
            customBody = t.body
              .replace(nameMatch, responses.name || '')
              .replace(emailMatch, responses.email || '')
              .replace(messageMatch, notesStr || '');
          }
        }

        const emailHtml = generateEmailHTML({ 
          name: responses.name, 
          formattedDate, 
          method,
          customBody,
          customSubject
        });

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Intent Digital <hello@intentdigital.com>', // MUST BE VERIFIED IN RESEND
            to: responses.email,
            subject: customSubject || 'Consultation Confirmed - Intent Digital',
            html: emailHtml
          })
        });
        console.log(`Branded email sent to ${responses.email}`);
      } catch (emailError) {
        // We don't want to fail the overall request if the email fails, just log it.
        console.error('Failed to send branded email:', emailError);
      }
    }

    return res.status(200).json(json.data);
  } catch (error) {
    console.error('Error booking slot with Cal.com:', error);
    return res.status(500).json({ error: 'Failed to book appointment' });
  }
}
