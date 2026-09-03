/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'bun:test'

import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import {
  OCCURRENCE_NOTICE_TEMPLATES,
  renderOccurrenceNoticePreview,
} from '../../src/modules/driver-trip/shared/occurrenceNoticePreview.service'

const API_CATALOG_PATH = fileURLToPath(
  new URL(
    '../../../api-transportada/src/notification/domain/notification-catalog.constant.ts',
    import.meta.url,
  ),
)
const CARD_PATH = fileURLToPath(
  new URL('../../src/modules/driver-trip/components/DriverStopCard.component.tsx', import.meta.url),
)

type ApiTemplate = Readonly<{ body: string; placeholders: readonly string[] }>

/**
 * Os textos da prévia são **cópia por valor** do catálogo da API — o bundle não importa código de
 * lá. Este contrato lê o arquivo da API (mesmo padrão de `preview-payload.contract.ts`) e falha se
 * texto ou placeholders divergirem: cópia sem contrato é a divergência calada de amanhã.
 */
function readApiOccurrenceTemplates(): Readonly<Record<string, ApiTemplate>> {
  const source = readFileSync(API_CATALOG_PATH, 'utf8')

  const keyValues = new Map(
    [...source.matchAll(/(TRIP_OCCURRENCE_\w+): '([^']+)'/gu)].map(([, name, value]) => [
      name as string,
      value as string,
    ]),
  )

  const entries = [
    ...source.matchAll(
      /placeholders: \[([^\]]*)\],\s*templateKey: NOTIFICATION_TEMPLATE_KEY\.(TRIP_OCCURRENCE_\w+),[\s\S]*?inbox: \{\s*body: '([^']*)'/gu,
    ),
  ]

  return Object.fromEntries(
    entries.map(([, placeholderBlock, constantName, body]) => {
      const templateKey = keyValues.get(constantName ?? '')
      if (templateKey === undefined) throw new Error(`API_TEMPLATE_KEY_NOT_FOUND_${constantName}`)
      const placeholders = [...(placeholderBlock ?? '').matchAll(/'([^']+)'/gu)]
        .map(([, name]) => name as string)
        .sort()
      return [templateKey, { body: body ?? '', placeholders }]
    }),
  )
}

describe('a prévia do aviso de ocorrência (spec 082 D8 / G003)', () => {
  const apiTemplates = readApiOccurrenceTemplates()

  it('o catálogo da API declara os quatro templates de ocorrência', () => {
    expect(Object.keys(apiTemplates).sort()).toEqual([
      'trip.occurrence-appointment-required',
      'trip.occurrence-dock-closed',
      'trip.occurrence-long-wait',
      'trip.occurrence-unexpected-charge',
    ])
  })

  it('cada texto copiado é idêntico ao corpo inbox do catálogo', () => {
    for (const template of Object.values(OCCURRENCE_NOTICE_TEMPLATES)) {
      expect(apiTemplates[template.templateKey]?.body).toBe(template.body)
    }
  })

  it('os placeholders do catálogo são exatamente os que a prévia preenche', () => {
    for (const template of Object.values(OCCURRENCE_NOTICE_TEMPLATES)) {
      expect(apiTemplates[template.templateKey]?.placeholders).toEqual([
        'documentLabel',
        'occurredAt',
        'stopLabel',
      ])
      expect([...template.body.matchAll(/\{\{(\w+)\}\}/gu)].map(([, name]) => name).sort()).toEqual(
        ['documentLabel', 'occurredAt', 'stopLabel'],
      )
    }
  })

  it('a prévia substitui todo placeholder — nada sai cru', () => {
    const preview = renderOccurrenceNoticePreview({
      documentLabel: '883658',
      kind: 'dock_closed',
      occurredAt: '14:32',
      stopLabel: 'CD Barrinha',
    })
    expect(preview?.templateKey).toBe('trip.occurrence-dock-closed')
    expect(preview?.text).toBe('Doca fechada na parada CD Barrinha às 14:32 (nota 883658).')
    expect(preview?.text).not.toInclude('{{')
  })

  /** G003: `other` ficou sem template de propósito — e a tela diz isso, não esconde. */
  it('other não gera aviso, e o texto da tela anuncia o silêncio', () => {
    expect(
      renderOccurrenceNoticePreview({
        documentLabel: 'x',
        kind: 'other',
        occurredAt: 'x',
        stopLabel: 'x',
      }),
    ).toBeNull()
    expect(driverTrip.occurrencePreview.none.toLowerCase()).toInclude('nenhum aviso')
  })
})

describe('a tela de ocorrência da parada', () => {
  const source = readFileSync(CARD_PATH, 'utf8')

  it('o motivo é escolha por chips, um selecionado por vez', () => {
    expect(source).toInclude('occurrenceChips')
    expect(source).toInclude('role="radiogroup"')
    expect(source).toInclude('aria-checked={option === kind}')
    expect(source).not.toInclude("from '@/components/ui/select'")
  })

  it('a descrição é textarea e a prévia é renderizada pelo serviço puro', () => {
    expect(source).toInclude('<textarea')
    expect(source).toInclude('renderOccurrenceNoticePreview')
    expect(source).toInclude('occurrencePreview.title')
  })

  /** A foto pega carona no proof da nota — a rota de ocorrência da parada não aceita anexo. */
  it('a foto sobe pelo caminho de proof da nota associada', () => {
    expect(source).toInclude('onOccurrencePhoto')
    expect(driverTrip.occurrencePhoto.toLowerCase()).toInclude('foto da ocorrência')
  })
})
