/* Copyright (c) 2026 Ada Technology. MIT License. */

/*
 * O botão nasce `hidden` no markup e só é revelado aqui: sem script ele não teria como alternar o
 * campo, e um olho que não abre nada é pior do que olho nenhum.
 */
;(function enablePasswordVisibilityToggle() {
  function bind(button) {
    var input = document.getElementById(button.getAttribute('aria-controls'))
    if (input === null) return

    button.hidden = false
    button.addEventListener('click', function toggleVisibility() {
      var willReveal = input.type === 'password'

      input.type = willReveal ? 'text' : 'password'
      button.setAttribute('aria-pressed', willReveal ? 'true' : 'false')
      button.setAttribute(
        'aria-label',
        willReveal
          ? button.getAttribute('data-label-hide')
          : button.getAttribute('data-label-show'),
      )
      /* O clique tira o foco do campo; devolver evita que a pessoa tenha que voltar com o mouse. */
      input.focus()
    })
  }

  function render() {
    var buttons = document.querySelectorAll('[data-password-toggle]')
    for (var index = 0; index < buttons.length; index += 1) {
      bind(buttons[index])
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render)
    return
  }

  render()
})()
