/* Loads MapLibre GL JS 6 for the vector "Map" layer.
 *
 * MapLibre 6 only ships as an ES module, but the Leaflet plugin and app.js are classic scripts
 * that expect a global `maplibregl`. This module runs before them (they are `defer` and come
 * after it in index.html, and the browser runs them in that order), so it sets the global first.
 *
 * Integrity: the import below is checked by the <link rel="modulepreload" integrity> in
 * index.html, which fetches the same URL first. MapLibre would load its worker from unpkg without
 * any check, so the worker is fetched here with its hash and handed over as a local blob instead.
 * Keep both hashes in step with LIB_INTEGRITY in sw.js.
 *
 * If anything here fails, `maplibregl` stays undefined or mapLibreReady rejects, and app.js shows
 * the Esri street map instead. */
import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl.mjs';

const WORKER = 'https://unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl-worker.mjs';
const WORKER_INTEGRITY = 'sha384-bFMCdo+41ozOqjqQ5s+XmCW14ORz7o11KR04vuUouko65bE1KkGqbN3/z4wUS5Q4';

window.maplibregl = maplibregl;

// app.js waits for this before it first shows the vector map, because MapLibre starts its
// worker as soon as a map is created.
window.mapLibreReady = fetch(WORKER, { mode: 'cors', credentials: 'omit', integrity: WORKER_INTEGRITY })
  .then(res => {
    if (!res.ok) throw new Error('MapLibre worker HTTP ' + res.status);
    return res.arrayBuffer();
  })
  .then(buf => {
    // Kept for the life of the page: MapLibre may start more workers later.
    maplibregl.setWorkerUrl(URL.createObjectURL(new Blob([buf], { type: 'text/javascript' })));
    return true;
  });
// app.js handles a failure itself; this only stops an "uncaught" console error before it does.
window.mapLibreReady.catch(() => {});
