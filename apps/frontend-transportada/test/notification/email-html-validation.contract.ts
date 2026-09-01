/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  EMAIL_GMAIL_CLIP_BYTES,
  EMAIL_HTML_PROBLEM,
  validateEmailHtml,
} from '../../src/modules/notification/shared/emailHtml.validation'

function codesOf(html: string): readonly string[] {
  return validateEmailHtml(html).problems.map((problem) => problem.code)
}

/**
 * Não é validação de HTML: um documento válido chega quebrado o tempo todo. O Outlook desenha com o
 * motor do Word, o Gmail remove `<style>` no encaminhamento e corta acima de 102 KB, e imagem remota
 * chega bloqueada. O que se mede é a distância entre "HTML correto" e "HTML que sobrevive à entrega".
 */
describe('o laudo do HTML de e-mail', () => {
  test('HTML de e-mail bem-comportado passa limpo', () => {
    const report = validateEmailHtml(
      '<table><tr><td style="color:#fff">Olá <a href="https://exemplo.test">abra aqui</a></td></tr></table>',
    )

    expect(report.isValid).toBe(true)
    expect(report.problems).toEqual([])
  })

  test('script reprova, porque nenhum cliente o executa', () => {
    const report = validateEmailHtml('<div><script>alert(1)</script></div>')

    expect(report.isValid).toBe(false)
    expect(codesOf('<div><script>alert(1)</script></div>')).toContain(EMAIL_HTML_PROBLEM.SCRIPT)
    expect(report.problems[0]?.severity).toBe('error')
  })

  test('folha externa e imagem em `data:` reprovam', () => {
    expect(codesOf('<link rel="stylesheet" href="https://x.test/a.css">')).toContain(
      EMAIL_HTML_PROBLEM.EXTERNAL_STYLESHEET,
    )
    expect(codesOf('<img src="data:image/png;base64,AA" alt="x">')).toContain(
      EMAIL_HTML_PROBLEM.DATA_URI_IMAGE,
    )
  })

  /** `warning` degrada sem impedir: quem escreve decide se aceita o Outlook ignorando o layout. */
  test('flex e grid avisam, mas não reprovam', () => {
    const report = validateEmailHtml('<div style="display:flex">oi</div>')

    expect(report.isValid).toBe(true)
    expect(report.problems[0]?.severity).toBe('warning')
    expect(codesOf('<div style="display:flex">oi</div>')).toContain(
      EMAIL_HTML_PROBLEM.MODERN_LAYOUT,
    )
  })

  test('imagem sem `alt` avisa — o cliente bloqueia imagem por padrão', () => {
    expect(codesOf('<img src="https://x.test/a.png">')).toContain(
      EMAIL_HTML_PROBLEM.IMAGE_WITHOUT_ALT,
    )
    expect(codesOf('<img src="https://x.test/a.png" alt="logo">')).not.toContain(
      EMAIL_HTML_PROBLEM.IMAGE_WITHOUT_ALT,
    )
  })

  test('endereço relativo avisa: ele não resolve fora do site', () => {
    expect(codesOf('<a href="/pedidos">abra</a>')).toContain(EMAIL_HTML_PROBLEM.RELATIVE_URL)
    expect(codesOf('<a href="https://x.test/pedidos">abra</a>')).not.toContain(
      EMAIL_HTML_PROBLEM.RELATIVE_URL,
    )
  })

  test('tag aberta sem fechar avisa alto: o cliente conserta do jeito dele', () => {
    expect(codesOf('<div><p>oi</div>')).toContain(EMAIL_HTML_PROBLEM.UNBALANCED_TAGS)
  })

  test('acima do corte do Gmail, avisa', () => {
    const long = `<div>${'a'.repeat(EMAIL_GMAIL_CLIP_BYTES)}</div>`

    expect(codesOf(long)).toContain(EMAIL_HTML_PROBLEM.GMAIL_CLIP)
  })

  /** O laudo alimenta a tela do pacote: mudar a forma quebra o desenho sem quebrar o build. */
  test('o laudo tem a forma que a tela desenha', () => {
    const [problem] = validateEmailHtml('<script></script>').problems

    expect(Object.keys(problem ?? {}).sort()).toEqual(['code', 'message', 'severity'])
  })
})
