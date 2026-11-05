/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createDriverWhatsappGroupUseCase } from '../../src/fleet/application/driver-whatsapp-group.use-case.js'
import { readGroups } from '../../src/whatsapp/infrastructure/evolution-connection.gateway.js'

describe('a lista de grupos da ficha (spec 292 T1)', () => {
  test('marca o motorista dono de cada grupo e deixa os livres sem dono', async () => {
    const useCase = createDriverWhatsappGroupUseCase({
      listEvolutionGroups: async () => [
        { groupJid: '1@g.us', name: 'Livre' },
        { groupJid: '2@g.us', name: 'Do João' },
      ],
      repository: {
        find: async () => null,
        listAssignments: async () => [{ driverId: 'd1', driverName: 'João', groupJid: '2@g.us' }],
        remove: async () => false,
        set: async () => {
          throw new Error('não deveria gravar')
        },
      },
    })

    expect(await useCase.listGroups({ companyId: 'c1' })).toEqual([
      { assignedDriverId: null, assignedDriverName: null, groupJid: '1@g.us', name: 'Livre' },
      { assignedDriverId: 'd1', assignedDriverName: 'João', groupJid: '2@g.us', name: 'Do João' },
    ])
  })
})

describe('a leitura dos grupos do Evolution (spec 292 T1)', () => {
  test('só fica o que é grupo, sem repetição, em ordem alfabética, com o id como nome quando falta', () => {
    expect(
      readGroups([
        { id: '3@g.us', subject: 'Zeca' },
        { id: '5516993857105@s.whatsapp.net', subject: 'Pessoa' },
        { id: '1@g.us', subject: ' ana ' },
        { id: '1@g.us', subject: 'ana' },
        { id: '55-16@g.us' },
        { subject: 'sem id' },
        null,
        'texto',
      ]),
    ).toEqual([
      { groupJid: '55-16@g.us', name: '55-16@g.us' },
      { groupJid: '1@g.us', name: 'ana' },
      { groupJid: '3@g.us', name: 'Zeca' },
    ])
    expect(readGroups({ message: 'erro' })).toEqual([])
  })
})
