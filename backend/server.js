const crypto = require('node:crypto');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
// Hosts such as Render provide PORT; API_PORT keeps local development on 3000.
const port = Number(process.env.PORT || process.env.API_PORT || 3000);
const deviceId = process.env.DEVICE_ID;
const deviceSecret = process.env.DEVICE_SECRET;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!deviceId || !deviceSecret || deviceSecret.startsWith('replace-this') || !supabaseUrl || !supabaseSecretKey || supabaseSecretKey.startsWith('replace-with')) {
  console.error('Set device and Supabase variables in .env before starting the server.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

app.use(express.json({ limit: '2kb' }));
app.use(express.static('frontend'));

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

function hasValidObservationValues({ temperatureC, humidityPercent, pressureHpa }) {
  return (
    isNumberInRange(temperatureC, -40, 85) &&
    isNumberInRange(humidityPercent, 0, 100) &&
    isNumberInRange(pressureHpa, 300, 1100)
  );
}

function isLocalRequest(request) {
  const address = request.socket.remoteAddress;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

async function storeObservation({ temperatureC, humidityPercent, pressureHpa, source }) {
  const { data, error } = await supabase
    .from('measurements')
    .insert({
      temperature_c: temperatureC,
      humidity_percent: humidityPercent,
      pressure_hpa: pressureHpa,
      source
    })
    .select('id, received_at, temperature_c, humidity_percent, pressure_hpa, source')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.post('/api/devices/:id/readings', async (request, response, next) => {
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

  try {
    const observation = await storeObservation({ temperatureC, humidityPercent, pressureHpa, source: 'device_upload' });
    console.log('Device observation stored:', { deviceId, id: observation.id, receivedAt: observation.received_at });
    return response.status(201).json({ accepted: true, receivedAt: observation.received_at, id: observation.id });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/location-validations', (request, response) => {
  const { latitude, longitude, locationSource } = request.body;

  if (!isNumberInRange(latitude, -90, 90) || !isNumberInRange(longitude, -180, 180)) {
    return response.status(400).json({ error: 'Latitude must be between -90 and 90; longitude must be between -180 and 180.' });
  }

  if (locationSource !== 'browser_geolocation' && locationSource !== 'user_selected') {
    return response.status(400).json({ error: 'Location source must be browser_geolocation or user_selected.' });
  }

  const validatedAt = new Date().toISOString();
  console.log('Location ready for observation:', { validatedAt, latitude, longitude, locationSource });
  return response.status(200).json({ ready: true, validatedAt });
});

app.post('/api/demo-observations', async (request, response, next) => {
  if (!isLocalRequest(request)) {
    return response.status(403).json({ error: 'Manual demo observations are available only from this computer.' });
  }

  const { temperatureC, humidityPercent, pressureHpa } = request.body;
  if (!hasValidObservationValues({ temperatureC, humidityPercent, pressureHpa })) {
    return response.status(400).json({
      error: 'Expected finite temperatureC (-40–85), humidityPercent (0–100), and pressureHpa (300–1100).'
    });
  }

  try {
    const observation = await storeObservation({ temperatureC, humidityPercent, pressureHpa, source: 'manual_serial_monitor_entry' });
    console.log('Manual demo observation stored:', { id: observation.id, receivedAt: observation.received_at });
    return response.status(201).json({ accepted: true, receivedAt: observation.received_at, id: observation.id, source: observation.source });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/measurements/recent', async (_request, response, next) => {
  try {
    const { data, error } = await supabase
      .from('measurements')
      .select('id, received_at, temperature_c, humidity_percent, pressure_hpa, source')
      .order('received_at', { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    return response.json({ measurements: data });
  } catch (error) {
    return next(error);
  }
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
