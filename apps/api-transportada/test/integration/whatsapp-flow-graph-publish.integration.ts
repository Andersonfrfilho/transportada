/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T008 — o publicador de verdade: `FlowGraphRepository` do módulo (schema `meta_whatsapp`,
 * que só vem com a migração completa) e o histórico da nossa `whatsapp_flow_graph_versions` gravando
 * na mesma transação, mais o trigger append-only recusando `UPDATE`/`DELETE`.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { FlowGraphRepository } from '@adatechnology/meta-whatsapp-module'
import { asc, eq } from 'drizzle-orm'

import { runAllDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies, whatsappFlowGraphVersions } from '../../src/database/database.schema.js'
import { previewWhatsAppFlowGraphPublication } from '../../src/whatsapp-commands/application/publish-whatsapp-flow-graph.use-case.js'
import { createDrizzleWhatsAppFlowGraphPublisher } from '../../src/whatsapp-commands/infrastructure/whatsapp-flow-graph-publisher.factory.js'

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const GRAPH: FlowGraphData = {
  key: 'root',
  label: 'Menu',
  nodes: {
    about: { directMessage: 'sobre', id: 'about', type: 'action' },
    menu: {
      fallbackMessage: 'Escolha.',
      id: 'menu',
      next: { byAnswer: { about: 'about' }, default: 'menu' },
      options: [['about', 'ℹ️ Sobre']],
      question: 'O que você quer?',
      type: 'menu',
    },
  },
  startNodeId: 'menu',
  version: 1,
}

describe('publicador do grafo do WhatsApp (Postgres)', () => {
  testWithPostgres('cria, republica e guarda a versão anterior no histórico', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const publish = createDrizzleWhatsAppFlowGraphPublisher(db)
      const repository = new FlowGraphRepository(db as never)

      const created = await publish({
        companyId,
        graph: GRAPH,
        publishedBy: 'code',
        source: 'code',
      })
      expect(created.kind).toBe('created')
      expect(created.graph.version).toBe(1)
      expect(await historyRows(db, companyId)).toEqual([])

      const unchanged = await publish({
        companyId,
        graph: GRAPH,
        publishedBy: 'code',
        source: 'code',
      })
      expect(unchanged).toEqual({ graph: { ...GRAPH, version: 1 }, kind: 'unchanged' })
      expect(await historyRows(db, companyId)).toEqual([])

      const changed: FlowGraphData = { ...GRAPH, label: 'Menu novo' }
      const updated = await publish({
        companyId,
        graph: changed,
        publishedBy: 'code',
        source: 'code',
      })
      expect(updated.kind).toBe('updated')
      expect(updated.graph.version).toBe(2)
      expect(updated.graph.label).toBe('Menu novo')

      const history = await historyRows(db, companyId)
      expect(history).toHaveLength(1)
      expect(history[0]).toMatchObject({
        flowKey: GRAPH.key,
        label: GRAPH.label,
        publishedBy: 'code',
        source: 'code',
        version: 1,
      })

      const live = await repository.get(companyId, GRAPH.key)
      expect(live?.version).toBe(2)
      expect(live?.label).toBe('Menu novo')

      const preview = await previewWhatsAppFlowGraphPublication({
        companyId,
        graph: changed,
        module: repository,
      })
      expect(preview.diff.isEqual).toBeTrue()
    })
  })

  testWithPostgres(
    'o histórico é append-only: UPDATE e DELETE são recusados pelo trigger',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = await seedCompany(db)
        const publish = createDrizzleWhatsAppFlowGraphPublisher(db)
        await publish({ companyId, graph: GRAPH, publishedBy: 'code', source: 'code' })
        await publish({
          companyId,
          graph: { ...GRAPH, label: 'Menu novo' },
          publishedBy: 'code',
          source: 'code',
        })

        await expect(
          Promise.resolve(
            db
              .update(whatsappFlowGraphVersions)
              .set({ label: 'adulterado' })
              .where(eq(whatsappFlowGraphVersions.companyId, companyId)),
          ),
        ).rejects.toThrow()

        await expect(
          Promise.resolve(
            db
              .delete(whatsappFlowGraphVersions)
              .where(eq(whatsappFlowGraphVersions.companyId, companyId)),
          ),
        ).rejects.toThrow()
      })
    },
  )
})

async function historyRows(
  db: TestDatabase['db'],
  companyId: string,
): Promise<
  readonly {
    flowKey: string
    label: string
    publishedBy: string
    source: string
    version: number
  }[]
> {
  const rows = await db
    .select({
      flowKey: whatsappFlowGraphVersions.flowKey,
      label: whatsappFlowGraphVersions.label,
      publishedBy: whatsappFlowGraphVersions.publishedBy,
      source: whatsappFlowGraphVersions.source,
      version: whatsappFlowGraphVersions.version,
    })
    .from(whatsappFlowGraphVersions)
    .where(eq(whatsappFlowGraphVersions.companyId, companyId))
    .orderBy(asc(whatsappFlowGraphVersions.version))
  return rows
}

async function seedCompany(db: TestDatabase['db']): Promise<string> {
  const companyId = crypto.randomUUID()
  await db.insert(companies).values({ id: companyId, status: 'active' })
  return companyId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_flowpub_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    /** O schema `meta_whatsapp` (flow_graphs) só vem com a migração completa. */
    await runAllDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
    await operation(database)
  } finally {
    try {
      await database?.close()
    } finally {
      try {
        await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin.close({ timeout: 0 })
      }
    }
  }
}
