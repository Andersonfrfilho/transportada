/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'bun:test'

import { NOTIFICATION_PREVIEW_PAYLOAD } from '../../src/modules/notification/shared/notificationCatalog.constant'

const API_CATALOG_PATH = fileURLToPath(
  new URL(
    '../../../api-transportada/src/notification/domain/notification-catalog.constant.ts',
    import.meta.url,
  ),
)

/** As variáveis que os textos do catálogo declaram — lidas do arquivo da API, não copiadas aqui. */
function catalogPlaceholders(): readonly string[] {
  const source = readFileSync(API_CATALOG_PATH, 'utf8')
  const groups = [...source.matchAll(/placeholders: \[([^\]]*)\]/gu)]
  const names = groups.flatMap(([, body]) => [...(body ?? '').matchAll(/'([^']+)'/gu)])

  return [...new Set(names.map(([, name]) => name as string))].sort()
}

/**
 * O preview existe para mostrar a frase que a pessoa vai ler. Variável sem exemplo volta a aparecer
 * crua (`{{batchName}}`), e quem está escrevendo o texto perde exatamente o que veio ver.
 */
describe('o preview tem exemplo para toda variável do catálogo', () => {
  test('o catálogo declara variáveis', () => {
    expect(catalogPlaceholders().length).toBeGreaterThan(0)
  })

  test('cada variável do catálogo tem valor de exemplo', () => {
    const missing = catalogPlaceholders().filter(
      (name) => NOTIFICATION_PREVIEW_PAYLOAD[name] === undefined,
    )

    expect(missing).toEqual([])
  })

  /** Exemplo sobrando é variável que sumiu do catálogo: some do preview antes de virar confusão. */
  test('não há exemplo para variável que o catálogo não usa', () => {
    const known = new Set(catalogPlaceholders())
    const extra = Object.keys(NOTIFICATION_PREVIEW_PAYLOAD).filter((name) => !known.has(name))

    expect(extra).toEqual([])
  })

  /** Valor comprido esconde quebra de linha em vez de revelá-la — que é o oposto do preview. */
  test('os exemplos são curtos', () => {
    for (const [name, value] of Object.entries(NOTIFICATION_PREVIEW_PAYLOAD)) {
      expect(`${name}: ${value.length <= 40}`).toBe(`${name}: true`)
    }
  })
})

/**
 * O botão de teste é do produto, não do pacote: o `notification-ui` sabe qual template está aberto e
 * nada além disso — para quem mandar, por qual rota e o que fazer com o resultado é decisão daqui.
 */
describe('o envio de teste do editor', () => {
  const button = readFileSync(
    'src/modules/notification/components/SendTemplateTestButton.component.tsx',
    'utf8',
  )
  const client = readFileSync(
    'src/modules/notification/shared/templateTestClient.service.ts',
    'utf8',
  )
  const page = readFileSync('src/modules/notification/pages/NotificationSettings.page.tsx', 'utf8')

  test('o editor mostra o botão pelo slot do pacote', () => {
    expect(page).toContain('renderEditorActions')
    expect(page).toContain('SendTemplateTestButton')
  })

  /**
   * ⚠️ A regra que não pode se perder: a chamada não leva destinatário. Um campo de destino faria a
   * tela de template virar um jeito de mandar e-mail com a marca da empresa para qualquer endereço.
   */
  test('o pedido não carrega destinatário', () => {
    expect(client).not.toContain('recipient')
    expect(client).not.toContain('to:')
    expect(client).toContain('/test`')
  })

  /** "Enviar" sozinho, numa tela de template, sugere disparar para a base inteira. */
  test('o rótulo diz que o teste vai para quem clicou', () => {
    const locale = JSON.parse(
      readFileSync('src/modules/notification/locales/notification.locale.json', 'utf8'),
    ) as { readonly test: { readonly send: string } }

    expect(locale.test.send.toLowerCase()).toContain('mim')
  })

  test('o aviso de resultado some sozinho', () => {
    expect(button).toContain('FEEDBACK_MS')
  })
})
