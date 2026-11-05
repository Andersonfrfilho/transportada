/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

// Efeito colateral: inicializa o i18next real com os dicionários de produção.
import '@/modules/shared/i18n/i18n.service'
import { pickChoosableGroups } from '@/modules/fleet/components/DriverWhatsappGroupSection.component'
import enLocale from '@/modules/fleet/locales/fleet.en.locale.json'
import ptLocale from '@/modules/fleet/locales/fleet.locale.json'
import {
  createDriverWhatsappGroupClient,
  DriverWhatsappGroupRequestError,
} from '@/modules/fleet/shared/driverWhatsappGroupClient.service'
import {
  isDriverWhatsappGroupResponse,
  isWhatsappGroupListResponse,
} from '@/modules/fleet/shared/driverWhatsappGroup.validation'

const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
const GROUP = { groupJid: '120363000000000001@g.us', groupName: 'João', updatedAt: '2026-11-04' }

type Call = Readonly<{ body: string; method: string; url: string }>

function createFixture(response: Response) {
  const calls: Call[] = []
  const client = createDriverWhatsappGroupClient({
    apiBaseUrl: 'https://api.example.test',
    fetch: async (request) => {
      calls.push({ body: await request.text(), method: request.method, url: request.url })
      return response
    },
    getAccessToken: () => Promise.resolve('token'),
  })
  return { calls, client }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('grupo de WhatsApp na ficha do motorista (spec 292 T1)', () => {
  it('lê o grupo da ficha, ou nulo quando não há', async () => {
    const withGroup = createFixture(json({ data: GROUP }))
    expect(await withGroup.client.get(DRIVER_ID)).toEqual(GROUP)
    expect(withGroup.calls[0]).toMatchObject({
      method: 'GET',
      url: `https://api.example.test/fleet/drivers/${DRIVER_ID}/whatsapp-group`,
    })
    expect(await createFixture(json({ data: null })).client.get(DRIVER_ID)).toBeNull()
  })

  it('troca o grupo mandando só identificador e nome, e remove com DELETE', async () => {
    const put = createFixture(json({ data: GROUP }))
    await put.client.set({ driverId: DRIVER_ID, groupJid: GROUP.groupJid, groupName: 'João' })
    expect(put.calls[0]?.method).toBe('PUT')
    expect(JSON.parse(put.calls[0]?.body ?? '{}')).toEqual({
      groupJid: GROUP.groupJid,
      groupName: 'João',
    })

    const del = createFixture(json({ data: null }))
    await del.client.remove(DRIVER_ID)
    expect(del.calls[0]?.method).toBe('DELETE')
  })

  it('o código de erro da API viaja na exceção, e resposta fora da forma é recusada', async () => {
    const taken = createFixture(json({ error: { code: 'FLEET_DRIVER_WHATSAPP_GROUP_TAKEN' } }, 409))
    const refused = await taken.client
      .set({ driverId: DRIVER_ID, groupJid: GROUP.groupJid, groupName: '' })
      .catch((caught: unknown) => caught)
    expect(refused).toBeInstanceOf(DriverWhatsappGroupRequestError)
    expect((refused as Error).message).toBe('FLEET_DRIVER_WHATSAPP_GROUP_TAKEN')

    const invalid = createFixture(json({ data: [{ nope: 1 }] }))
    const bad = await invalid.client.listGroups().catch((caught: unknown) => caught)
    expect(bad).toBeInstanceOf(DriverWhatsappGroupRequestError)
    expect(isDriverWhatsappGroupResponse({ data: { groupJid: 1 } })).toBe(false)
    expect(isWhatsappGroupListResponse({ data: [] })).toBe(true)
  })

  it('a lista oferece só grupo livre ou do próprio motorista', () => {
    const groups = [
      { assignedDriverId: null, assignedDriverName: null, groupJid: '1@g.us', name: 'Livre' },
      { assignedDriverId: DRIVER_ID, assignedDriverName: 'Eu', groupJid: '2@g.us', name: 'Meu' },
      { assignedDriverId: 'outro', assignedDriverName: 'Zé', groupJid: '3@g.us', name: 'Do Zé' },
    ]

    expect(pickChoosableGroups(groups, DRIVER_ID).map((group) => group.groupJid)).toEqual([
      '1@g.us',
      '2@g.us',
    ])
  })

  it('português e inglês têm as mesmas chaves', () => {
    const keys = (value: Record<string, unknown>) => Object.keys(value).sort()
    expect(keys(enLocale.driverWhatsappGroup)).toEqual(keys(ptLocale.driverWhatsappGroup))
    expect(keys(enLocale.driverWhatsappGroup.errors)).toEqual(
      keys(ptLocale.driverWhatsappGroup.errors),
    )
  })
})
