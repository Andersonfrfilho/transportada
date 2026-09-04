/*
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A escolha de tema é do painel, e o painel é outra origem: este script recebe a cópia dela pela
 * URL de login e a aplica aqui. Sem isto o Keycloak só conhece o `prefers-color-scheme`, e quem usa
 * o sistema no escuro com o painel no claro atravessa duas identidades no mesmo gesto.
 *
 * ⚠️ Ele roda **antes** da folha de estilo, sem `defer`, e por isso não está no `theme.properties`:
 * o atributo precisa existir no `<html>` antes da primeira pintura, senão a tela pisca no tema
 * errado. Nada aqui toca o DOM além do elemento raiz — na hora em que roda, o `<body>` não existe.
 *
 * ⚠️ O espelho no `localStorage` é do fluxo, não uma segunda preferência: só a primeira tela
 * carrega o parâmetro, e as seguintes (`/login-actions/…`, troca de senha, sessão expirada) o
 * perderam. Toda entrada nova reescreve o espelho, então ele nunca sobrevive a uma troca no painel.
 */
;(function applyColorThemeFromLoginUrl() {
  var PARAM = 'transportada_theme'
  var STORAGE_KEY = 'transportada:color-theme'
  var THEMES = ['dark', 'light']

  function isTheme(value) {
    return THEMES.indexOf(value) !== -1
  }

  function readStorage() {
    /* Aba anônima e cookies bloqueados atiram aqui; sem espelho o sistema decide, que é o certo. */
    try {
      return window.localStorage.getItem(STORAGE_KEY)
    } catch (error) {
      return null
    }
  }

  function writeStorage(theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch (error) {
      /* Guardar é conveniência da próxima tela, nunca condição para esta. */
    }
  }

  var requested = new URLSearchParams(window.location.search).get(PARAM)

  if (isTheme(requested)) {
    document.documentElement.setAttribute('data-theme', requested)
    writeStorage(requested)
    return
  }

  var mirrored = readStorage()

  if (isTheme(mirrored)) {
    document.documentElement.setAttribute('data-theme', mirrored)
  }
})()
