/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { planLicenseSuggestion } from '@/modules/fleet/shared/driverLicenseSuggestion.service'
import { createDriverAttachmentClient } from '@/modules/fleet/shared/driverAttachmentClient.service'
import { isDriverAttachmentSuggestionResponse } from '@/modules/fleet/shared/driverAttachment.validation'

const READ = { licenseCategory: 'D', licenseNumber: '01234567890' } as const
const EMPTY = { licenseCategory: '', licenseNumber: '' } as const

function readApplicationFile(path: string): Promise<string> {
  return Bun.file(new URL(`../../${path}`, import.meta.url)).text()
}

/**
 * Spec 091 T018: a sugestão da CNH é OFERTA, campo a campo, nunca gravação. As três guardas abaixo são
 * as mesmas da 071 — o que a leitura do documento acha nunca corrige o que a pessoa já digitou.
 */
describe('sugestão de preenchimento pela CNH (spec 091 T018)', () => {
  it('guarda 1 — só campo vazio da ficha recebe oferta', () => {
    const plan = planLicenseSuggestion({
      current: { licenseCategory: 'B', licenseNumber: '' },
      suggestion: READ,
    })

    expect(plan.filter((entry) => entry.status === 'offer').map((entry) => entry.field)).toEqual([
      'licenseNumber',
    ])
    expect(
      planLicenseSuggestion({ current: EMPTY, suggestion: READ }).map((e) => e.status),
    ).toEqual(['offer', 'offer'])
  })

  it('guarda 2 — divergência avisa, e não vira oferta nem correção', () => {
    const plan = planLicenseSuggestion({
      current: { licenseCategory: 'B', licenseNumber: '99999999999' },
      suggestion: READ,
    })

    expect(plan.map((entry) => entry.status)).toEqual(['diverges', 'diverges'])
    expect(plan.some((entry) => entry.status === 'offer')).toBe(false)
    expect(plan[0]).toMatchObject({ current: '99999999999', read: '01234567890' })
  })

  it('quem confere não é divergência: máscara e caixa são do teclado, não do dado', () => {
    const plan = planLicenseSuggestion({
      current: { licenseCategory: 'd', licenseNumber: '012.345.678-90' },
      suggestion: READ,
    })

    expect(plan.map((entry) => entry.status)).toEqual(['matches', 'matches'])
  })

  it('ausência não é conflito: campo que a leitura não achou fica de fora', () => {
    expect(
      planLicenseSuggestion({
        current: { licenseCategory: 'B', licenseNumber: '123' },
        suggestion: { licenseCategory: null, licenseNumber: null },
      }),
    ).toEqual([])
  })

  it('categoria que o formulário não aceita não é oferecida (OCR erra)', () => {
    const plan = planLicenseSuggestion({
      current: EMPTY,
      suggestion: { licenseCategory: 'XZ', licenseNumber: null },
    })

    expect(plan).toEqual([])
  })

  /** Guarda 3 — aceitar a oferta preenche o formulário; a ficha só muda quando o operador salvar. */
  it('guarda 3 — o componente só preenche o formulário: não grava a ficha nem a decisão por conta própria', async () => {
    const component = await readApplicationFile(
      'src/modules/fleet/components/DriverLicenseSuggestion.component.tsx',
    )
    const form = await readApplicationFile('src/modules/fleet/components/DriverForm.component.tsx')

    // Nenhum caminho de gravação da ficha: nem `onUpdate`, nem `submit`, nem o cliente da frota.
    for (const forbidden of ['onUpdate', 'onCreate', '.submit(', 'fleetClient', 'updateDriver']) {
      expect(component).not.toContain(forbidden)
    }
    // O botão Usar só chama `onFill`; a decisão sai no botão de concluir, que descarta a leitura.
    expect(component).toContain('onFill(entry.field, entry.read)')
    // O formulário entrega ao componente o `patch` do estado — não o envio.
    expect(form).toContain('onFillLicenseField={(field, value) => form.patch({ [field]: value })}')
  })

  it('o cliente lê a sugestão por GET e decide por POST com só a decisão', async () => {
    const calls: { body: string; method: string; url: string }[] = []
    const client = createDriverAttachmentClient({
      apiBaseUrl: 'https://api.example.test',
      fetch: async (request) => {
        calls.push({ body: await request.text(), method: request.method, url: request.url })
        return new Response(
          request.method === 'GET'
            ? JSON.stringify({ data: { fields: READ } })
            : JSON.stringify({ data: { decision: 'accepted' } }),
        )
      },
      getAccessToken: () => Promise.resolve('token'),
    })
    const target = { attachmentId: 'a1', driverId: 'd1' }

    expect(await client.readSuggestion(target)).toEqual({ fields: READ })
    await client.decideSuggestion({ ...target, decision: 'accepted' })

    expect(calls[0]).toMatchObject({
      method: 'GET',
      url: 'https://api.example.test/fleet/drivers/d1/attachments/a1/suggestion',
    })
    expect(calls[1]?.method).toBe('POST')
    expect(JSON.parse(calls[1]?.body ?? '{}')).toEqual({ decision: 'accepted' })
    expect(isDriverAttachmentSuggestionResponse({ data: { fields: null } })).toBe(true)
    expect(isDriverAttachmentSuggestionResponse({ data: { fields: { licenseNumber: 1 } } })).toBe(
      false,
    )
  })
})
