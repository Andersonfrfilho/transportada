/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'

const CARD = readFileSync(
  new URL('../../src/modules/driver-trip/components/DriverStopCard.component.tsx', import.meta.url),
  'utf8',
)
const HOOK = readFileSync(
  new URL('../../src/modules/driver-trip/hooks/useDriverTrip.hook.ts', import.meta.url),
  'utf8',
)
const WORKSPACE = readFileSync(
  new URL('../../src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx', import.meta.url),
  'utf8',
)

/** A mesma fatia que `proof-capture.contract.ts` usa para isolar `attach` dentro da seção. */
function attachFunctionBody(): string {
  const start = CARD.indexOf("function attach(kind: 'photo' | 'signature', file: File): void {")
  expect(start).toBeGreaterThan(-1)
  /* A primeira linha só com "  }" no indentador de 2 espaços fecha `attach` — nada mais aninha assim. */
  const end = CARD.indexOf('\n  }', start)
  expect(end).toBeGreaterThan(start)
  return CARD.slice(start, end)
}

/**
 * Spec 203 (P0, pré-requisito das specs 193/194): a foto do canhoto é a prova nº 1 do usuário —
 * ela entra na fila (IndexedDB) **antes** de qualquer validação de campo obrigatório. Campo vazio
 * vira aviso visível, nunca motivo para descartar o que o motorista já fotografou.
 */
describe('o attach nunca descarta a foto (spec 203)', () => {
  it('attach() não tem `return` nenhum — nenhum caminho aborta antes de chamar onProof', () => {
    const body = attachFunctionBody()
    expect(body).not.toInclude('return')
  })

  it('attach() chama onProof incondicionalmente, para foto e para assinatura — mesma função', () => {
    const body = attachFunctionBody()
    /* Pedido do usuário (25/09): `lateRegistration` entrou no meio — o corpo ganhou linhas, a
       chamada continua incondicional (já provado por "não tem `return`", acima). */
    expect(body).toInclude('onProof({')
    expect(body).toInclude('documentId,')
    expect(body).toInclude('file,')
    expect(body).toInclude('kind,')
    expect(body).toInclude('...currentFields(),')
    /* As duas capturas passam pela mesma `attach()` — não há uma segunda cópia da regra. */
    expect(CARD.match(/attach\('photo', file\)/gu)).toHaveLength(1)
    expect(CARD.match(/attach\('signature', new File/gu)).toHaveLength(1)
  })

  it('attach() ainda apura os campos faltantes, para alimentar o aviso — só não bloqueia mais', () => {
    const body = attachFunctionBody()
    expect(body).toInclude('blockedByFields(next)')
  })

  it('o aviso de campo pendente é role="status" (nunca "alert"), com texto do locale', () => {
    const start = CARD.indexOf('export function DeliveryProofSection(')
    const end = CARD.indexOf('type OccurrenceFormProps')
    const section = CARD.slice(start, end)
    expect(section.match(/role="alert"/gu)).toBeNull()
    expect(section.match(/role="status"/gu)?.length).toBeGreaterThanOrEqual(3)
    expect(section).toInclude("t('proofFields.pendingField')")
  })

  it('o texto do locale não promete bloqueio — o comprovante já foi guardado', () => {
    for (const locale of [driverTrip, driverTripEn]) {
      expect(locale.proofFields.pendingField).toBeString()
      expect(locale.proofFields).not.toHaveProperty('requiredField')
    }
    expect(driverTrip.proofFields.pendingField).not.toInclude('antes de anexar')
  })

  it('o campo é atualizado na fila pela mesma varredura de grupos que a drenagem usa (documentId)', () => {
    expect(HOOK).toInclude('applyAttachmentReceiverFields')
    expect(HOOK).toInclude('updateProofFields')
  })

  it('o formulário chama a atualização tardia no blur, só depois de algo já anexado', () => {
    expect(CARD).toInclude('onProofFieldsUpdate')
    expect(CARD).toInclude('attached.photo || attached.signature')
  })

  it('a página conecta o formulário ao controlador do hook', () => {
    expect(WORKSPACE).toInclude('handleProofFieldsUpdate')
    expect(WORKSPACE).toInclude('driverTrip.updateProofFields')
    expect(WORKSPACE).toInclude('onProofFieldsUpdate={handleProofFieldsUpdate}')
  })
})
