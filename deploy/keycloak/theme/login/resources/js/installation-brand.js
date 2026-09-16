/*
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O nome e o logo da transportadora moram na API (`/public/landing-settings`), não no realm: o
 * `displayName` é digitado à mão e envelhece. Este script põe a marca da API na porta de entrada.
 *
 * ⚠️ Roda **sem `defer`**, logo depois da seção da marca: a marca guardada da última visita é
 * aplicada antes da primeira pintura, e a tela nunca mostra o produto para trocar pela empresa. A
 * API só confirma por trás, e o DOM só muda se o dado vier diferente.
 *
 * ⚠️ Leitura sem nome não apaga a marca guardada: API fora do ar responde igual instalação sem nome,
 * e trocar a empresa pelo produto por uma queda de rede é a piscada que se quer evitar.
 */
;(function applyInstallationBrand() {
  var STORAGE_KEY = 'transportada:installation-brand'
  var SETTINGS_PATH = '/public/landing-settings'
  var LOGO_PATH = '/public/landing-logo'
  var section = document.querySelector('[data-brand-api]')
  if (!section) return

  var apiOrigin = section.getAttribute('data-brand-api') || ''
  var fallbackName = section.getAttribute('data-brand-fallback') || ''
  var wordmark = section.querySelector('[data-brand-name]')
  var logo = section.querySelector('[data-brand-logo]')
  if (apiOrigin.indexOf('http') !== 0 || !wordmark || !logo) return

  function readStorage() {
    try {
      var parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null')
      return parsed && typeof parsed.name === 'string' ? parsed : null
    } catch (error) {
      return null
    }
  }

  function writeStorage(brand) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(brand))
    } catch (error) {
      /* Aba anônima ou cota cheia: a marca só não nasce pronta na próxima visita. */
    }
  }

  /* Mesmo corte do `template.ftl`: acima de 12 letras o corpo desce um degrau, acima de 22, dois. */
  function lengthClass(name) {
    if (name.length > 22) return 'brand-length-very-long'
    return name.length > 12 ? 'brand-length-long' : ''
  }

  function render(brand) {
    section.classList.remove('brand-length-long', 'brand-length-very-long')
    var sizeClass = lengthClass(brand.name)
    if (sizeClass !== '') section.classList.add(sizeClass)
    if (wordmark.textContent !== brand.name) wordmark.textContent = brand.name
    section.setAttribute('aria-label', brand.name)
    if (brand.hasLogo && logo.getAttribute('src') !== brand.logoUrl)
      logo.setAttribute('src', brand.logoUrl)
    logo.hidden = !brand.hasLogo
    section.classList.remove('brand-pending')
  }

  function readOwnName(data) {
    if (data && typeof data.brandName === 'string' && data.brandName.trim() !== '') {
      return data.brandName.trim()
    }
    var unit = data && Array.isArray(data.units) ? data.units[0] : null
    return unit && typeof unit.tradeName === 'string' && unit.tradeName.trim() !== ''
      ? unit.tradeName.trim()
      : null
  }

  var cached = readStorage()
  if (cached) render(cached)

  logo.addEventListener('error', function hideMissingLogo() {
    logo.hidden = true
  })

  fetch(apiOrigin + SETTINGS_PATH, { credentials: 'omit' })
    .then(function (response) {
      return response.ok ? response.json() : null
    })
    .then(function (body) {
      var name = readOwnName(body && body.data)
      if (name === null) {
        if (!cached) render({ hasLogo: false, logoUrl: '', name: fallbackName })
        return
      }
      var brand = { hasLogo: true, logoUrl: apiOrigin + LOGO_PATH, name: name }
      writeStorage(brand)
      render(brand)
    })
    .catch(function () {
      if (!cached) render({ hasLogo: false, logoUrl: '', name: fallbackName })
    })
})()
