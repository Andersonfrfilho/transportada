/* Copyright (c) 2026 Ada Technology. MIT License. */
/* Se a instalação já mostrou a marca da transportadora, a splash a usa no lugar do ícone do produto. */
/* A chave espelha INSTALLATION_BRAND_STORAGE_KEY e o `variant=white` espelha WHITE_LOGO_QUERY de */
/* colorTheme.service.ts (test/shared/splash.contract.ts cobra a paridade). Primeira abertura, sem */
/* marca guardada ou logo que não carrega: fica o ícone do produto. */
try {
  var splash = document.getElementById('splash')
  var raw = window.localStorage.getItem('transportada.installation-brand.v1')
  var brand = raw === null ? null : JSON.parse(raw)
  var logoUrl = brand !== null && typeof brand.logoUrl === 'string' ? brand.logoUrl : ''
  /* Sem marca guardada (primeira abertura do aparelho): tenta o logo público da instalação. O ícone */
  /* do produto fica à vista até a imagem carregar, e continua se não houver logo ou a rede falhar. */
  var isFirstOpen = logoUrl === ''
  if (isFirstOpen) {
    var apiMeta = document.querySelector('meta[name="splash-api-url"]')
    var apiUrl = apiMeta === null ? '' : (apiMeta.getAttribute('content') || '').replace(/\/$/, '')
    logoUrl = /^https?:\/\//.test(apiUrl) ? apiUrl + '/public/landing-logo' : ''
  }
  if (splash !== null && /^(https?:)?\//.test(logoUrl)) {
    var storedTheme = document.documentElement.getAttribute('data-theme')
    var isDark =
      storedTheme === 'dark' ||
      (storedTheme !== 'light' && !window.matchMedia('(prefers-color-scheme: light)').matches)
    var image = new window.Image()
    image.alt = ''
    image.className = 'splash-company'
    image.onload = function () {
      splash.classList.add('has-company')
      if (isFirstOpen) splash.classList.add('has-brand')
    }
    image.onerror = function () {
      image.remove()
      splash.classList.remove('has-brand')
    }
    image.src = isDark
      ? logoUrl + (logoUrl.indexOf('?') === -1 ? '?' : '&') + 'variant=white'
      : logoUrl
    /* Com marca guardada o ícone do produto já sai: o logo da transportadora é quem entra, sem piscada. */
    if (!isFirstOpen) splash.classList.add('has-brand')
    splash.appendChild(image)
  }
} catch (error) {
  /* Sem armazenamento ou marca ilegível: o ícone do produto fica. */
}
