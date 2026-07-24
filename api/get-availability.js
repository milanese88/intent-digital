export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { dateFrom, dateTo } = req.query;

  const apiKey = process.env.CAL_COM_API_KEY;
  const eventTypeId = process.env.CAL_COM_EVENT_TYPE_ID;

  if (!apiKey || !eventTypeId) {
    return res.status(500).json({ error: 'Server configuration error: Missing Cal.com API keys' });
  }

  if (!dateFrom || !dateTo) {
    return res.status(400).json({ error: 'Missing dateFrom or dateTo parameters' });
  }

  try {
    // Cal.com v1 Slots API
    const url = `https://api.cal.com/v1/slots?apiKey=${apiKey}&eventTypeId=${eventTypeId}&startTime=${dateFrom}&endTime=${dateTo}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Cal.com API responded with status ${response.status}`);
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching availability from Cal.com:', error);
    return res.status(500).json({ error: 'Failed to fetch availability' });
  }
}
