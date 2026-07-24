export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.CAL_COM_API_KEY || process.env.CAL_API_KEY;
  const eventTypeId = process.env.CAL_EVENT_TYPE_ID || process.env.CAL_COM_EVENT_TYPE_ID;

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
    return res.status(200).json(json.data);
  } catch (error) {
    console.error('Error booking slot with Cal.com:', error);
    return res.status(500).json({ error: 'Failed to book appointment' });
  }
}
