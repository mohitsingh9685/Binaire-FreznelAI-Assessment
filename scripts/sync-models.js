import { rename, unlink, writeFile } from 'node:fs/promises'

const source = 'https://binaire.app/hf-models-api.json'
const target = new URL('../models.json', import.meta.url)
const temporary = new URL('../models.json.download', import.meta.url)

fetch(source)
  .then(response => {
    if (!response.ok) throw new Error(`Model download failed with status ${response.status}`)
    return response.text()
  })
  .then(text => {
    const data = JSON.parse(text)
    if (!data || !Array.isArray(data.models)) throw new Error('Downloaded model data is invalid')
    return writeFile(temporary, JSON.stringify(data)).then(() => rename(temporary, target))
  })
  .then(() => console.log('Offline model data updated'))
  .catch(error => {
    unlink(temporary).catch(() => {})
    console.error(error.message)
    process.exitCode = 1
  })
