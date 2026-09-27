# rinkal bhai ka jarves assistant

Voice-enabled assistant with Hindi/English mode. The frontend calls a Netlify Function, which securely calls the Google Gemini API.

## Deploy to Netlify
1. Upload this entire folder to a GitHub repository.
2. In Netlify, choose **Add new site → Import an existing project** and select the repository.
3. Keep the build command `echo 'No build step required'` and publish directory `.` (configured in `netlify.toml`).
4. In **Site configuration → Environment variables**, add `GEMINI_API_KEY` with your Gemini API key. Optionally set `GEMINI_MODEL` (default: `gemini-2.5-flash`).
5. Deploy or trigger a fresh deploy after adding the variables.

Never put your API key in `index.html` or commit it to GitHub. The key is read only by the server-side function at `netlify/functions/chat.js`.

## Local development
Install Node.js 18 or newer, install Netlify CLI (`npm install -g netlify-cli`), copy `.env.example` to `.env`, set your own `GEMINI_API_KEY`, then run `netlify dev`.

Gemini API usage may be subject to quotas or charges. Check Google's current API terms and pricing.
