/* Copyright (c) 2026 Ada Technology. MIT License. */

/*
 * A recuperação de senha é tela nossa, servida pelo frontend, e o Keycloak não sabe o endereço
 * dele. O `redirect_uri` da própria requisição de login é a origem confiável aqui — sem ela o link
 * continua escondido, em vez de levar o operador para lugar nenhum.
 */
;(function revealPasswordResetLink() {
  var LINKS = [
    { selector: '[data-password-reset]', path: '/recuperar-senha' },
    { selector: '[data-identity-restart]', path: '/' },
  ]

  /**
   * O `redirect_uri` da requisição de login é a origem de onde a pessoa veio — painel ou portal —, e
   * por isso tem prioridade sobre qualquer variável fixa do deploy. Só quando ele não existir (ou não
   * for uma URL válida) é que o link cai no `data-fallback-origin` de cada elemento, lido do
   * `applicationOrigin` do `theme.properties`.
   */
  function resolveRedirectOrigin() {
    try {
      var redirectUri = new URLSearchParams(window.location.search).get('redirect_uri')
      if (redirectUri === null) return null

      return new URL(redirectUri).origin
    } catch (error) {
      return null
    }
  }

  function render() {
    var redirectOrigin = resolveRedirectOrigin()

    LINKS.forEach(function revealLink(entry) {
      var link = document.querySelector(entry.selector)
      if (link === null) return

      var origin = redirectOrigin !== null ? redirectOrigin : link.dataset.fallbackOrigin || null
      if (origin === null || origin === '') return

      link.href = new URL(entry.path, origin).href
      link.hidden = false
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render)
    return
  }

  render()
})()
