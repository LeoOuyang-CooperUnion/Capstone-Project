const crypto = require('node:crypto');
const express = require('express');
require('dotenv').config();

const app = express();
const port = Number(process.env.API_PORT || 3000);
const deviceId = process.env.DEVICE_ID;
const deviceSecret = process.env.DEVICE_SECRET;

if (!deviceId || !deviceSecret || deviceSecret.startsWith('replace-this')) {
  console.error('Set DEVICE_ID and DEVICE_SECRET in .env before starting the server.');
  process.exit(1);
}

app.use(express.json({ limit: '2kb' }));

function hasValidDeviceSecret(request) {
  const suppliedSecret = request.get('X-Device-Secret');

  if (!suppliedSecret) {
    return false;
  }

  const expected = Buffer.from(deviceSecret);
  const supplied = Buffer.from(suppliedSecret);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

function isNumberInRange(value, minimum, maximum) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.post('/api/devices/:id/readings', (request, response) => {
  if (request.params.id !== deviceId || !hasValidDeviceSecret(request)) {
    return response.status(401).json({ error: 'Invalid device credential.' });
  }

  const { temperatureC, humidityPercent, pressureHpa } = request.body;

  if (
    !isNumberInRange(temperatureC, -40, 85) ||
    !isNumberInRange(humidityPercent, 0, 100) ||
    !isNumberInRange(pressureHpa, 300, 1100)
  ) {
    return response.status(400).json({
      error: 'Expected finite temperatureC (-40–85), humidityPercent (0–100), and pressureHpa (300–1100).'
    });
  }

  const receivedAt = new Date().toISOString();
  const observation = { deviceId, receivedAt, temperatureC, humidityPercent, pressureHpa };
  console.log('Accepted observation:', observation);

  // Milestone 3 will insert this validated observation into Supabase.
  return response.status(201).json({ accepted: true, receivedAt });
});

app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return response.status(400).json({ error: 'Request body must be valid JSON.' });
  }

  console.error(error);
  return response.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(port, () => {
  console.log(`Weather-station backend listening on http://localhost:${port}`);
});
