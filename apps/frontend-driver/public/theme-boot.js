/* Copyright (c) 2026 Ada Technology. MIT License. */
/* Aplica a escolha de tema guardada antes do primeiro quadro, para a splash nascer no tema certo. */
/* A chave espelha COLOR_THEME_STORAGE_KEY (test/shared/splash.contract.ts cobra a paridade). */
try {
  var storedTheme = window.localStorage.getItem('transportada:color-theme')
  if (storedTheme === 'dark' || storedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', storedTheme)
  }
} catch (error) {
  /* Sem armazenamento: o tema segue o sistema. */
}

/* Rede de segurança da splash: se o bundle nunca montar (rede, erro de boot), ela não cobre a tela para sempre. */
window.setTimeout(function () {
  var splash = document.getElementById('splash')
  if (splash !== null) splash.remove()
}, 10000)
