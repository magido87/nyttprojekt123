import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Client } from '@googlemaps/google-maps-services-js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
  console.error('❌ GOOGLE_API_KEY saknas. Avslutar.');
  process.exit(1);
}

app.use(cors());
app.use(express.json());
app.use(express.static('public', { extensions: ['html'] }));

/**
 * Validera en tidsträng i format HH:MM, 00–23:59.
 * @param {string} t
 * @returns {boolean}
 */
function isValidTime(t) {
  return typeof t === 'string' && /^\d{2}:\d{2}$/.test(t) && (() => {
    const [h, m] = t.split(':').map(Number);
    return h >= 0 && h < 24 && m >= 0 && m < 60;
  })();
}

/**
 * Närmaste-granne heuristik för enkel TSP.
 * @param {number[][]} distMatrix 2‑D matrix med avstånd i meter
 * @returns {number[]} ordning av index
 */
function nearestNeighbour(distMatrix) {
  const n = distMatrix.length;
  const visited = new Array(n).fill(false);
  const order = [0];
  visited[0] = true;
  for (let step = 1; step < n; step++) {
    const last = order[order.length - 1];
    let best = null;
    let bestDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited[j] && distMatrix[last][j] < bestDist) {
        best = j;
        bestDist = distMatrix[last][j];
      }
    }
    if (best == null) break; // ska inte hända
    visited[best] = true;
    order.push(best);
  }
  return order;
}

app.post('/optimise', async (req, res) => {
  try {
    const { addresses, workStart, workEnd } = req.body || {};

    // ** Validering **
    if (!Array.isArray(addresses) || addresses.length < 2 || addresses.length > 23) {
      return res.status(400).json({ error: 'Fältet "addresses" måste vara en array med 2–23 adress-strängar.' });
    }
    if (!addresses.every(a => typeof a === 'string' && a.trim().length > 0)) {
      return res.status(400).json({ error: 'Varje adress måste vara en icke-tom sträng.' });
    }
    if (!isValidTime(workStart) || !isValidTime(workEnd)) {
      return res.status(400).json({ error: 'Ogiltigt tidsformat. Ange "workStart" och "workEnd" som HH:MM.' });
    }

    // ** Geokodning **
    const client = new Client({});
    const geoPromises = addresses.map(addr =>
      client.geocode({ params: { address: addr, key: GOOGLE_API_KEY } })
    );

    const geoResponses = await Promise.all(geoPromises);
    const coords = geoResponses.map((g, idx) => {
      if (!g.data.results.length) {
        throw new Error(`Geokodning misslyckades för adressen: "${addresses[idx]}"`);
      }
      return g.data.results[0].geometry.location; // {lat, lng}
    });

    // ** Avståndsmatris **
    const origins = coords.map(c => `${c.lat},${c.lng}`);
    const destinations = origins.slice();

    const dmRes = await client.distancematrix({
      params: {
        origins,
        destinations,
        mode: 'driving',
        departure_time: 'now',
        units: 'metric',
        key: GOOGLE_API_KEY
      }
    });

    const rows = dmRes.data.rows;
    if (!rows || rows.length !== origins.length) {
      throw new Error('Avståndsmatris kunde inte hämtas.');
    }

    const distMatrix = rows.map(r => r.elements.map(e => e.status === 'OK' ? e.distance.value : Infinity));
    const durMatrix = rows.map(r => r.elements.map(e => e.status === 'OK' ? e.duration.value : Infinity));

    // ** Närmaste-granne **
    const orderIdx = nearestNeighbour(distMatrix);

    // ** Summor **
    let totalMeters = 0;
    let totalSeconds = 0;
    for (let i = 0; i < orderIdx.length - 1; i++) {
      const from = orderIdx[i];
      const to = orderIdx[i + 1];
      totalMeters += distMatrix[from][to];
      totalSeconds += durMatrix[from][to];
    }

    const ordered = orderIdx.map(i => addresses[i]);
    const totalDistanceKm = Math.round(totalMeters / 100) / 10; // 1 decimal
    const totalDurationMin = Math.round(totalSeconds / 60); // heltal

    res.json({
      ordered,
      totalDistanceKm,
      totalDurationMin,
      coordinates: orderIdx.map(i => coords[i]),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internt serverfel' });
  }
});

app.listen(PORT, () => {
  console.log(`🚚 Ruttoptimerare körs på http://localhost:${PORT}`);
});
