/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useDeliveries, useOccurrences } from '@/modules/deliveries/queries/portal.query'
import type { PortalClient } from '@/modules/shared/portalClient.service'
import { deliveriesToCsv, filterByPeriod, summarizeDeliveries } from './deliveryReport.service'

type ReportsPageProps = Readonly<{ client: PortalClient }>

/** Spec 340 D8: relatório do período, com exportação CSV. Só o que o portal já mostra — sem frete, custo ou margem. */
export function ReportsPage({ client }: ReportsPageProps) {
  const deliveries = useDeliveries(client)
  const occurrences = useOccurrences(client)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const inPeriod = filterByPeriod(deliveries.data ?? [], { from, to })
  const summary = summarizeDeliveries(inPeriod, occurrences.data ?? [], new Date())
  const rated = summary.onTime + summary.late
  const onTimeRate = rated === 0 ? null : Math.round((summary.onTime / rated) * 100)

  function download() {
    const blob = new Blob(['﻿', deliveriesToCsv(inPeriod)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'entregas.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const rows: readonly (readonly [string, string])[] = [
    ['Notas no período', String(summary.total)],
    ['Entregues', String(summary.delivered)],
    ['Entregues no prazo', onTimeRate === null ? '—' : `${onTimeRate}%`],
    ['Atrasadas', String(summary.late)],
    ['A caminho', String(summary.inTransit)],
    ['Aguardando saída', String(summary.waiting)],
    ['Devolvidas', String(summary.returned)],
  ]

  return (
    <section className="page">
      <h1 className="page__title">Relatórios</h1>
      <div className="panel">
        <label className="panel__label" htmlFor="report-from">
          De
        </label>
        <input
          id="report-from"
          onChange={(event) => setFrom(event.target.value)}
          type="date"
          value={from}
        />
        <label className="panel__label" htmlFor="report-to">
          Até
        </label>
        <input
          id="report-to"
          onChange={(event) => setTo(event.target.value)}
          type="date"
          value={to}
        />
      </div>
      <article className="panel">
        {rows.map(([label, value]) => (
          <div className="panel__row" key={label}>
            <span className="panel__label">{label}</span>
            <span className="panel__value">{value}</span>
          </div>
        ))}
      </article>
      <button disabled={inPeriod.length === 0} onClick={download} type="button">
        Exportar CSV
      </button>
    </section>
  )
}
