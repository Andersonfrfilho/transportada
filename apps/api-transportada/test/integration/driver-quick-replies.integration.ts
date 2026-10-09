/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T5.1 (D11), contra Postgres real: a rota do motorista lê só as respostas ATIVAS do público
 * `driver_reply`, na ordem do cadastro, da empresa do contexto; o compositor do escritório (públicos
 * `contractor` e `driver`) não traz as do motorista; o banco recusa público fora da lista.
 */
import { describe, expect } from 'bun:test'

import { companyQuickReplies } from '../../src/database/database.schema.js'
import { createQuickRepliesUseCase } from '../../src/occurrence-conversation/application/quick-replies.use-case.js'
import { createDrizzleQuickRepliesUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-quick-replies.repository.js'
import { createMeQuickReplyRoutes } from '../../src/occurrence-conversation/presentation/me-quick-replies.routes.js'
import { withConversationDatabase } from '../fixtures/occurrence-conversation-database.fixture.js'
import { seedCompany, testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'

const DRIVER_ID = '00000000-0000-4000-8000-000000000202'

describe('as respostas prontas do motorista contra Postgres (spec 260 T5.1)', () => {
  testWithPostgres(
    'a rota lê só as ativas do público driver_reply, na ordem, da empresa certa',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const other = await seedCompany(database)
        const replies = createQuickRepliesUseCase({
          unitOfWork: createDrizzleQuickRepliesUnitOfWork(database.db),
        })
        const [route] = createMeQuickReplyRoutes({
          quickReplies: replies,
          resolveDriverId: async () => DRIVER_ID,
        })
        const read = async (forCompanyId: string) =>
          (await (
            await route!.execute({
              context: {
                scope: { companyId: forCompanyId, membershipId: 'membership-1' },
              } as never,
              pathParameters: {},
              request: new Request('http://api.test/me/trips/current/quick-replies'),
            } as never)
          ).json()) as { data: { id: string; text: string }[] }

        const arrived = await replies.create({
          audience: 'driver_reply',
          bodyText: 'Cheguei',
          companyId,
        })
        const onTheWay = await replies.create({
          audience: 'driver_reply',
          bodyText: 'Estou a caminho',
          companyId,
        })
        const hidden = await replies.create({
          audience: 'driver_reply',
          bodyText: 'Oculta',
          companyId,
        })
        await replies.create({ audience: 'contractor', bodyText: 'Da contratante', companyId })
        await replies.create({
          audience: 'driver',
          bodyText: 'Do escritório ao motorista',
          companyId,
        })
        await replies.create({
          audience: 'driver_reply',
          bodyText: 'Da outra empresa',
          companyId: other.companyId,
        })

        expect((await read(companyId)).data.map((reply) => reply.text)).toEqual([
          'Cheguei',
          'Estou a caminho',
          'Oculta',
        ])
        await replies.reorder({
          audience: 'driver_reply',
          companyId,
          ids: [onTheWay.id, hidden.id, arrived.id],
        })
        await replies.update({ active: false, companyId, id: hidden.id })

        expect(await read(companyId)).toEqual({
          data: [
            { id: onTheWay.id, text: 'Estou a caminho' },
            { id: arrived.id, text: 'Cheguei' },
          ],
        })
        expect((await read(other.companyId)).data.map((reply) => reply.text)).toEqual([
          'Da outra empresa',
        ])
        expect((await read(crypto.randomUUID())).data).toEqual([])
      })
    },
    30_000,
  )

  testWithPostgres(
    'o compositor do escritório não traz as do motorista, e o cadastro lista os três públicos',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const replies = createQuickRepliesUseCase({
          unitOfWork: createDrizzleQuickRepliesUnitOfWork(database.db),
        })

        await replies.create({ audience: 'driver_reply', bodyText: 'Cheguei', companyId })
        await replies.create({ audience: 'contractor', bodyText: 'Da contratante', companyId })
        await replies.create({ audience: 'driver', bodyText: 'Ao motorista', companyId })

        const texts = async (audience: 'contractor' | 'driver') =>
          (await replies.listForComposer({ audience, companyId })).map((reply) => reply.bodyText)
        expect(await texts('contractor')).toEqual(['Da contratante'])
        expect(await texts('driver')).toEqual(['Ao motorista'])
        expect((await replies.listAll({ companyId })).map((reply) => reply.audience)).toEqual([
          'contractor',
          'driver',
          'driver_reply',
        ])
      })
    },
    30_000,
  )

  testWithPostgres(
    'o banco recusa público fora da lista e aceita driver_reply',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const insert = async (audience: string) => {
          await database.db.insert(companyQuickReplies).values({
            audience: audience as 'driver',
            bodyText: 'Oi',
            companyId,
            position: 0,
          })
        }

        await insert('driver_reply')
        await expect(insert('supplier')).rejects.toThrow()
        await expect(insert('driver_replies')).rejects.toThrow()
      })
    },
    30_000,
  )
})
