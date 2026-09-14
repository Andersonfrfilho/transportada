/* Copyright (c) 2026 Ada Technology. MIT License. */

/*
 * A recuperação de senha é tela nossa, servida pelo frontend, e o Keycloak não sabe o endereço
 * dele. O `redirect_uri` da própria requisição de login é a única origem confiável aqui — sem ela
 * o link continua escondido, em vez de levar o operador para lugar nenhum.
 *
 * O "Não é você?" da tela só de senha usa a mesma origem quando o deploy não a declarou: a raiz do
 * app, sem sessão, é a tela de identificação.
 */
;(function revealPasswordResetLink() {
  var LINKS = [
    { selector: '[data-password-reset]', path: '/recuperar-senha' },
    { selector: '[data-identity-restart]', path: '/' },
  ]

  function resolveApplicationUrl(path) {
    try {
      var redirectUri = new URLSearchParams(window.location.search).get('redirect_uri')
      if (redirectUri === null) return null

      return new URL(path, new URL(redirectUri).origin).href
    } catch (error) {
      return null
    }
  }

  function render() {
    LINKS.forEach(function revealLink(entry) {
      var link = document.querySelector(entry.selector)
      if (link === null || !link.hidden) return

      var href = resolveApplicationUrl(entry.path)
      if (href === null) return

      link.href = href
      link.hidden = false
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render)
    return
  }

  render()
})()
