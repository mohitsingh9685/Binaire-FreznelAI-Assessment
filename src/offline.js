class OfflineSupport {
  start() {
    if (!('serviceWorker' in navigator)) return

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          const sendUrls = () => this.cacheFiles(registration)
          if (registration.active) {
            sendUrls()
          } else {
            const worker = registration.installing || registration.waiting
            if (worker) {
              worker.addEventListener('statechange', () => {
                if (worker.state === 'activated' || worker.state === 'installed') sendUrls()
              })
            }
          }
        })
        .catch(() => {})
    })
  }

  cacheFiles(registration) {
    const urls = new Set([
      '/',
      '/index.html',
      '/model-worker.js',
      '/models.json',
      '/model-api'
    ])

    performance.getEntriesByType('resource').forEach(entry => {
      const url = new URL(entry.name)
      const vendorAsset = (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))
        || url.hostname === 'cdn.jsdelivr.net'
      if (url.origin === window.location.origin || vendorAsset) urls.add(url.href)
    })

    const target = registration.active || navigator.serviceWorker.controller
    target?.postMessage({
      type: 'CACHE_FILES',
      urls: [...urls]
    })
  }
}

new OfflineSupport().start()
