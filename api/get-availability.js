export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { dateFrom, dateTo } = req.query;

  const apiKey = process.env.CAL_COM_API_KEY || process.env.CAL_API_KEY;
  const eventTypeId = process.env.CAL_EVENT_TYPE_ID || process.env.CAL_COM_EVENT_TYPE_ID || '6441308';

  if (!apiKey || !eventTypeId) {
    return res.status(500).json({ 
      error: 'Server configuration error: Missing Cal.com API key or Event Type ID. Please configure CAL_COM_API_KEY and CAL_EVENT_TYPE_ID in the production environment variables.' 
    });
  }

  if (!dateFrom || !dateTo) {
    return res.status(400).json({ error: 'Missing dateFrom or dateTo parameters' });
  }

  try {
    // Cal.com v2 Slots API
    // The dates should be YYYY-MM-DD for the v2 endpoint
    const url = `https://api.cal.com/v2/slots/available?eventTypeId=${eventTypeId}&startTime=${dateFrom.substring(0,10)}&endTime=${dateTo.substring(0,10)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Cal.com API responded with status ${response.status}`);
    }

    const json = await response.json();
    // v2 returns { status: "success", data: { slots: { ... } } }
    return res.status(200).json(json.data);
  } catch (error) {
    console.error('Error fetching availability from Cal.com:', error);
    return res.status(500).json({ error: 'Failed to fetch availability' });
  }
}
