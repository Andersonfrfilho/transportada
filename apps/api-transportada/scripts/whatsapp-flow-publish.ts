/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { FlowGraphRepository, OptimisticLockError } from '@adatechnology/meta-whatsapp-module'

import { previewWhatsAppFlowGraphPublication } from '../src/whatsapp-commands/application/publish-whatsapp-flow-graph.use-case.js'
import { WHATSAPP_ROOT_FLOW_GRAPH } from '../src/whatsapp-commands/infrastructure/whatsapp-flow-graph.constant.js'
import { createDrizzleWhatsAppFlowGraphPublisher } from '../src/whatsapp-commands/infrastructure/whatsapp-flow-graph-publisher.factory.js'

/**
 * `conversation-flow.md §1`: o grafo em código é ponto de partida, e a versão do banco manda depois
 * da primeira publicação — mas a base não semeia sozinha (`pre-deploy.service.ts` só cria quando não
 * existe; ver `docs/spec/144…/evidence.md`). Este comando é o caminho para ambiente novo, para
 * rollback e para revisão em PR, e nunca sobrescreve sem gravar histórico primeiro.
 *
 *   bun run scripts/whatsapp-flow-publish.ts --company <uuid>
 *   bun run scripts/whatsapp-flow-publish.ts --company <uuid> --confirm
 */
async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2))

  const databaseUrl = process.env.DATABASE_URL ?? ''
  if (databaseUrl.length === 0) throw new Error('DATABASE_URL ausente')

  const provider = createDrizzleProvider({ connection: databaseUrl })
  try {
    const companyId = options.companyId ?? (await resolveSingleCompany(provider.db))
    const graph = WHATSAPP_ROOT_FLOW_GRAPH
    const repository = new FlowGraphRepository(provider.db as never)

    const preview = await previewWhatsAppFlowGraphPublication({
      companyId,
      graph,
      module: repository,
    })

    process.stdout.write(formatPreview({ companyId, graph, preview }))

    if (preview.violations.length > 0) {
      process.stdout.write('grafo inválido para o WhatsApp — corrija antes de publicar.\n')
      return
    }

    if (!options.confirm) {
      process.stdout.write('nada foi publicado. repita com --confirm para publicar.\n')
      return
    }

    if (preview.diff.isEqual) {
      process.stdout.write('nenhuma mudança: a versão publicada já é esta. nada a fazer.\n')
      return
    }

    const publish = createDrizzleWhatsAppFlowGraphPublisher(provider.db)
    try {
      const outcome = await publish({
        companyId,
        graph,
        publishedBy: 'code',
        source: 'code',
      })
      process.stdout.write(formatOutcome(outcome))
    } catch (error) {
      if (error instanceof OptimisticLockError) {
        process.stdout.write(
          `conflito de versão: alguém publicou "${graph.key}" nesse meio-tempo — rode de novo.\n`,
        )
        return
      }
      throw error
    }
  } finally {
    await provider.close()
  }
}

type Options = Readonly<{ companyId: null | string; confirm: boolean }>

function parseArguments(argv: readonly string[]): Options {
  const value = (name: string): null | string => {
    const index = argv.indexOf(`--${name}`)
    return index === -1 ? null : (argv[index + 1] ?? null)
  }

  return { companyId: value('company'), confirm: argv.includes('--confirm') }
}

/** Instalação dedicada (ADR-0021): uma empresa é o caso normal, e duas exigem `--company`. */
async function resolveSingleCompany(
  database: ReturnType<typeof createDrizzleProvider>['db'],
): Promise<string> {
  const { companies } = await import('../src/database/database.schema.js')
  const rows = await database.select({ id: companies.id }).from(companies).limit(2)
  const [first] = rows
  if (first === undefined) throw new Error('nenhuma empresa na base')
  if (rows.length > 1) throw new Error('mais de uma empresa: informe --company <uuid>')

  return first.id
}

function formatPreview(input: {
  readonly companyId: string
  readonly graph: FlowGraphData
  readonly preview: Awaited<ReturnType<typeof previewWhatsAppFlowGraphPublication>>
}): string {
  const { companyId, graph, preview } = input
  const lines = [
    `empresa      ${companyId}`,
    `grafo        ${graph.key}`,
    `estado atual ${preview.current === undefined ? 'não publicado' : `versão ${preview.current.version}`}`,
  ]

  if (preview.violations.length > 0) {
    lines.push('violações:')
    for (const violation of preview.violations) {
      const detail = [violation.optionId, violation.actual, violation.limit]
        .filter((value) => value !== undefined)
        .join(' ')
      lines.push(
        `  - ${violation.rule} em "${violation.nodeId}"${detail === '' ? '' : ` (${detail})`}`,
      )
    }
  } else if (preview.current === undefined) {
    lines.push(`nós          ${Object.keys(graph.nodes).length} (grafo novo)`)
  } else if (preview.diff.isEqual) {
    lines.push('diff         nenhuma mudança')
  } else {
    lines.push(`nós adicionados  ${preview.diff.addedNodeIds.join(', ') || '(nenhum)'}`)
    lines.push(`nós removidos    ${preview.diff.removedNodeIds.join(', ') || '(nenhum)'}`)
    lines.push(`nós alterados    ${preview.diff.changedNodeIds.join(', ') || '(nenhum)'}`)
    if (preview.diff.labelChanged) lines.push(`rótulo           "${graph.label}"`)
    if (preview.diff.startNodeIdChanged) lines.push(`nó inicial       "${graph.startNodeId}"`)
  }

  return `${lines.join('\n')}\n\n`
}

function formatOutcome(
  outcome: Awaited<ReturnType<ReturnType<typeof createDrizzleWhatsAppFlowGraphPublisher>>>,
): string {
  if (outcome.kind === 'created') return `criado: versão ${outcome.graph.version}\n`
  if (outcome.kind === 'unchanged')
    return `sem mudança: continua na versão ${outcome.graph.version}\n`
  return `publicado: versão ${outcome.graph.version} (histórico guardou a anterior)\n`
}

await main()
