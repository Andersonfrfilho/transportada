/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useChargeBatches, useDecideBatch } from '@/modules/deliveries/queries/portal.query'
import type { PortalClient } from '@/modules/shared/portalClient.service'
import type { ChargeBatch, ChargeBatchItem, ChargeDecision } from '@/modules/shared/portal.types'

const CHARGE_TYPE_LABEL: Readonly<Record<string, string>> = {
  platform: 'Plataforma',
  scheduling: 'Agendamento',
  unloading: 'Descarga',
  waiting: 'Estadia',
}

type ChargeBatchListPageProps = Readonly<{ client: PortalClient }>

export function ChargeBatchListPage({ client }: ChargeBatchListPageProps) {
  const batches = useChargeBatches(client)

  if (batches.isLoading) {
    return (
      <section className="page">
        <h1 className="page__title">Repasses</h1>
        <div className="skeleton" />
        <div className="skeleton" />
      </section>
    )
  }

  const items = batches.data ?? []

  return (
    <section className="page">
      <h1 className="page__title">Repasses</h1>
      <p className="page__subtitle">
        {items.length === 0
          ? 'Nenhum fechamento enviado até agora.'
          : 'Confira linha a linha antes de aprovar.'}
      </p>
      {items.map((batch) => (
        <ChargeBatchPanel batch={batch} client={client} key={batch.batch.id} />
      ))}
    </section>
  )
}

type ChargeBatchPanelProps = Readonly<{ batch: ChargeBatch; client: PortalClient }>

/**
 * ADR-0050 §6: **linha a linha.** Aprovar o lote inteiro num clique existe como conveniência, mas a
 * decisão que a API grava é sempre por lançamento — é assim que a rejeição carrega o motivo daquela
 * cobrança, e não um motivo genérico colado em todas.
 */
function ChargeBatchPanel({ batch, client }: ChargeBatchPanelProps) {
  const decide = useDecideBatch(client)
  const [reasons, setReasons] = useState<Record<string, string>>({})

  const pending = batch.items.filter((item) => item.status === 'submitted')

  function submit(decisions: readonly ChargeDecision[]): void {
    if (decisions.length === 0) return
    decide.mutate({ batchId: batch.batch.id, decisions })
  }

  return (
    <article className="panel">
      <div className="panel__row">
        <div>
          <p className="panel__label">Período</p>
          <p className="panel__value">
            {formatDay(batch.batch.periodStart)} a {formatDay(batch.batch.periodEnd)}
          </p>
        </div>
        <div>
          <p className="panel__label">Total</p>
          <p className="panel__value">{formatAmount(batch.itemsTotal)}</p>
        </div>
      </div>
      {batch.items.map((item) => (
        <ChargeRow
          item={item}
          key={item.id}
          onApprove={() => submit([{ chargeId: item.id, decision: 'approved', reason: '' }])}
          onReasonChange={(reason) => setReasons((current) => ({ ...current, [item.id]: reason }))}
          onReject={() =>
            submit([{ chargeId: item.id, decision: 'rejected', reason: reasons[item.id] ?? '' }])
          }
          reason={reasons[item.id] ?? ''}
        />
      ))}
      {pending.length > 1 && (
        <button
          disabled={decide.isPending}
          onClick={() =>
            submit(
              pending.map((item) => ({
                chargeId: item.id,
                decision: 'approved' as const,
                reason: '',
              })),
            )
          }
          type="button"
        >
          Aprovar as {pending.length} pendentes
        </button>
      )}
      {decide.isError && <p className="panel__label">Não foi possível registrar a decisão.</p>}
    </article>
  )
}

type ChargeRowProps = Readonly<{
  item: ChargeBatchItem
  onApprove: () => void
  onReasonChange: (reason: string) => void
  onReject: () => void
  reason: string
}>

function ChargeRow({ item, onApprove, onReasonChange, onReject, reason }: ChargeRowProps) {
  const isPending = item.status === 'submitted'

  return (
    <div className="panel">
      <div className="panel__row">
        <span className="panel__value">
          {CHARGE_TYPE_LABEL[item.chargeType] ?? item.chargeType} · {item.clientName}
        </span>
        <span className="panel__value">{formatAmount(item.amount)}</span>
      </div>
      <div className="panel__row">
        <span className="panel__label">{formatDay(item.chargedOn)}</span>
        <span className={`badge badge--${isPending ? 'pending' : 'done'}`}>
          {statusLabel(item.status)}
        </span>
      </div>
      {item.rejectionReason !== '' && (
        <p className="panel__label">Recusado: {item.rejectionReason}</p>
      )}
      {isPending && (
        <>
          <label>
            <span className="panel__label">Motivo, se for recusar</span>
            <input onChange={(event) => onReasonChange(event.target.value)} value={reason} />
          </label>
          <div className="nav">
            <button onClick={onApprove} type="button">
              Aprovar
            </button>
            <button className="secondary" onClick={onReject} type="button">
              Recusar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function statusLabel(status: string): string {
  if (status === 'approved') return 'Aprovado'
  if (status === 'rejected') return 'Recusado'
  if (status === 'reimbursed') return 'Reembolsado'
  return 'Aguardando você'
}

/** Dinheiro chega como texto de `numeric` e é formatado sem virar float — só troca de separador. */
function formatAmount(value: string): string {
  const [whole = '0', fraction = '0000'] = value.split('.')
  return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction.slice(0, 2).padEnd(2, '0')}`
}

function formatDay(value: string): string {
  const [year, month, day] = value.split('-')
  return day === undefined ? value : `${day}/${month}/${year}`
}
