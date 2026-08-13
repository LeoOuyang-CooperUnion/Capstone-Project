const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
// Hosts such as Render provide PORT; API_PORT keeps local development on 3000.
const port = Number(process.env.PORT || process.env.API_PORT || 3000);
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const geoapifyApiKey = process.env.GEOAPIFY_API_KEY;
const demoLatitude = Number(process.env.DEMO_LATITUDE);
const demoLongitude = Number(process.env.DEMO_LONGITUDE);
const demoLocationName = process.env.DEMO_LOCATION_NAME || 'Capstone demonstration station';
const demoAddress = process.env.DEMO_ADDRESS;
const demoEnvironment = process.env.DEMO_ENVIRONMENT || 'indoor';
const nwsStationLimit = Math.min(Math.max(Number(process.env.NWS_STATION_LIMIT) || 5, 1), 10);

if (!supabaseUrl || !supabaseSecretKey || supabaseSecretKey.startsWith('replace-with') || !demoAddress || !Number.isFinite(demoLatitude) || !Number.isFinite(demoLongitude)) {
  console.error('Set Supabase and demo-location variables in .env before starting the server.');
  process.exit(1);
}

if (demoLatitude < -90 || demoLatitude > 90 || demoLongitude < -180 || demoLongitude > 180) {
  console.error('DEMO_LATITUDE or DEMO_LONGITUDE is outside its valid range.');
  process.exit(1);
}

if (demoEnvironment !== 'indoor' && demoEnvironment !== 'outdoor') {
  console.error('DEMO_ENVIRONMENT must be indoor or outdoor.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

app.use(express.json({ limit: '2kb' }));
app.use(express.static('frontend'));

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

function stationIdForLocation({ latitude, longitude }) {
  return `manual_${latitude.toFixed(4)}_${longitude.toFixed(4)}`;
}

async function upsertStation(location) {
  const stationId = stationIdForLocation(location);
  const { data, error } = await supabase
    .from('stations')
    .upsert({
      device_id: stationId,
      location_name: location.name,
      location_address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
      environment: demoEnvironment
    }, { onConflict: 'device_id' })
    .select('device_id, location_name, location_address, latitude, longitude, environment')
    .single();

  if (error) throw error;
  return data;
}

async function storeObservation({ temperatureC, humidityPercent, pressureHpa, source, location }) {
  const station = await upsertStation(location);
  const { data, error } = await supabase
    .from('measurements')
    .insert({
      temperature_c: temperatureC,
      humidity_percent: humidityPercent,
      pressure_hpa: pressureHpa,
      source,
      station_id: station.device_id
    })
    .select('id, received_at, temperature_c, humidity_percent, pressure_hpa, source, station_id')
    .single();

  if (error) {
    throw error;
  }

  return { ...data, station };
}

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/api/demo-config', (_request, response) => {
  response.json({
    station: {
      name: demoLocationName,
      address: demoAddress,
      latitude: demoLatitude,
      longitude: demoLongitude,
      environment: demoEnvironment,
      locationSource: 'demo_configuration'
    }
  });
});

function pascalsToHpa(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value / 100 : null;
}

function weatherValue(property) {
  return property && typeof property.value === 'number' && Number.isFinite(property.value)
    ? property.value
    : null;
}

async function fetchJson(url, headers = {}) {
  const upstreamResponse = await fetch(url, {
    headers: {
      Accept: 'application/geo+json, application/json',
      'User-Agent': 'AccessibleHyperlocalWeatherStation/0.1 (capstone educational demo)',
      ...headers
    },
    signal: AbortSignal.timeout(8000)
  });

  if (!upstreamResponse.ok) {
    throw new Error(`Weather provider returned HTTP ${upstreamResponse.status}.`);
  }

  return upstreamResponse.json();
}

async function getOpenMeteoConditions(latitude, longitude) {
  const parameters = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,relative_humidity_2m,surface_pressure',
    temperature_unit: 'celsius',
    timezone: 'auto',
    timeformat: 'unixtime'
  });
  const data = await fetchJson(`https://api.open-meteo.com/v1/forecast?${parameters}`);
  return {
    provider: 'Open-Meteo',
    kind: 'modeled_conditions',
    name: 'Model at demo location',
    latitude: data.latitude,
    longitude: data.longitude,
    observedAt: Number.isFinite(data.current?.time) ? new Date(data.current.time * 1000).toISOString() : null,
    temperatureC: data.current?.temperature_2m ?? null,
    humidityPercent: data.current?.relative_humidity_2m ?? null,
    pressureHpa: data.current?.surface_pressure ?? null,
    pressureType: 'surface_pressure'
  };
}

async function getNwsStations(latitude, longitude) {
  const stationsDocument = await fetchJson(
    `https://api.weather.gov/points/${latitude},${longitude}/stations`
  );
  const stationFeatures = (stationsDocument.features || []).slice(0, nwsStationLimit);
  const observations = await Promise.allSettled(stationFeatures.map(async (station) => {
    const stationId = station.properties?.stationIdentifier;
    const latest = await fetchJson(`https://api.weather.gov/stations/${encodeURIComponent(stationId)}/observations/latest`);
    const properties = latest.properties || {};
    const coordinates = latest.geometry?.coordinates || station.geometry?.coordinates || [];
    return {
      provider: 'National Weather Service',
      kind: 'physical_station_observation',
      stationId,
      name: station.properties?.name || stationId,
      latitude: coordinates[1],
      longitude: coordinates[0],
      observedAt: properties.timestamp || null,
      temperatureC: weatherValue(properties.temperature),
      humidityPercent: weatherValue(properties.relativeHumidity),
      pressureHpa: pascalsToHpa(weatherValue(properties.barometricPressure)),
      pressureType: 'station_pressure'
    };
  }));

  return observations
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((station) => Number.isFinite(station.latitude) && Number.isFinite(station.longitude));
}

app.get('/api/comparisons/current', async (request, response) => {
  const latitude = Number(request.query.latitude ?? demoLatitude);
  const longitude = Number(request.query.longitude ?? demoLongitude);
  if (!isNumberInRange(latitude, -90, 90) || !isNumberInRange(longitude, -180, 180)) {
    return response.status(400).json({ error: 'Valid latitude and longitude query parameters are required.' });
  }
  const [modelResult, stationsResult] = await Promise.allSettled([
    getOpenMeteoConditions(latitude, longitude),
    getNwsStations(latitude, longitude)
  ]);

  return response.json({
    retrievedAt: new Date().toISOString(),
    model: modelResult.status === 'fulfilled' ? modelResult.value : null,
    stations: stationsResult.status === 'fulfilled' ? stationsResult.value : [],
    warnings: [
      ...(modelResult.status === 'rejected' ? ['Open-Meteo conditions are currently unavailable.'] : []),
      ...(stationsResult.status === 'rejected' ? ['Nearby NWS observations are currently unavailable.'] : [])
    ]
  });
});

app.get('/api/geocode', async (request, response, next) => {
  const address = String(request.query.address || '').trim();
  if (address.length < 3 || address.length > 200) {
    return response.status(400).json({ error: 'Enter an address between 3 and 200 characters.' });
  }
  try {
    const parameters = new URLSearchParams({ q: address, format: 'jsonv2', limit: '1' });
    const results = await fetchJson(`https://nominatim.openstreetmap.org/search?${parameters}`);
    const match = results[0];
    if (!match) return response.status(404).json({ error: 'No coordinates were found for that address.' });
    return response.json({ address: match.display_name, latitude: Number(match.lat), longitude: Number(match.lon) });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/address-suggestions', async (request, response, next) => {
  if (!geoapifyApiKey) {
    return response.status(503).json({ error: 'Address autocomplete is not configured.' });
  }
  const address = String(request.query.address || '').trim();
  if (address.length < 3 || address.length > 200) {
    return response.status(400).json({ error: 'Enter between 3 and 200 address characters.' });
  }
  try {
    const parameters = new URLSearchParams({
      text: address,
      format: 'json',
      limit: '5',
      apiKey: geoapifyApiKey
    });
    const result = await fetchJson(`https://api.geoapify.com/v1/geocode/autocomplete?${parameters}`);
    const suggestions = (result.results || [])
      .map((match) => ({
        address: match.formatted,
        latitude: Number(match.lat),
        longitude: Number(match.lon)
      }))
      .filter((match) => match.address && Number.isFinite(match.latitude) && Number.isFinite(match.longitude));
    return response.json({ suggestions });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/reverse-geocode', async (request, response, next) => {
  const latitude = Number(request.query.latitude);
  const longitude = Number(request.query.longitude);
  if (!isNumberInRange(latitude, -90, 90) || !isNumberInRange(longitude, -180, 180)) {
    return response.status(400).json({ error: 'Valid latitude and longitude are required.' });
  }
  try {
    const parameters = new URLSearchParams({ lat: String(latitude), lon: String(longitude), format: 'jsonv2' });
    const result = await fetchJson(`https://nominatim.openstreetmap.org/reverse?${parameters}`);
    return response.json({ address: result.display_name || 'Current location', latitude, longitude });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/demo-observations', async (request, response, next) => {
  if (!isLocalRequest(request)) {
    return response.status(403).json({ error: 'Manual demo observations are available only from this computer.' });
  }

  const { temperatureC, humidityPercent, pressureHpa, latitude, longitude, address } = request.body;
  if (!hasValidObservationValues({ temperatureC, humidityPercent, pressureHpa })) {
    return response.status(400).json({
      error: 'Expected finite temperatureC (-40–85), humidityPercent (0–100), and pressureHpa (300–1100).'
    });
  }
  if (!isNumberInRange(latitude, -90, 90) || !isNumberInRange(longitude, -180, 180)) {
    return response.status(400).json({ error: 'Select a valid location before storing the observation.' });
  }
  const locationAddress = typeof address === 'string' && address.trim()
    ? address.trim().slice(0, 300)
    : 'Selected coordinates';

  try {
    const observation = await storeObservation({
      temperatureC,
      humidityPercent,
      pressureHpa,
      source: 'manual_browser_entry',
      location: { latitude, longitude, address: locationAddress, name: 'User-selected location' }
    });
    console.log('Manual demo observation stored:', { id: observation.id, receivedAt: observation.received_at });
    return response.status(201).json({
      accepted: true,
      receivedAt: observation.received_at,
      id: observation.id,
      source: observation.source,
      station: {
        id: observation.station.device_id,
        name: observation.station.location_name,
        address: observation.station.location_address,
        latitude: observation.station.latitude,
        longitude: observation.station.longitude,
        environment: observation.station.environment
      },
      measurement: {
        temperatureC: observation.temperature_c,
        humidityPercent: observation.humidity_percent,
        pressureHpa: observation.pressure_hpa
      }
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/measurements/recent', async (_request, response, next) => {
  try {
    const { data, error } = await supabase
      .from('measurements')
      .select('id, received_at, temperature_c, humidity_percent, pressure_hpa, source, station_id, stations!inner(device_id, location_name, location_address, latitude, longitude, environment)')
      .order('received_at', { ascending: false })
      .limit(500);

    if (error) {
      throw error;
    }

    const latestByStation = [];
    const seenStations = new Set();
    for (const measurement of data) {
      if (seenStations.has(measurement.station_id)) continue;
      seenStations.add(measurement.station_id);
      latestByStation.push(measurement);
      if (latestByStation.length === 50) break;
    }

    return response.json({ measurements: latestByStation, aggregation: 'latest_per_station' });
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
