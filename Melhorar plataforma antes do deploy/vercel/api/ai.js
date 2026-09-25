/* Adaptador Netlify -> Vercel. A lógica fica em _handlers/, idêntica nos dois deploys. */
const { handler } = require('./_handlers/ai.js');

module.exports = async (req, res) => {
  let body = '';
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (typeof req.body === 'string') body = req.body;
    else if (req.body && Object.keys(req.body).length) body = JSON.stringify(req.body);
    else {
      body = await new Promise((resolve) => {
        let raw = '';
        req.on('data', (c) => { raw += c; });
        req.on('end', () => resolve(raw));
        req.on('error', () => resolve(''));
      });
    }
  }

  const url = new URL(req.url, 'http://localhost');
  const qs = {};
  url.searchParams.forEach((v, k) => { qs[k] = v; });

  const event = {
    httpMethod: req.method,
    queryStringParameters: qs,
    headers: req.headers || {},
    body: body
  };

  try {
    const out = await handler(event);
    const headers = out.headers || { 'Content-Type': 'application/json; charset=utf-8' };
    Object.keys(headers).forEach((h) => res.setHeader(h, headers[h]));
    res.statusCode = out.statusCode || 200;
    res.end(out.body || '');
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: String((err && err.message) || 'falha na função'), code: 'VERCEL_ADAPTER_ERROR' }));
  }
};
