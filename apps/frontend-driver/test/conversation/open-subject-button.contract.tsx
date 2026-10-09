/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, describe, expect, test } from 'bun:test'

import { DocumentConversationSlot } from '@/modules/conversation/components/DocumentConversationSlot.component'
import { OpenSubjectConversationProvider } from '@/modules/conversation/components/OpenSubjectConversationProvider.component'
import { OpenSubjectConversationView } from '@/modules/conversation/components/OpenSubjectConversationView.component'
import type { OpenAction } from '@/modules/conversation/shared/openSubjectConversation.service'
import { i18n } from '@/modules/shared/i18n/i18n.service'

/**
 * Spec 260 T3.3: o botão "Falar com o escritório" — estados, rótulos e a garantia de que, sem o
 * contexto ligado, o cartão da parada não ganha nem um byte. Renderização estática (não há DOM no
 * bun test); o clique é coberto por `runOpenSubject` em `open-subject-action.contract.ts`.
 */
function textOf(html: string): string {
  return html
    .replaceAll(/<svg[\s\S]*?<\/svg>/gu, '')
    .replaceAll(/<[^>]+>/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim()
}

function render(
  action: OpenAction,
  extra: { errorKey?: 'closed' | 'failed' | 'notFound' | 'rateLimited' } = {},
): string {
  return renderToStaticMarkup(
    <OpenSubjectConversationView
      action={action}
      contextLabel="NF-e 900123/1"
      onOpen={() => undefined}
      {...extra}
    />,
  )
}

const OPEN: OpenAction = { kind: 'open', shouldRequestServer: true, unreadCount: 0 }

function source(path: string): string {
  return readFileSync(new URL(`../../src/modules/${path}`, import.meta.url), 'utf8')
}

describe('OpenSubjectConversationView', () => {
  afterAll(async () => {
    await i18n.changeLanguage('pt-BR')
  })

  test('aberto: ícone + texto, botão habilitado e o nome da nota no rótulo acessível', async () => {
    await i18n.changeLanguage('pt-BR')
    const html = render(OPEN)
    expect(textOf(html)).toContain('Falar com o escritório')
    expect(html).toContain('<svg')
    expect(html).toContain('type="button"')
    expect(html).not.toContain('disabled')
    expect(html).toContain('aria-label="Falar com o escritório · NF-e 900123/1"')
  })

  test('não lidas: a contagem é texto no botão, não só cor', async () => {
    await i18n.changeLanguage('pt-BR')
    expect(textOf(render({ ...OPEN, unreadCount: 2 }))).toContain('2 não lidas')
  })

  test('abrindo: desabilitado, ocupado e com o texto "Abrindo…"', async () => {
    await i18n.changeLanguage('pt-BR')
    const html = render({ kind: 'opening', shouldRequestServer: true, unreadCount: 0 })
    expect(html).toContain('disabled')
    expect(html).toContain('aria-busy="true"')
    expect(textOf(html)).toContain('Abrindo…')
  })

  test('sem rede: desabilitado, com a dica visível e ligada ao botão', async () => {
    await i18n.changeLanguage('pt-BR')
    const html = render({ kind: 'offline', shouldRequestServer: true, unreadCount: 0 })
    expect(html).toContain('disabled')
    expect(textOf(html)).toContain('Precisa de conexão para abrir a conversa')
    expect(html).toContain('aria-describedby=')
  })

  test('encerrada: "Ver conversa", habilitado', async () => {
    await i18n.changeLanguage('pt-BR')
    const html = render({ kind: 'view', shouldRequestServer: false, unreadCount: 0 })
    expect(textOf(html)).toContain('Ver conversa')
    expect(html).not.toContain('disabled')
  })

  test('API sem a rota: nada é renderizado', () => {
    expect(render({ kind: 'hidden', shouldRequestServer: false, unreadCount: 0 })).toBe('')
  })

  test.each([
    ['notFound', 'Não encontramos essa conversa'],
    ['closed', 'não pode mais ser aberta'],
    ['rateLimited', 'Muitas tentativas'],
    ['failed', 'Não foi possível abrir'],
  ] as const)(
    'erro %s: mensagem clara numa região viva e o botão segue disponível',
    async (errorKey, fragment) => {
      await i18n.changeLanguage('pt-BR')
      const html = render(OPEN, { errorKey })
      expect(html).toContain('role="alert"')
      expect(textOf(html)).toContain(fragment)
      expect(html).not.toContain('disabled')
    },
  )

  test('sem erro a região viva existe, vazia, para o leitor de tela anunciar o resultado', () => {
    expect(render(OPEN)).toContain('aria-live="polite"')
  })

  test('em inglês também há texto', async () => {
    await i18n.changeLanguage('en')
    expect(textOf(render(OPEN))).toContain('Talk to the office')
  })
})

describe('encaixe no cartão da parada', () => {
  test('sem o contexto ligado, o slot não renderiza nada', () => {
    expect(
      renderToStaticMarkup(<DocumentConversationSlot contextLabel="NF" documentId="document-1" />),
    ).toBe('')
    expect(
      renderToStaticMarkup(
        <OpenSubjectConversationProvider isEnabled={false}>
          <DocumentConversationSlot contextLabel="NF" documentId="document-1" />
        </OpenSubjectConversationProvider>,
      ),
    ).toBe('')
  })

  test('o slot entra uma única vez no cartão, dentro do bloco de detalhes da nota', () => {
    const card = source('driver-trip/components/DriverStopCard.component.tsx')
    expect(card.match(/<DocumentConversationSlot/gu)).toHaveLength(1)
    expect(card).toContain(
      "from '@/modules/conversation/components/DocumentConversationSlot.component'",
    )
  })

  test('a viagem ganha o botão no cabeçalho só para quem pode reportar nela', () => {
    const page = source('driver-trip/pages/DriverTripWorkspace.page.tsx')
    expect(page.match(/<OpenSubjectConversationButton/gu)).toHaveLength(1)
    expect(page).toContain('canReportOnTrip(trip)')
    expect(page.match(/<OpenSubjectConversationProvider/gu)).toHaveLength(1)
  })
})
