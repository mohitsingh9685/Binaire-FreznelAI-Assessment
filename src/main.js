import './auth.js'
import './offline.js'

const MODEL_API_URL = '/model-api'
const CACHE_KEY = 'freznel-model-data-v1'

function debounce(callback, delay) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => callback(...args), delay)
  }
}

function throttle(callback, delay) {
  let waiting = false
  let lastArgs = null

  const execute = () => {
    if (lastArgs) {
      callback(...lastArgs)
      lastArgs = null
      setTimeout(execute, delay)
    } else {
      waiting = false
    }
  }

  return (...args) => {
    if (waiting) {
      lastArgs = args
      return
    }
    callback(...args)
    waiting = true
    setTimeout(execute, delay)
  }
}

function fileCount(value) {
  const number = Number.parseInt(value, 10)
  return Number.isFinite(number) ? number : 0
}

function escapeHtml(value) {
  const characters = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }

  return String(value ?? '').replace(/[&<>"']/g, character => characters[character])
}

class ModelService {
  constructor(url) {
    this.url = url
  }

  isValid(data) {
    return Boolean(data && Array.isArray(data.models))
  }

  readCache() {
    try {
      const data = JSON.parse(localStorage.getItem(CACHE_KEY))
      return this.isValid(data) ? data : null
    } catch {
      localStorage.removeItem(CACHE_KEY)
      return null
    }
  }

  writeCache(data) {
    try {
      const text = JSON.stringify(data)
      const checkedData = JSON.parse(text)
      if (this.isValid(checkedData)) localStorage.setItem(CACHE_KEY, text)
    } catch {
      return false
    }
    return true
  }

  fetchInBackground() {
    return new Promise((resolve, reject) => {
      const worker = new Worker('/model-worker.js')
      const timeout = setTimeout(() => {
        worker.terminate()
        reject(new Error('The model request timed out'))
      }, 20000)

      worker.onmessage = event => {
        clearTimeout(timeout)
        worker.terminate()
        if (event.data.ok) resolve(event.data.data)
        else reject(new Error(event.data.message))
      }

      worker.onerror = () => {
        clearTimeout(timeout)
        worker.terminate()
        reject(new Error('The background request failed'))
      }

      worker.postMessage({ url: this.url })
    })
  }

  load(onRefresh) {
    const cachedData = this.readCache()

    if (cachedData) {
      this.fetchInBackground()
        .then(data => {
          this.writeCache(data)
          onRefresh(data.models)
        })
        .catch(() => {})

      return Promise.resolve({ models: cachedData.models, source: 'cache' })
    }

    return this.fetchInBackground().then(data => {
      if (!this.isValid(data)) throw new Error('The API returned invalid model data')
      this.writeCache(data)
      return { models: data.models, source: 'api' }
    })
  }
}

class ModelCollection {
  constructor() {
    this.models = []
    this.filters = this.defaultFilters()
  }

  defaultFilters() {
    return {
      query: '',
      searchField: 'name',
      pipeline: '',
      family: '',
      architecture: '',
      weight: '',
      minFiles: '',
      maxFiles: '',
      sort: ''
    }
  }

  setModels(models) {
    this.models = models
  }

  setFilters(filters) {
    this.filters = filters
  }

  resetFilters() {
    this.filters = this.defaultFilters()
  }

  tags(model, name) {
    const value = model.hf_tags?.[name]
    if (Array.isArray(value) && value.length > 0) return value
    if (typeof value === 'string' && value.length > 0) return [value]
    if (name === 'architecture' && model.architecture_category) return [model.architecture_category]
    return []
  }

  uniqueValues(name) {
    const values = new Set()

    this.models.forEach(model => {
      if (name === 'pipeline' && model.hf_tags?.pipeline_tag) values.add(model.hf_tags.pipeline_tag)
      if (name === 'family' && model.family) values.add(model.family)
      if (name === 'architecture') this.tags(model, 'architecture').forEach(value => values.add(value))
      if (name === 'weight' && model.weight_format) values.add(model.weight_format)
    })

    return [...values].sort((first, second) => String(first).localeCompare(String(second)))
  }

  visibleModels() {
    const query = this.filters.query.trim().toLowerCase()
    const queryTokens = query ? query.split(/\s+/).filter(Boolean) : []
    let minimum = Number(this.filters.minFiles)
    if (isNaN(minimum) || this.filters.minFiles === '' || minimum < 0) minimum = 0
    let maximum = Number(this.filters.maxFiles)
    if (isNaN(maximum) || this.filters.maxFiles === '' || maximum < 0) maximum = Infinity
    if (minimum > maximum) {
      const temp = minimum
      minimum = maximum
      maximum = temp
    }

    const visible = this.models.filter(model => {
      let searchValue = ''
      if (this.filters.searchField === 'family') {
        searchValue = model.family || ''
      } else if (this.filters.searchField === 'all') {
        const archTags = this.tags(model, 'architecture').join(' ')
        searchValue = `${model.display_name || ''} ${model.id || ''} ${model.family || ''} ${model.author_namespace || ''} ${model.use_case || ''} ${model.hf_tags?.pipeline_tag || ''} ${archTags}`
      } else {
        searchValue = `${model.display_name || ''} ${model.id || ''}`
      }

      const searchTarget = searchValue.toLowerCase()
      const matchesSearch = queryTokens.length === 0 || queryTokens.every(token => searchTarget.includes(token))
      const count = fileCount(model.safetensor_file_count)

      return matchesSearch
        && (!this.filters.pipeline || model.hf_tags?.pipeline_tag === this.filters.pipeline)
        && (!this.filters.family || model.family === this.filters.family)
        && (!this.filters.architecture || this.tags(model, 'architecture').includes(this.filters.architecture))
        && (!this.filters.weight || model.weight_format === this.filters.weight)
        && count >= minimum
        && count <= maximum
    })

    if (this.filters.sort === 'name-asc') {
      visible.sort((first, second) => String(first.display_name).localeCompare(String(second.display_name)))
    }

    if (this.filters.sort === 'name-desc') {
      visible.sort((first, second) => String(second.display_name).localeCompare(String(first.display_name)))
    }

    if (this.filters.sort === 'files-asc') {
      visible.sort((first, second) => fileCount(first.safetensor_file_count) - fileCount(second.safetensor_file_count))
    }

    if (this.filters.sort === 'files-desc') {
      visible.sort((first, second) => fileCount(second.safetensor_file_count) - fileCount(first.safetensor_file_count))
    }

    return visible
  }
}

class ModelApp {
  constructor() {
    this.service = new ModelService(MODEL_API_URL)
    this.collection = new ModelCollection()
    this.selectedId = ''
    this.elements = {
      connectionBadge: document.querySelector('#connectionBadge'),
      connectionText: document.querySelector('#connectionText'),
      clearFilters: document.querySelector('#clearFilters'),
      searchField: document.querySelector('#searchField'),
      searchInput: document.querySelector('#searchInput'),
      pipeline: document.querySelector('#pipelineFilter'),
      family: document.querySelector('#familyFilter'),
      architecture: document.querySelector('#architectureFilter'),
      weight: document.querySelector('#weightFilter'),
      minFiles: document.querySelector('#minFiles'),
      maxFiles: document.querySelector('#maxFiles'),
      sort: document.querySelector('#sortSelect'),
      resultCount: document.querySelector('#resultCount'),
      totalCount: document.querySelector('#totalCount'),
      dataStatus: document.querySelector('#dataStatus'),
      selectedModel: document.querySelector('#selectedModel'),
      selectedModelName: document.querySelector('#selectedModelName'),
      selectedModelLink: document.querySelector('#selectedModelLink'),
      deselectModel: document.querySelector('#deselectModel'),
      message: document.querySelector('#message'),
      modelList: document.querySelector('#modelList')
    }
  }

  start() {
    this.bindEvents()
    this.updateConnection()
    window.addEventListener('online', () => this.updateConnection())
    window.addEventListener('offline', () => this.updateConnection())
    this.loadData()
  }

  loadData() {
    this.elements.dataStatus.textContent = 'Loading model data...'
    this.service.load(models => {
      this.useModels(models)
      this.elements.dataStatus.textContent = 'Data refreshed in background'
    })
      .then(result => {
        this.useModels(result.models)
        this.elements.dataStatus.textContent = result.source === 'cache'
          ? 'Loaded from saved data'
          : 'Loaded from API'
      })
      .catch(error => this.showError(error.message))
  }

  bindEvents() {
    const delayedSearch = debounce(() => this.applyFilters(), 300)
    const limitedFilter = throttle(() => this.applyFilters(), 150)

    this.elements.searchInput.addEventListener('input', delayedSearch)
    this.elements.searchField.addEventListener('change', () => this.applyFilters())
    this.elements.pipeline.addEventListener('change', limitedFilter)
    this.elements.family.addEventListener('change', limitedFilter)
    this.elements.architecture.addEventListener('change', limitedFilter)
    this.elements.weight.addEventListener('change', limitedFilter)
    this.elements.minFiles.addEventListener('input', limitedFilter)
    this.elements.maxFiles.addEventListener('input', limitedFilter)
    this.elements.sort.addEventListener('change', () => this.applyFilters())
    this.elements.clearFilters.addEventListener('click', () => this.clearFilters())
    this.elements.deselectModel?.addEventListener('click', () => this.clearSelected())

    this.elements.modelList.addEventListener('click', event => {
      const button = event.target.closest('[data-model-id]')
      if (button) this.selectModel(button.dataset.modelId)
    })
  }

  updateConnection() {
    const online = navigator.onLine
    this.elements.connectionBadge.classList.toggle('is-online', online)
    this.elements.connectionBadge.classList.toggle('is-offline', !online)
    this.elements.connectionText.textContent = online ? 'Online' : 'Offline'

    if (!online && this.collection.models.length) {
      this.elements.dataStatus.textContent = 'Using saved model data'
    }
  }

  useModels(models) {
    this.collection.setModels(models)
    this.fillSelect(this.elements.pipeline, this.collection.uniqueValues('pipeline'), 'All pipelines')
    this.fillSelect(this.elements.family, this.collection.uniqueValues('family'), 'All families')
    this.fillSelect(this.elements.architecture, this.collection.uniqueValues('architecture'), 'All architectures')
    this.fillSelect(this.elements.weight, this.collection.uniqueValues('weight'), 'All weight formats')
    this.elements.totalCount.textContent = models.length
    
    const maxFiles = models.reduce((max, model) => Math.max(max, fileCount(model.safetensor_file_count)), 0)
    this.elements.maxFiles.max = maxFiles
    this.elements.minFiles.max = maxFiles
    
    this.applyFilters()
  }

  fillSelect(select, values, firstLabel) {
    const currentValue = select.value
    select.replaceChildren(new Option(firstLabel, ''))
    values.forEach(value => select.add(new Option(value, value)))
    if (values.includes(currentValue)) select.value = currentValue
  }

  applyFilters() {
    this.collection.setFilters({
      query: this.elements.searchInput.value,
      searchField: this.elements.searchField.value,
      pipeline: this.elements.pipeline.value,
      family: this.elements.family.value,
      architecture: this.elements.architecture.value,
      weight: this.elements.weight.value,
      minFiles: this.elements.minFiles.value,
      maxFiles: this.elements.maxFiles.value,
      sort: this.elements.sort.value
    })
    this.render()
  }

  clearFilters() {
    this.elements.searchInput.value = ''
    this.elements.searchField.value = 'name'
    this.elements.pipeline.value = ''
    this.elements.family.value = ''
    this.elements.architecture.value = ''
    this.elements.weight.value = ''
    this.elements.minFiles.value = ''
    this.elements.maxFiles.value = ''
    this.elements.sort.value = ''
    this.collection.resetFilters()
    this.render()
  }

  selectModel(id) {
    if (this.selectedId === id) {
      this.clearSelected()
      return
    }

    const model = this.collection.models.find(item => item.id === id)
    if (!model) return

    this.selectedId = id
    this.elements.selectedModel.hidden = false
    this.elements.selectedModelName.textContent = model.display_name
    this.elements.selectedModelLink.href = model.repo_url
    this.render()
  }

  clearSelected() {
    this.selectedId = ''
    this.elements.selectedModel.hidden = true
    this.elements.selectedModelName.textContent = ''
    this.elements.selectedModelLink.href = '#'
    this.render()
  }

  showError(message) {
    this.elements.dataStatus.textContent = 'Unable to load data'
    this.elements.message.hidden = false
    this.elements.message.classList.add('is-error')
    this.elements.message.innerHTML = `
      <strong>Models could not be loaded</strong>
      <p>${escapeHtml(message)}</p>
      <button id="retryLoad" class="spectrum-Button spectrum-Button--fill spectrum-Button--secondary retry-button" type="button">
        <span class="spectrum-Button-label">Retry</span>
      </button>
    `
    this.elements.message.querySelector('#retryLoad')?.addEventListener('click', () => {
      this.elements.message.classList.remove('is-error')
      this.elements.message.innerHTML = '<span class="loader"></span><p class="spectrum-Body spectrum-Body--sizeS">Loading models...</p>'
      this.loadData()
    })
  }

  render() {
    const models = this.collection.visibleModels()
    this.elements.resultCount.textContent = models.length

    if (!models.length) {
      this.elements.message.hidden = false
      this.elements.message.classList.remove('is-error')
      this.elements.message.innerHTML = '<strong>No models found</strong><p>Try changing or clearing the filters.</p>'
      this.elements.modelList.innerHTML = ''
      return
    }

    this.elements.message.hidden = true
    this.elements.modelList.innerHTML = models.map(model => this.modelCard(model)).join('')
  }

  modelCard(model) {
    const pipeline = model.hf_tags?.pipeline_tag || 'No pipeline tag'
    const architecture = this.collection.tags(model, 'architecture')[0] || model.architecture_category || 'Unknown'
    const rawFileCount = model.safetensor_file_count
    const files = Number.isFinite(Number.parseInt(rawFileCount, 10)) ? `${rawFileCount} files` : 'File count TBD'
    const selected = model.id === this.selectedId

    return `
      <article class="spectrum-Card model-card ${selected ? 'is-selected' : ''}">
        <div class="model-card-main">
          <div class="model-title-row">
            <div>
              <h3 class="spectrum-Heading spectrum-Heading--sizeXS">${escapeHtml(model.display_name)}</h3>
              <p class="spectrum-Body spectrum-Body--sizeXS">${escapeHtml(model.id)}</p>
            </div>
            <span class="file-count">${escapeHtml(files)}</span>
          </div>
          <div class="tag-list">
            <span>${escapeHtml(pipeline)}</span>
            <span>${escapeHtml(model.family || 'Unknown family')}</span>
            <span>${escapeHtml(architecture)}</span>
            <span>${escapeHtml(model.weight_format || 'Unknown weight')}</span>
          </div>
        </div>
        <div class="model-actions">
          <a class="spectrum-Link" href="${escapeHtml(model.repo_url)}" target="_blank" rel="noopener noreferrer">View details</a>
          <button class="spectrum-Button spectrum-Button--fill spectrum-Button--accent" type="button" data-model-id="${escapeHtml(model.id)}">
            <span class="spectrum-Button-label">${selected ? 'Selected' : 'Select model'}</span>
          </button>
        </div>
      </article>
    `
  }
}

new ModelApp().start()
