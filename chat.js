'use strict';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };
  const respond = (statusCode, body) => ({
    statusCode,
    headers,
    body: JSON.stringify(body)
  });

  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return respond(500, { error: 'GEMINI_API_KEY is not configured in Netlify environment variables.' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (_) {
    return respond(400, { error: 'Invalid JSON request.' });
  }

  const lang = payload.lang === 'hi' ? 'hi' : 'en';
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return respond(400, { error: 'Please send at least one message.' });
  }

  // Keep only recent, valid user/assistant messages and convert them to Gemini roles.
  const contents = payload.messages
    .slice(-16)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content.trim().slice(0, 6000) }]
    }));

  if (!contents.length || contents[contents.length - 1].role !== 'user') {
    return respond(400, { error: 'The latest message must be from the user.' });
  }

  const systemText = lang === 'hi'
    ? 'You are Jarvis, a friendly, helpful personal AI assistant. Reply in natural Hindi written in Devanagari. If the user writes in Hinglish, you may use simple conversational Hindi/Hinglish. Be clear and concise, and do not claim to perform actions you cannot perform.'
    : 'You are Jarvis, a friendly, helpful personal AI assistant. Reply in natural English unless the user clearly uses another language. Be clear and concise, and do not claim to perform actions you cannot perform.';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 900 }
      }),
      signal: controller.signal
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const message = data && data.error && data.error.message;
      if (upstream.status === 400 || upstream.status === 401 || upstream.status === 403) {
        return respond(401, { error: 'Gemini API rejected the request. Check that GEMINI_API_KEY is valid and the Gemini API is enabled.' });
      }
      if (upstream.status === 429) {
        return respond(429, { error: 'Gemini API rate limit or quota reached. Please wait and try again.' });
      }
      console.error('Gemini API error:', upstream.status, message || 'Unknown upstream error');
      return respond(502, { error: 'Gemini service could not complete the request. Please try again.' });
    }

    const reply = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts || [])
      .map(part => typeof part.text === 'string' ? part.text : '')
      .join('')
      .trim();

    if (!reply) {
      return respond(502, { error: 'Gemini returned an empty response. Please try asking another way.' });
    }
    return respond(200, { reply });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return respond(504, { error: 'Gemini took too long to respond. Please try again.' });
    }
    console.error('Chat function error:', error);
    return respond(502, { error: 'Could not reach Gemini. Check the connection and try again.' });
  } finally {
    clearTimeout(timeout);
  }
};
