/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  tokenizeTemplate,
  VARIABLE_NAME,
} from '../../src/modules/delivery-clients/shared/contractorMailTemplate.validation'

/**
 * Spec 150, rodada de correção da Fase 4, item 5: `tokenizeTemplate` (front) é cópia por valor de
 * `tokenizeTemplate` (API, `contractor-mail/domain/mail-template-render.policy.ts`) — mesmo molde
 * de `mail-send-readiness-parity.contract.ts`: caminho relativo entre apps do mesmo monorepo, só
 * dentro de um teste, nunca um `import` de código (a arquitetura proíbe app importar de outra).
 *
 * A regra que mais importa manter em paridade é o formato de nome de variável (`VARIABLE_NAME`):
 * é ela que decide se `{contratante}` é uma variável válida ou um `{...}` malformado que a fronteira
 * HTTP e a tela precisam recusar da mesma forma. Comparar o texto-fonte do regex pega divergência
 * de caractere permitido (ex.: alguém adicionar dígito ou maiúscula de um lado só); os casos de
 * teste idênticos, rodados contra a função real do front, provam que o comportamento observável
 * (tokens produzidos) também bate — as duas metades da paridade.
 */
const API_POLICY_SOURCE = new URL(
  '../../../api-transportada/src/contractor-mail/domain/mail-template-render.policy.ts',
  import.meta.url,
)

async function readVariableNamePatternSource(source: URL): Promise<string> {
  const text = await Bun.file(source).text()
  const declaration = /const VARIABLE_NAME = \/([^/]*)\/u/u.exec(text)
  if (declaration?.[1] === undefined) throw new Error('API_CONSTANT_NOT_FOUND_VARIABLE_NAME')
  return declaration[1]
}

/**
 * Casos que exercitam toda decisão do tokenizador: texto puro, variável simples, mais de uma
 * variável, `{` sem `}` e vice-versa, chave vazia, nome com caractere fora de `[a-z_]`, e chaves
 * aninhadas (`{` novo antes do `}` da anterior). Os dois tokenizadores, front e API, precisam
 * concordar nos sete — é o que o contrato de comportamento (não só o regex) prova.
 */
const TOKENIZER_CASES: readonly {
  readonly input: string
  readonly label: string
  readonly matches: boolean
}[] = [
  { input: 'Olá, equipe {contratante}', label: 'texto e uma variável', matches: true },
  {
    input: '{contratante} enviou {quantidade} pedidos',
    label: 'mais de uma variável',
    matches: true,
  },
  { input: 'sem variável nenhuma', label: 'só texto', matches: true },
  { input: 'chave solta {', label: 'chave de abertura sem fechamento', matches: false },
  { input: 'chave solta }', label: 'chave de fechamento sem abertura', matches: false },
  { input: 'variável vazia {}', label: 'nome vazio entre chaves', matches: false },
  { input: 'variável inválida {Contratante}', label: 'maiúscula no nome', matches: false },
  { input: 'variável inválida {cliente1}', label: 'dígito no nome', matches: false },
  {
    input: 'chave aninhada {contratante {quantidade}}',
    label: 'chave aberta duas vezes',
    matches: false,
  },
]

describe('paridade do tokenizador de modelo de e-mail (spec 150, correção Fase 4, item 5)', () => {
  test('o formato de nome de variável do front é o mesmo regex da API', async () => {
    const apiPatternSource = await readVariableNamePatternSource(API_POLICY_SOURCE)
    expect(VARIABLE_NAME.source).toBe(apiPatternSource)
  })

  test('os mesmos casos tokenizam com o mesmo veredito (variável válida ou {}/chave malformada)', () => {
    for (const testCase of TOKENIZER_CASES) {
      const result = tokenizeTemplate(testCase.input)
      expect(result !== undefined).toBe(testCase.matches)
    }
  })
})
