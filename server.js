import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'

const root = process.cwd()
const host = '127.0.0.1'
const port = 5173
const modelApi = 'https://binaire.app/hf-models-api.json'

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
}

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#3b82f6"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-weight="700" font-size="24">F</text></svg>`

function sendModels(response) {
  fetch(modelApi, { headers: { Accept: 'application/json' } })
    .then(upstream => {
      if (!upstream.ok) throw new Error(`Upstream status ${upstream.status}`)
      return upstream.text()
    })
    .then(text => {
      response.writeHead(200, { 'Content-Type': contentTypes['.json'] })
      response.end(text)
    })
    .catch(() => {
      response.writeHead(502, { 'Content-Type': contentTypes['.json'] })
      response.end('{"error":"Model API unavailable"}')
    })
}

function sendFile(response, path) {
  stat(path)
    .then(details => {
      if (!details.isFile()) throw new Error('Not a file')
      response.writeHead(200, { 'Content-Type': contentTypes[extname(path)] || 'application/octet-stream' })
      createReadStream(path).pipe(response)
    })
    .catch(() => {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Not found')
    })
}

createServer((request, response) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host || 'localhost:5173'}`)

  if (pathname === '/favicon.ico') {
    response.writeHead(200, { 'Content-Type': 'image/svg+xml' })
    response.end(faviconSvg)
    return
  }

  if (pathname === '/model-api') {
    sendModels(response)
    return
  }

  const target = join(root, normalize(decodeURIComponent(pathname)))

  if (target !== root && !target.startsWith(root + sep)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Forbidden')
    return
  }

  sendFile(response, pathname === '/' ? join(root, 'index.html') : target)
}).listen(port, () => {
  console.log(`App running at http://localhost:${port}`)
})
