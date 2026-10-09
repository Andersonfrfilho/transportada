/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ComponentProps } from 'react'

import { format, resolveConfig } from 'prettier'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import { i18n } from '@/modules/shared/i18n/i18n.service'
import { OpenSubjectConversationProvider } from '@/modules/conversation/components/OpenSubjectConversationProvider.component'
import { DriverStopCard } from '@/modules/driver-trip/components/DriverStopCard.component'

import { buildDriverTripDocument, buildDriverTripStop } from '../fixtures/driverTrip.fixture'

/**
 * Spec 260 (T3.3): "nada pode impactar outros fluxos". O cartão da parada, sem o contexto da
 * conversa ligado, renderiza byte a byte o que renderizava antes do botão existir — o golden foi
 * gravado ANTES de qualquer mudança no cartão.
 */
type DriverStopCardProps = ComponentProps<typeof DriverStopCard>

const GOLDEN_URL = new URL('../fixtures/driver-stop-card.golden.html', import.meta.url)

function noop(): void {}

function buildStopCardProps(overrides: Partial<DriverStopCardProps> = {}) {
  const stop = buildDriverTripStop({
    arrivedAt: '2026-10-09T12:00:00.000Z',
    documents: [
      buildDriverTripDocument({ id: 'document-1', number: '900123' }),
      buildDriverTripDocument({ id: 'document-2', number: '900124' }),
    ],
  })
  return {
    canReportArrival: false,
    canStartRoute: { enabled: true },
    deliverActivityByDocumentId: new Map(),
    isCurrent: true,
    isEnRoute: false,
    isFieldWorkBlocked: false,
    isLocationDenied: false,
    isOpen: true,
    lastKnownLocation: null,
    notDeliveredStatusByDocumentId: new Map(),
    occurrenceTypes: { status: 'loading' },
    onArrive: noop,
    onCancelDeparture: noop,
    onDeliver: noop,
    onDepart: noop,
    onDiscardProofAwaitingDelivery: noop,
    onFocusStop: noop,
    onHeaderRef: noop,
    onNotDelivered: noop,
    onProof: () => Promise.resolve(true),
    onQueuedDocumentOccurrence: noop,
    onRetryOccurrenceTypes: noop,
    onStopOccurrence: noop,
    onToggle: noop,
    queueView: [],
    returnActivityByDocumentId: new Map(),
    sentReportKeys: new Set<string>(),
    stop,
    stopOccurrenceActivity: undefined,
    tappedReports: [],
    ...overrides,
  } as DriverStopCardProps
}

/** O golden passa pelo prettier (o `format:check` da raiz cobre `.html`), então o markup também. */
async function renderStopCard(isProvided: boolean): Promise<string> {
  const card = <DriverStopCard {...buildStopCardProps()} />
  const tree = isProvided ? (
    <OpenSubjectConversationProvider isEnabled={false}>{card}</OpenSubjectConversationProvider>
  ) : (
    card
  )
  const config = await resolveConfig(fileURLToPath(GOLDEN_URL))
  return format(renderToStaticMarkup(tree), { ...config, parser: 'html' })
}

describe('cartão da parada sem a conversa ligada', () => {
  test('renderiza o mesmo markup de antes do botão "Falar com o escritório"', async () => {
    await i18n.changeLanguage('pt-BR')
    const markup = await renderStopCard(false)
    if (process.env.GOLDEN_WRITE === '1') writeFileSync(GOLDEN_URL, markup)
    expect(markup).toBe(readFileSync(GOLDEN_URL, 'utf8'))
    expect(markup).toContain('900123')
    expect(markup).not.toContain('Falar com o escritório')
  })

  test('com o contexto presente mas desligado, o markup é o mesmo', async () => {
    await i18n.changeLanguage('pt-BR')
    expect(await renderStopCard(true)).toBe(readFileSync(GOLDEN_URL, 'utf8'))
  })
})
