/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import { safeLogError, safeLogInfo } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import { WHATSAPP_PHONE_VERIFICATION_VALIDITY_MS } from '../../whatsapp/domain/whatsapp-phone-verification.constant.js'
import {
  decideWhatsAppCommandSettlement,
  WHATSAPP_COMMAND_STUCK_CONFIRMING_MILLISECONDS,
} from '../domain/whatsapp-command-settlement.policy.js'
import type {
  SettlementCandidate,
  SettlementCandidateSourcePort,
  SettlementRecipientPort,
  SettlementSummarySenderPort,
  WhatsAppCommandSettlementApiPort,
} from './whatsapp-command-settlement.port.js'

/** Teto por batida: o que sobrar volta na próxima, cinco minutos depois. */
export const WHATSAPP_COMMAND_SETTLEMENT_CANDIDATE_LIMIT = 200

export type WhatsAppCommandSettlementRoutineDependencies = {
  readonly api: WhatsAppCommandSettlementApiPort
  readonly candidates: SettlementCandidateSourcePort
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly recipients: SettlementRecipientPort
  readonly sender: SettlementSummarySenderPort
}

type Counters = {
  candidates: number
  failed: number
  requested: number
  summariesSent: number
  summariesUndelivered: number
  summariesWithoutPhone: number
  waiting: number
}

/**
 * Spec 144 T014 — a varredura da liquidação. Ela **não decide**: calcula o veredito só para saber
 * quem vale uma chamada, e a API recalcula pelo banco antes de faturar. Varredura e não evento,
 * porque a NFS-e só muda de estado pelo `nfse.status.pull`.
 *
 * Duas execuções não correm juntas: a linha de `job_executions` tem uma aberta por rotina, e o lease
 * reivindica a mesma execução uma vez só — é isso que deixa a retomada do `confirming` ser daqui.
 */
export function createWhatsAppCommandSettlementRoutine(
  dependencies: WhatsAppCommandSettlementRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: WhatsAppCommandSettlementRoutineDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const now = dependencies.now()
  const candidates = await dependencies.candidates.listCandidates({
    limit: WHATSAPP_COMMAND_SETTLEMENT_CANDIDATE_LIMIT,
    now,
    stuckConfirmingBefore: new Date(now.getTime() - WHATSAPP_COMMAND_STUCK_CONFIRMING_MILLISECONDS),
  })
  const counters: Counters = {
    candidates: candidates.length,
    failed: 0,
    requested: 0,
    summariesSent: 0,
    summariesUndelivered: 0,
    summariesWithoutPhone: 0,
    waiting: 0,
  }
  // Em série de propósito: a parada é lida entre pedidos, e a API fatura um pedido por vez.
  for (const candidate of candidates) {
    if (context.isStopRequested()) break
    await processCandidate({ candidate, context, counters, dependencies, now })
  }

  safeLogInfo({
    logger: dependencies.logger,
    message: 'whatsapp_command_settlement_cycle_finished',
    metadata: {
      ...counters,
      correlationId: context.correlationId,
      executionId: context.executionId,
    },
  })
  return {
    counters: { ...counters },
    outcome: counters.failed > 0 ? 'settlement_request_failed' : 'succeeded',
  }
}

async function processCandidate(input: {
  readonly candidate: SettlementCandidate
  readonly context: JobRoutineContext
  readonly counters: Counters
  readonly dependencies: WhatsAppCommandSettlementRoutineDependencies
  readonly now: Date
}): Promise<void> {
  const { candidate, counters, dependencies } = input
  const hint = decideWhatsAppCommandSettlement({
    confirmedAt: candidate.confirmedAt,
    documents: candidate.documents,
    now: input.now,
    status: candidate.status,
  })
  if (hint === 'wait') {
    counters.waiting += 1
    return
  }

  counters.requested += 1
  const metadata = candidateMetadata(input)
  let result: Awaited<ReturnType<WhatsAppCommandSettlementApiPort['settle']>>
  try {
    result = await dependencies.api.settle({
      companyId: candidate.companyId,
      hint,
      requestId: candidate.id,
    })
  } catch (error) {
    counters.failed += 1
    safeLogError({
      logger: dependencies.logger,
      message: 'whatsapp_command_settlement_request_failed',
      metadata: { ...metadata, reason: error instanceof Error ? error.message : 'UnknownError' },
    })
    return
  }
  if (result.message !== undefined) await deliverSummary({ ...input, message: result.message })
}

/**
 * O resumo é conveniência, não parte da liquidação: ela já está gravada quando ele sai. Sem número
 * vinculado não há para onde mandar, e a Meta recusando o texto livre (janela de 24 h fechada) fica
 * registrada — forçar um template aqui seria prometer ao usuário uma mensagem que ele não pediu.
 */
async function deliverSummary(input: {
  readonly candidate: SettlementCandidate
  readonly context: JobRoutineContext
  readonly counters: Counters
  readonly dependencies: WhatsAppCommandSettlementRoutineDependencies
  readonly message: string
  readonly now: Date
}): Promise<void> {
  const { candidate, counters, dependencies } = input
  // T014b (M2): a mesma régua da API para aceitar o remetente — chip reciclado não recebe o resumo.
  const to = await dependencies.recipients.findVerifiedPhone({
    userId: candidate.actorUserId,
    verifiedSince: new Date(input.now.getTime() - WHATSAPP_PHONE_VERIFICATION_VALIDITY_MS),
  })
  if (to === undefined) {
    counters.summariesWithoutPhone += 1
    safeLogInfo({
      logger: dependencies.logger,
      message: 'whatsapp_command_settlement_summary_without_phone',
      metadata: candidateMetadata(input),
    })
    return
  }
  try {
    await dependencies.sender.sendText({ body: input.message, companyId: candidate.companyId, to })
    counters.summariesSent += 1
  } catch (error) {
    counters.summariesUndelivered += 1
    // Só o nome do erro: a mensagem da Graph API pode ecoar o destinatário ou o corpo.
    safeLogError({
      logger: dependencies.logger,
      message: 'whatsapp_command_settlement_summary_undelivered',
      metadata: {
        ...candidateMetadata(input),
        reason: error instanceof Error ? error.name : 'UnknownError',
      },
    })
  }
}

function candidateMetadata(input: {
  readonly candidate: SettlementCandidate
  readonly context: JobRoutineContext
}): Record<string, string> {
  return {
    companyId: input.candidate.companyId,
    correlationId: input.context.correlationId,
    requestId: input.candidate.id,
  }
}
