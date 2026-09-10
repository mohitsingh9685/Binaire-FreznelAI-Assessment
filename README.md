# Freznel Model Selector

Vanilla JavaScript app to search, filter and sort models from the Binaire models API. UI built with Adobe Spectrum CSS, loaded from a CDN. No framework, no build step.

## Run

```
npm start
```

Open http://localhost:5173 (use `localhost`, it is the domain authorised in Firebase). `server.js` also proxies `/model-api`, because the models API sends no CORS headers.

For Firebase, copy `src/firebase-config.example.js` to `src/firebase-config.js` and paste your web app values in.

## Fetch without async/await

The download runs in a Web Worker so the UI never freezes, and uses promise chaining instead of `async`/`await`:

```js
fetch(url).then(response => response.text()).then(text => JSON.parse(text))
```

`async`/`await` is only syntax over promises, so `.then()` behaves the same. The worker returns the data with `postMessage`.

## Keeping a large JSON file safe

The response is read fully and then parsed, so a cut-off download is invalid JSON and throws instead of being used. `response.ok` is checked first, and the result must contain a `models` array or it is rejected. When saving the offline copy, `scripts/sync-models.js` writes `models.json.download` and renames it over `models.json` only after parsing succeeds, so an interrupted download cannot corrupt the existing file.
