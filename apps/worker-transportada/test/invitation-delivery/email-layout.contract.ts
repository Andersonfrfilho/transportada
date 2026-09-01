/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { buildEmailHtml } from '../../src/identity/domain/email-layout.policy.js'

const SUBJECT = 'Seu acesso ao TransportAdA'

/**
 * O corpo do e-mail entrava cru em `<p>${body}</p>`. Com o texto do template editável no painel,
 * isso deixou de ser feio e passou a ser perigoso: um `<` digitado quebra o documento, e uma tag
 * colada de outro lugar viaja para a caixa de todo mundo.
 */
describe('a moldura do e-mail', () => {
  test('escapa o que veio do template', () => {
    const html = buildEmailHtml({ body: '<script>alert(1)</script>', subject: SUBJECT })

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('escapa também o assunto, que vai no título', () => {
    const html = buildEmailHtml({ body: 'oi', subject: '<b>promoção</b>' })

    expect(html).toContain('&lt;b&gt;promoção&lt;/b&gt;')
  })

  /** Linha em branco separa parágrafo; quebra simples é `<br>`, como quem digitou espera. */
  test('respeita a quebra de linha de quem escreveu', () => {
    const html = buildEmailHtml({
      body: 'primeiro\nsegunda linha\n\noutro bloco',
      subject: SUBJECT,
    })

    expect(html).toContain('primeiro<br>segunda linha')
    expect((html.match(/<p style/gu) ?? []).length).toBe(2)
  })

  /**
   * Cliente de e-mail não é navegador: o Outlook desenha com o motor do Word e ignora flex e grid,
   * o Gmail remove `<style>` no encaminhamento, e imagem remota chega bloqueada.
   */
  test('não usa nada que o cliente de e-mail descarta', () => {
    const html = buildEmailHtml({ body: 'oi', subject: SUBJECT })

    expect(html).not.toContain('<style')
    expect(html).not.toContain('display:flex')
    expect(html).not.toContain('<img')
    expect(html).toContain('<table')
  })

  test('a marca vai como texto, não como arquivo', () => {
    expect(buildEmailHtml({ body: 'oi', subject: SUBJECT })).toContain('TransportAdA')
  })

  /** Bloco vazio não vira parágrafo vazio: espaço em branco no fim do texto é acidente comum. */
  test('bloco em branco não vira parágrafo', () => {
    const html = buildEmailHtml({ body: 'único\n\n\n\n   ', subject: SUBJECT })

    expect((html.match(/<p style/gu) ?? []).length).toBe(1)
  })
})
