function fetchModels(url) {
  return fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  })
    .then(response => {
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
      return response.text()
    })
    .then(text => {
      const data = JSON.parse(text)
      if (!data || !Array.isArray(data.models)) throw new Error('Invalid model data received')
      return data
    })
}

self.onmessage = event => {
  fetchModels(event.data.url)
    .catch(() => fetchModels('/models.json'))
    .then(data => {
      self.postMessage({ ok: true, data })
    })
    .catch(error => {
      self.postMessage({ ok: false, message: error.message })
    })
}
