/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 179 T101 (RF1, CA01/CA07/CA08): o cadastro do tipo de ocorrência aceita a exigência de
 * comprovante (`attachmentMode`, o mesmo vocabulário de `DELIVERY_PROOF_FIELD_MODES`). Omitido,
 * vira `'off'` — nenhuma instalação muda de comportamento ao aplicar esta migration.
 */
import { describe, expect, test } from 'bun:test'

import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'

function baseBody(): string {
  return JSON.stringify({
    active: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    name: 'Recusa total',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery',
  })
}

function putRequest(body: unknown): Request {
  return new Request('http://localhost/company-settings/occurrence-types', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

describe('o cadastro do tipo aceita a exigência de comprovante (spec 179 RF1)', () => {
  /**
   * ⚠️ Ausente é **"não mexa"**, não `'off'`. O UPDATE sobrescreve o registro inteiro e o editor do
   * painel ainda não manda o campo: com padrão `'off'`, editar o texto do e-mail de um tipo marcado
   * como `required` desligaria a exigência de foto sem erro nenhum — o controle de compliance da
   * spec caindo por uma edição que nada tem a ver com ele. Quem grava mantém o valor atual, e o
   * padrão da coluna cobre o INSERT.
   */
  test('sem o campo, não decide nada — quem grava preserva o valor atual', async () => {
    const parsed = await parseOccurrenceTypeRequest(putRequest(JSON.parse(baseBody())))

    expect(parsed.attachmentMode).toBeUndefined()
  })

  test('aceita optional e required', async () => {
    const optional = await parseOccurrenceTypeRequest(
      putRequest({ ...JSON.parse(baseBody()), attachmentMode: 'optional' }),
    )
    expect(optional.attachmentMode).toBe('optional')

    const required = await parseOccurrenceTypeRequest(
      putRequest({ ...JSON.parse(baseBody()), attachmentMode: 'required' }),
    )
    expect(required.attachmentMode).toBe('required')
  })

  test('valor fora do vocabulário é recusado', async () => {
    await expect(
      parseOccurrenceTypeRequest(putRequest({ ...JSON.parse(baseBody()), attachmentMode: 'sim' })),
    ).rejects.toThrow()
  })
})

describe('o cadastro do tipo aceita o aviso automático à contratante (spec 183 T802)', () => {
  /** Mesmo cuidado do `attachmentMode`: ausente é "não mexa", nunca desligar o aviso de carona. */
  test('sem o campo, não decide nada; com ele, liga ou desliga; outro tipo é recusado', async () => {
    const absent = await parseOccurrenceTypeRequest(putRequest(JSON.parse(baseBody())))
    expect(absent.emailsContractor).toBeUndefined()

    const on = await parseOccurrenceTypeRequest(
      putRequest({ ...JSON.parse(baseBody()), emailsContractor: true }),
    )
    expect(on.emailsContractor).toBe(true)

    await expect(
      parseOccurrenceTypeRequest(
        putRequest({ ...JSON.parse(baseBody()), emailsContractor: 'sim' }),
      ),
    ).rejects.toThrow()
  })
})

/**
 * Item 9 da lista da spec 183: o painel sempre mandou `redeliveryPolicy` (spec 164) e o `strict()`
 * o recusava — todo cadastro e toda edição de tipo pela tela voltavam 400.
 */
describe('o cadastro do tipo aceita a política de reentrega (spec 164 RF1)', () => {
  /** Mesmo cuidado dos dois de cima: ausente é "não mexa", nunca voltar o tipo para `unset`. */
  test('sem o campo, não decide nada; com ele, grava o vocabulário; fora dele, recusa', async () => {
    const absent = await parseOccurrenceTypeRequest(putRequest(JSON.parse(baseBody())))
    expect(absent.redeliveryPolicy).toBeUndefined()

    for (const policy of ['unset', 'allowed', 'blocked'] as const) {
      const parsed = await parseOccurrenceTypeRequest(
        putRequest({ ...JSON.parse(baseBody()), redeliveryPolicy: policy }),
      )
      expect(parsed.redeliveryPolicy).toBe(policy)
    }

    await expect(
      parseOccurrenceTypeRequest(
        putRequest({ ...JSON.parse(baseBody()), redeliveryPolicy: 'sometimes' }),
      ),
    ).rejects.toThrow()
  })
})
