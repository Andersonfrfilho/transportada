/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

const CARD = readSource('src/modules/driver-trip/components/DriverStopCard.component.tsx')
const HOOK = readSource('src/modules/driver-trip/hooks/useDriverTrip.hook.ts')

function slice(input: { readonly from: string; readonly to: string }): string {
  const start = CARD.indexOf(input.from)
  expect(start).toBeGreaterThan(-1)
  const end = CARD.indexOf(input.to, start)
  expect(end).toBeGreaterThan(start)
  return CARD.slice(start, end)
}

function gateSource(): string {
  return slice({ from: 'function PreDeliveryProofGate(', to: 'type DocumentDetailsProps' })
}

function documentRowSource(): string {
  return slice({ from: 'function DocumentRow(', to: 'type PreDeliveryProofGateProps' })
}

/**
 * Spec 218 (RF-A1/RF-A2, P1): com obrigatório no comprovante efetivo, "Entreguei" abre a captura ali
 * mesmo — o **mesmo** `ProofCaptureFields` de depois da entrega — e só "Confirmar entrega", que nasce
 * desabilitado, chama `onDeliver`.
 */
describe('o gate de antes da entrega no cartão da parada (spec 218)', () => {
  it('o gate monta a mesma captura de depois da entrega, sem segunda cópia dos botões', () => {
    const gate = gateSource()
    expect(gate).toInclude('<ProofCaptureFields')
    expect(gate).not.toInclude('<FilePickerButton')
    expect(gate).not.toInclude('function attach(')
  })

  it('"Confirmar entrega" fica desabilitado enquanto listMissingProofFields acusar algo', () => {
    const gate = gateSource()
    expect(gate).toInclude('listMissingProofFields({')
    expect(gate).toInclude('disabled={missingFields.length > 0}')
    expect(gate).toInclude("t('deliveryGate.confirm')")
    /* Aviso, não erro — o mesmo tom do resto do comprovante (spec 203). */
    expect(gate).not.toInclude('role="alert"')
  })

  it('o anexo do gate sai marcado para esperar a entrega na fila (RF-A3)', () => {
    expect(gateSource()).toInclude('awaitingDelivery: true')
  })

  it('o cartão decide pelo plano do comprovante efetivo, nunca pelo lançamento tardio (RF-A4)', () => {
    const row = documentRowSource()
    const decision = row.split('\n').find((line) => line.includes('requiresProofBeforeDelivery('))
    expect(decision).toBeDefined()
    expect(decision).toInclude('resolveProofFormPlan(proofSettings)')
    expect(decision).not.toInclude('isLateRegistration')
    expect(row).toInclude('<PreDeliveryProofGate')
  })

  it('o gate leva a marca do lançamento tardio no anexo, como a seção de depois', () => {
    const row = documentRowSource()
    const gateCall = row.slice(row.indexOf('<PreDeliveryProofGate'))
    expect(gateCall).toInclude('isLateRegistration ? { lateRegistration: true } : {}')
  })

  it('entregar é um caminho só — o toque direto e o "Confirmar entrega" chamam o mesmo onDeliver', () => {
    expect(
      CARD.match(
        /onDeliver\(\{ documentId: document\.id, lateRegistration: isLateRegistration \}\)/gu,
      ),
    ).toHaveLength(1)
    expect(documentRowSource()).toInclude("t('deliver')")
  })
})

describe('a fila solta o anexo quando a entrega entra (spec 218 RF-A3)', () => {
  it('a entrega enfileirada solta os anexos que esperavam por ela', () => {
    const body = HOOK.slice(HOOK.indexOf('function reportWithLocation('))
    expect(body).toInclude("fieldReport.kind === 'deliver'")
    expect(body).toInclude('releaseAttachmentsAwaitingDelivery({')
  })

  it('a foto do gate chega à fila com a marca de espera', () => {
    const body = HOOK.slice(HOOK.indexOf('async function enqueueProof('))
    expect(body).toInclude('awaitingDelivery: input.awaitingDelivery === true')
  })
})

describe('os textos do gate (spec 218)', () => {
  it('existem em pt-BR e en, sem texto no componente', () => {
    for (const locale of [driverTrip, driverTripEn]) {
      for (const key of ['title', 'lead', 'confirm', 'cancel', 'missingLead'] as const) {
        expect(locale.deliveryGate[key]).toBeString()
      }
      expect(locale.deliveryGate.missingLead).toInclude('{{fields}}')
    }
    expect(driverTrip.deliveryGate.confirm).toBe('Confirmar entrega')
  })
})

/**
 * Spec 218 (T19, RF-C3): o comprovante chega resolvido em três camadas no snapshot — a precedência
 * (geral → contratante → destinatário) é do servidor. Nenhum arquivo do app a reimplementa.
 */
describe('o app só lê o comprovante resolvido (spec 218 T19)', () => {
  it('nenhum arquivo de src/ fala de exceção por contratante ou destinatário', () => {
    const sourceRoot = new URL('../../src/', import.meta.url)
    const files = readdirSync(sourceRoot, { recursive: true })
      .map(String)
      .filter((path) => /\.(ts|tsx)$/u.test(path))
    expect(files.length).toBeGreaterThan(0)
    const offenders = files.filter((path) =>
      /contractorOverride|recipientOverride|resolveWithOverrides|overridesByContractor/u.test(
        readFileSync(new URL(path, sourceRoot), 'utf8'),
      ),
    )
    expect(offenders).toEqual([])
  })
})
