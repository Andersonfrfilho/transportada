/* Copyright (c) 2026 Ada Technology. MIT License. */

/*
 * A recuperação de senha é tela nossa, servida pelo frontend, e o Keycloak não sabe o endereço
 * dele. O `redirect_uri` da própria requisição de login é a única origem confiável aqui — sem ela
 * o link continua escondido, em vez de levar o operador para lugar nenhum.
 */
;(function revealPasswordResetLink() {
  var PATH = '/recuperar-senha'

  function resolveResetUrl() {
    try {
      var redirectUri = new URLSearchParams(window.location.search).get('redirect_uri')
      if (redirectUri === null) return null

      return new URL(PATH, new URL(redirectUri).origin).href
    } catch (error) {
      return null
    }
  }

  function render() {
    var link = document.querySelector('[data-password-reset]')
    if (link === null) return

    var href = resolveResetUrl()
    if (href === null) return

    link.href = href
    link.hidden = false
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render)
    return
  }

  render()
})()
