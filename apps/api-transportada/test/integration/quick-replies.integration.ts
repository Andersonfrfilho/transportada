/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T701 (RF12), contra Postgres real: as respostas rápidas entram no fim do público, o
 * compositor lê só as ativas daquele público na ordem, reordenar grava a ordem pedida, desativar
 * tira do compositor sem apagar, e outra empresa não edita nem reordena as de uma. O banco segura o
 * teto de 500 caracteres e o público fechado mesmo sem passar pelo caso de uso.
 */
import { describe, expect } from 'bun:test'

import { companyQuickReplies } from '../../src/database/database.schema.js'
import { createQuickRepliesUseCase } from '../../src/occurrence-conversation/application/quick-replies.use-case.js'
import { createDrizzleQuickRepliesUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-quick-replies.repository.js'
import { withConversationDatabase } from '../fixtures/occurrence-conversation-database.fixture.js'
import { seedCompany, testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'

describe('as respostas rápidas contra Postgres (spec 183 T701)', () => {
  testWithPostgres(
    'fim do público, ordem, ativas no compositor e isolamento por empresa',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const other = await seedCompany(database)
        const replies = createQuickRepliesUseCase({
          unitOfWork: createDrizzleQuickRepliesUnitOfWork(database.db),
        })

        const first = await replies.create({
          audience: 'contractor',
          bodyText: '  Podem confirmar a autorização?  ',
          companyId,
        })
        const second = await replies.create({
          audience: 'contractor',
          bodyText: 'Recebemos, obrigado.',
          companyId,
        })
        await replies.create({ audience: 'driver', bodyText: 'Pode descarregar.', companyId })
        expect([first.position, second.position]).toEqual([0, 1])
        expect(first.bodyText).toBe('Podem confirmar a autorização?')

        await replies.reorder({ audience: 'contractor', companyId, ids: [second.id, first.id] })
        const texts = async () =>
          (await replies.listForComposer({ audience: 'contractor', companyId })).map(
            (reply) => reply.bodyText,
          )
        expect(await texts()).toEqual(['Recebemos, obrigado.', 'Podem confirmar a autorização?'])

        await replies.update({ active: false, companyId, id: second.id })
        expect(await texts()).toEqual(['Podem confirmar a autorização?'])
        /** Contratante antes de motorista, cada público na ordem gravada; a desativada fica. */
        expect(
          (await replies.listAll({ companyId })).map((reply) => [reply.audience, reply.active]),
        ).toEqual([
          ['contractor', false],
          ['contractor', true],
          ['driver', true],
        ])

        /** Outra empresa, com os ids na mão: não edita, não reordena, não lê. */
        await expect(
          replies.update({ active: false, companyId: other.companyId, id: first.id }),
        ).rejects.toMatchObject({ status: 404 })
        await expect(
          replies.reorder({
            audience: 'contractor',
            companyId: other.companyId,
            ids: [first.id, second.id],
          }),
        ).rejects.toMatchObject({ status: 422 })
        expect(await replies.listAll({ companyId: other.companyId })).toEqual([])
      })
    },
    30_000,
  )

  testWithPostgres(
    'o banco recusa texto acima de 500, em branco e público fora da lista',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId } = await seedCompany(database)
        const insert = async (values: { audience: string; bodyText: string }) => {
          await database.db.insert(companyQuickReplies).values({
            ...values,
            audience: values.audience as 'driver',
            companyId,
            position: 0,
          })
        }

        await expect(insert({ audience: 'driver', bodyText: 'x'.repeat(501) })).rejects.toThrow()
        await expect(insert({ audience: 'driver', bodyText: '   ' })).rejects.toThrow()
        await expect(insert({ audience: 'supplier', bodyText: 'Oi' })).rejects.toThrow()
      })
    },
    30_000,
  )
})
