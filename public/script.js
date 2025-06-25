const btn = document.getElementById('runBtn');
const addressesEl = document.getElementById('addresses');
const workStartEl = document.getElementById('workStart');
const workEndEl = document.getElementById('workEnd');
const resultsEl = document.getElementById('results');
const orderedListEl = document.getElementById('orderedList');
const summaryEl = document.getElementById('summary');
const mapFrameEl = document.getElementById('mapFrame');

// Byt ut om du vill hämta från backend
let GOOGLE_EMBED_KEY = 'DIN_GOOGLE_EMBED_KEY';

btn.addEventListener('click', async () => {
  const addresses = addressesEl.value
    .split('\n')
    .map(a => a.trim())
    .filter(Boolean);

  const workStart = workStartEl.value;
  const workEnd = workEndEl.value;

  if (addresses.length < 2) {
    alert('Minst två adresser krävs.');
    return;
  }
  try {
    btn.disabled = true;
    btn.textContent = 'Optimerar…';

    const res = await fetch('/optimise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses, workStart, workEnd })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Okänt fel');
    }

    const data = await res.json();
    renderResults(data);

  } catch (err) {
    alert(err.message);
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Kör!';
  }
});

function renderResults(data) {
  orderedListEl.innerHTML = '';
  data.ordered.forEach(addr => {
    const li = document.createElement('li');
    li.textContent = addr;
    orderedListEl.appendChild(li);
  });

  summaryEl.textContent = `Total distans: ${data.totalDistanceKm} km · Total tid: ${data.totalDurationMin} min`;

  const [origin, ...rest] = data.ordered;
  const destination = rest.pop() || origin;
  const waypoints = rest.join('|');

  const mapUrl = `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(
    GOOGLE_EMBED_KEY
  )}&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(
    destination
  )}&waypoints=${encodeURIComponent(waypoints)}&mode=driving`;

  mapFrameEl.src = mapUrl;
  resultsEl.classList.remove('hidden');
}
