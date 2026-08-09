/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { createCteIssuanceWorkerEffect } from '../src/cte-issuance/application/cte-issuance-consumer.effect.js'
import type { CteIssuanceDiagnosticsRecord } from '../src/cte-issuance/domain/cte-issuance-diagnostics.policy.js'
import {
  CTE_DIAGNOSTICS_RETENTION_DAYS,
  redactCteDiagnosticsValue,
  resolveCteDiagnosticsExpiry,
} from '../src/cte-issuance/domain/cte-issuance-diagnostics.policy.js'
import type {
  CteFiscalProvider,
  CteProviderEmitResult,
} from '../src/cte-issuance/infrastructure/cte-fiscal-gateway.js'
import type { CteProcessingEnvelopeV1 } from '../src/messaging/cte-processing-envelope.schema.js'
import type { WorkerLogger } from '../src/shared/worker.types.js'

const CERTIFICATE = 'MIIEowIBAAKCAQEAsegredodocertificado'
const CERTIFICATE_PASSWORD = 'senha-do-pfx'

const ENVELOPE: CteProcessingEnvelopeV1 = {
  actorId: '94127a9d-22c9-4df0-805f-7654290e251a',
  companyId: 'fbc033e7-63e0-4698-adc6-12778bedf4a7',
  correlationId: 'diagnostics-contract',
  eventId: '2cb3a13d-1c71-47df-9406-1a297e752e10',
  occurredAt: '2026-08-06T02:59:00.000Z',
  payload: {
    attemptFingerprint: 'ctefingerprint-diagnostics',
    attemptId: '4f6f2e89-bf9b-4d16-b7e7-d8ce6b0f6f5d',
    attemptKind: 'issue',
    batchId: 'd2f4ef6d-4f5d-45af-a9b0-bf4e0f8f8d4d',
    batchItemId: '8a7d8b98-ff3e-4f5f-9967-57fdb2e7e2d8',
    status: 'requested',
  },
  type: 'transportada.cte.item.issue.requested',
  version: 1,
}

/**
 * Três CT-es ficaram "Transmitindo" em staging e não sobrou uma linha para dizer por quê: o
 * provedor devolvia `rawResponse`, o gateway jogava fora e o erro morria num `catch` vazio do
 * provider de fila. Este contrato exige que a requisição e a resposta crua fiquem registradas.
 */
describe('Diagnóstico da emissão de CT-e', () => {
  it('registra a requisição antes de falar com o provedor', async () => {
    const order: string[] = []
    const records: CteIssuanceDiagnosticsRecord[] = []
    const effect = createEffect({
      onEmit: () => {
        order.push('emit')
        return rejectedResult()
      },
      onRecord: (record) => order.push(`record:${record.phase}`),
      records,
    })

    await expect(effect.execute({ envelope: ENVELOPE })).rejects.toThrow()

    expect(order).toEqual(['record:request', 'emit', 'record:response'])
    expect(records[0]).toMatchObject({
      attemptId: ENVELOPE.payload.attemptId,
      attemptKind: ENVELOPE.payload.attemptKind,
      batchId: ENVELOPE.payload.batchId,
      batchItemId: ENVELOPE.payload.batchItemId,
      companyId: ENVELOPE.companyId,
      correlationId: ENVELOPE.correlationId,
      eventId: ENVELOPE.eventId,
      phase: 'request',
    })
  })

  it('guarda o payload inteiro para repetir a emissão', async () => {
    const records: CteIssuanceDiagnosticsRecord[] = []
    const effect = createEffect({ onEmit: rejectedResult, records })

    await expect(effect.execute({ envelope: ENVELOPE })).rejects.toThrow()

    const request = records[0]?.request as Record<string, unknown>
    expect(request['cteData']).toMatchObject({ valorTotalReceber: 250.5 })
    expect(request['config']).toMatchObject({
      cnpj: '11222333000181',
      numeroCte: 14093,
      serie: '1',
    })
    expect(request['documentId']).toBe('document-1')
    expect(request['tenantId']).toBe(ENVELOPE.companyId)
  })

  it('nunca leva certificado nem senha para o diagnóstico', async () => {
    const records: CteIssuanceDiagnosticsRecord[] = []
    const effect = createEffect({ onEmit: rejectedResult, records })

    await expect(effect.execute({ envelope: ENVELOPE })).rejects.toThrow()

    const serialized = JSON.stringify(records)
    expect(serialized).not.toContain(CERTIFICATE)
    expect(serialized).not.toContain(CERTIFICATE_PASSWORD)
    expect(serialized).toContain('[REDACTED]')
  })

  /** É a resposta da SEFAZ que diz qual campo do CT-e a rejeição condena — o código sozinho não. */
  it('guarda a resposta crua do provedor quando a SEFAZ rejeita', async () => {
    const records: CteIssuanceDiagnosticsRecord[] = []
    const effect = createEffect({ onEmit: rejectedResult, records })

    await expect(effect.execute({ envelope: ENVELOPE })).rejects.toThrow()

    const response = records[1]?.response as Record<string, unknown>
    expect(records[1]?.phase).toBe('response')
    expect(response['status']).toBe('rejected')
    expect(response['rejection']).toMatchObject({ code: '539' })
    expect(JSON.stringify(response['raw'])).toContain('Duplicidade de CT-e')
    expect(records[1]?.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('guarda a causa e a resposta crua quando o provedor estoura', async () => {
    const records: CteIssuanceDiagnosticsRecord[] = []
    const effect = createEffect({
      onEmit: () => {
        const failure = new Error('socket hang up ao chamar a SEFAZ')
        failure.name = 'FiscalTimeoutError'
        throw failure
      },
      records,
    })

    await expect(effect.execute({ envelope: ENVELOPE })).rejects.toThrow()

    const response = records[1]?.response as Record<string, unknown>
    expect(response['status']).toBe('error')
    expect(response['cause']).toBe('FiscalTimeoutError')
    expect(JSON.stringify(response['raw'])).toContain('socket hang up')
  })

  /** O XML autorizado já está no object storage: aqui basta o digest para conferir que é o mesmo. */
  it('resume o XML autorizado em digest em vez de copiar o documento', async () => {
    const records: CteIssuanceDiagnosticsRecord[] = []
    const effect = createEffect({
      onEmit: () => ({
        success: true,
        chaveAcesso: '35260611222333000181570010000140931000140937',
        protocolo: '135260000000001',
        xmlAutorizado: `<cteProc>${'a'.repeat(9_000)}</cteProc>`,
        rawResponse: { cStat: '100', xMotivo: 'Autorizado o uso do CT-e' },
      }),
      records,
    })

    await effect.execute({ envelope: ENVELOPE })

    const response = records[1]?.response as Record<string, unknown>
    const authorizedXml = response['authorizedXml'] as Record<string, unknown>
    expect(response['status']).toBe('ok')
    expect(authorizedXml).toMatchObject({ length: expect.any(Number) })
    expect(String(authorizedXml['sha256'])).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(response)).not.toContain('aaaaaaaaaa')
  })

  /** Erro fora do provedor é o caso que sumiu em staging: sem isto ele volta a não deixar rastro. */
  it('registra o erro inteiro quando a emissão estoura fora do provedor', async () => {
    const records: CteIssuanceDiagnosticsRecord[] = []
    const failure = new Error('Connection terminated unexpectedly', {
      cause: new Error('socket hang up'),
    })
    failure.name = 'DatabaseError'
    const effect = createEffect({
      onEmit: () => ({ success: true, rawResponse: {} }),
      onRecordInFlight: () => {
        throw failure
      },
      records,
    })

    await expect(effect.execute({ envelope: ENVELOPE })).rejects.toThrow('Connection terminated')

    const errorRecord = records.find((record) => record.phase === 'error')
    expect(errorRecord?.error).toMatchObject({
      errorCauses: ['Error: socket hang up'],
      errorMessage: 'Connection terminated unexpectedly',
      errorName: 'DatabaseError',
    })
    expect(String(errorRecord?.error?.errorStack)).toContain('DatabaseError')
  })

  /** Diagnóstico é registro auxiliar: se o banco dele cair, a emissão segue e a falha vira log. */
  it('não deixa o diagnóstico derrubar a emissão', async () => {
    const logs: string[] = []
    const effect = createEffect({
      logger: createLogger(logs),
      onEmit: () => ({ success: true, protocolo: '135260000000001', rawResponse: {} }),
      onRecord: () => {
        throw new Error('diagnostics table is gone')
      },
      records: [],
    })

    await effect.execute({ envelope: ENVELOPE })

    expect(logs).toContain('warn:cte_issuance_diagnostics_record_failed')
  })

  it('marca validade para o registro temporário expirar', () => {
    const occurredAt = new Date('2026-08-06T03:00:00.000Z')
    const expiresAt = resolveCteDiagnosticsExpiry({ occurredAt })

    expect(CTE_DIAGNOSTICS_RETENTION_DAYS).toBeGreaterThan(0)
    expect(expiresAt.getTime() - occurredAt.getTime()).toBe(
      CTE_DIAGNOSTICS_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
    )
  })

  it('apaga segredo em qualquer profundidade do valor registrado', () => {
    const redacted = redactCteDiagnosticsValue({
      envelope: { certificadoSenha: CERTIFICATE_PASSWORD },
      list: [{ certificadoBase64: CERTIFICATE }, { accessToken: 'abc' }],
      xml: `<Signature><X509Certificate>${CERTIFICATE}</X509Certificate></Signature>`,
    }) as Record<string, unknown>

    const serialized = JSON.stringify(redacted)
    expect(serialized).not.toContain(CERTIFICATE)
    expect(serialized).not.toContain(CERTIFICATE_PASSWORD)
    expect(serialized).not.toContain('"abc"')
  })
})

function rejectedResult(): CteProviderEmitResult {
  return {
    success: false,
    errorCode: '539',
    rawResponse: {
      cStat: '539',
      xMotivo: 'Duplicidade de CT-e com diferenca na chave de acesso',
    },
  }
}

function createEffect(params: {
  readonly logger?: WorkerLogger
  readonly onEmit: () => CteProviderEmitResult
  readonly onRecord?: (record: CteIssuanceDiagnosticsRecord) => void
  readonly onRecordInFlight?: () => void
  readonly records: CteIssuanceDiagnosticsRecord[]
}) {
  return createCteIssuanceWorkerEffect({
    createProvider: () => createProvider(params.onEmit),
    diagnostics: {
      async record(record) {
        params.records.push(record)
        params.onRecord?.(record)
      },
    },
    logger: params.logger ?? createLogger([]),
    async resolveExecutionInput() {
      return {
        config: {
          bairro: 'Centro',
          cep: '01001000',
          certificadoBase64: CERTIFICATE,
          certificadoSenha: CERTIFICATE_PASSWORD,
          cnpj: '11222333000181',
          codigoMunicipio: '3550308',
          crt: '3',
          environment: 'homologation',
          inscricaoEstadual: '111111111111',
          logradouro: 'Praca da Se',
          municipio: 'Sao Paulo',
          numero: '1',
          numeroCte: 14_093,
          razaoSocial: 'Transportadora Contrato',
          rntrc: '12345678',
          serie: '1',
          uf: 'SP',
        },
        cteData: { valorTotalReceber: 250.5 },
        documentId: 'document-1',
        tenantId: ENVELOPE.companyId,
      }
    },
    writeBack: createWriteBack(params.onRecordInFlight),
  })
}

function createProvider(onEmit: () => CteProviderEmitResult): CteFiscalProvider {
  return {
    async cancel() {
      return { success: true, rawResponse: {} }
    },
    async emit() {
      return onEmit()
    },
    async testConnection() {
      return { ok: true, rawResponse: {} }
    },
  }
}

function createWriteBack(onRecordInFlight?: () => void) {
  return {
    async recordAuthorized(): Promise<void> {},
    async recordCancellationRejected(): Promise<void> {},
    async recordCancelled(): Promise<void> {},
    async recordInFlight(): Promise<void> {
      onRecordInFlight?.()
    },
    async recordRejected(): Promise<void> {},
    async recordRetryScheduled(): Promise<void> {},
  }
}

function createLogger(logs: string[]): WorkerLogger {
  return {
    error(message) {
      logs.push(`error:${message}`)
    },
    info(message) {
      logs.push(`info:${message}`)
    },
    warn(message) {
      logs.push(`warn:${message}`)
    },
  }
}
