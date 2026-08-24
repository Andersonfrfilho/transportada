import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

const HOOK_PATH = 'src/modules/fleet/hooks/useDriverForm.hook.ts'

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

describe('driver form reset contract', () => {
  /**
   * Cadastrar motorista é trabalho em série: a ficha que continua preenchida depois de gravar
   * obriga o operador a apagar campo por campo — ou, pior, deixa o dado do anterior entrar no
   * próximo sem ninguém notar.
   */
  test('empties the form after creating a driver', () => {
    const source = readSource(HOOK_PATH)
    const submit = source.slice(source.indexOf('async function submit'))

    expect(submit).toContain('if (driver === undefined) {')
    expect(submit).toContain('resetFields()')
  })

  /** Na edição o formulário é o registro aberto: esvaziá-lo esconderia o que se foi ler. */
  test('keeps the loaded record on screen after updating', () => {
    const source = readSource(HOOK_PATH)
    const submit = source.slice(source.indexOf('async function submit'))

    expect(submit.indexOf('if (driver === undefined) {')).toBeLessThan(
      submit.indexOf('resetFields()'),
    )
  })

  /**
   * O aviso de gravado vem depois do reset: `coverage.clear()` limpa o feedback, e invertê-los
   * deixaria a gravação sem confirmação nenhuma na tela.
   */
  test('announces the save after emptying the fields', () => {
    const source = readSource(HOOK_PATH)
    const submit = source.slice(source.indexOf('async function submit'))

    expect(submit.indexOf('resetFields()')).toBeLessThan(submit.indexOf("setFeedbackKey('saved')"))
  })
})
