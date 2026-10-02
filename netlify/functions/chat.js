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

  // Only POST is allowed
  if (event.httpMethod !== 'POST') {
    return respond(405, {
      error: 'Method not allowed. Use POST.'
    });
  }

  // Check API key
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return respond(500, {
      error: 'GEMINI_API_KEY is missing in Netlify environment variables.'
    });
  }

  // Parse request
  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch (error) {
    return respond(400, {
      error: 'Invalid JSON request.'
    });
  }

  const lang = payload.lang === 'hi' ? 'hi' : 'en';

  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return respond(400, {
      error: 'Please send at least one message.'
    });
  }

  // Convert messages to Gemini format
  const contents = payload.messages
    .slice(-16)
    .filter(
      m =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim()
    )
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [
        {
          text: m.content.trim().slice(0, 6000)
        }
      ]
    }));

  if (
    !contents.length ||
    contents[contents.length - 1].role !== 'user'
  ) {
    return respond(400, {
      error: 'The latest message must be from the user.'
    });
  }

  // Jarvis instructions
  const systemText =
    lang === 'hi'
      ? 'You are Jarvis, a friendly and helpful personal AI assistant. Reply naturally in Hindi written in Devanagari. If the user writes in Hinglish, you may use simple conversational Hinglish. Be clear and concise. Do not claim to perform actions you cannot perform.'
      : 'You are Jarvis, a friendly and helpful personal AI assistant. Reply naturally in English unless the user clearly uses another language. Be clear and concise. Do not claim to perform actions you cannot perform.';

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 25000);

  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(MODEL)}:generateContent`;

    const upstream = await fetch(url, {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },

      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: systemText
            }
          ]
        },

        contents,

        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 900
        }
      }),

      signal: controller.signal
    });

    const data = await upstream.json().catch(() => ({}));

    // IMPORTANT:
    // Return the REAL Gemini error so we can diagnose it.
    if (!upstream.ok) {
      const message =
        data &&
        data.error &&
        data.error.message
          ? data.error.message
          : 'Unknown Gemini API error';

      console.error(
        'Gemini API error:',
        upstream.status,
        message
      );

      return respond(502, {
        error: `Gemini API error (${upstream.status}): ${message}`
      });
    }

    // Get Gemini reply
    const reply =
      (
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts
          ? data.candidates[0].content.parts
          : []
      )
        .map(part =>
          typeof part.text === 'string'
            ? part.text
            : ''
        )
        .join('')
        .trim();

    if (!reply) {
      console.error(
        'Gemini returned no text:',
        JSON.stringify(data)
      );

      return respond(502, {
        error: 'Gemini returned an empty response.'
      });
    }

    return respond(200, {
      reply
    });

  } catch (error) {

    if (error && error.name === 'AbortError') {
      return respond(504, {
        error: 'Gemini took too long to respond. Please try again.'
      });
    }

    console.error(
      'Chat function error:',
      error
    );

    return respond(502, {
      error:
        `Could not reach Gemini: ` +
        `${error && error.message ? error.message : 'Unknown error'}`
    });

  } finally {
    clearTimeout(timeout);
  }
};
