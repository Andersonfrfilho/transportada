/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useDeliveries, useOccurrences } from '@/modules/deliveries/queries/portal.query'
import type { PortalClient } from '@/modules/shared/portalClient.service'
import { summarizeDeliveries } from './deliveryReport.service'

type SummaryPageProps = Readonly<{
  client: PortalClient
  onOpen: (tab: 'deliveries' | 'occurrences') => void
}>

/** Spec 340 D9: a tela inicial — o que está a caminho, atrasado, com ocorrência aberta e entregue. */
export function SummaryPage({ client, onOpen }: SummaryPageProps) {
  const deliveries = useDeliveries(client)
  const occurrences = useOccurrences(client)

  if (deliveries.isLoading) {
    return (
      <section className="page">
        <h1 className="page__title">Resumo</h1>
        <div className="skeleton" />
      </section>
    )
  }
  if (deliveries.error !== null) {
    return (
      <section className="page">
        <h1 className="page__title">Resumo</h1>
        <p className="page__subtitle">Não foi possível carregar o resumo agora.</p>
        <button onClick={() => void deliveries.refetch()} type="button">
          Tentar de novo
        </button>
      </section>
    )
  }

  const summary = summarizeDeliveries(deliveries.data ?? [], occurrences.data ?? [], new Date())
  const cards: readonly { label: string; target: 'deliveries' | 'occurrences'; value: number }[] = [
    { label: 'A caminho', target: 'deliveries', value: summary.inTransit },
    { label: 'Atrasadas', target: 'deliveries', value: summary.late },
    { label: 'Ocorrências em aberto', target: 'occurrences', value: summary.openOccurrences },
    { label: 'Entregues', target: 'deliveries', value: summary.delivered },
  ]

  return (
    <section className="page">
      <h1 className="page__title">Resumo</h1>
      <p className="page__subtitle">{summary.total} nota(s) sob acompanhamento.</p>
      <div className="summary-grid">
        {cards.map((card) => (
          <article className="panel" key={card.label}>
            <p className="panel__label">{card.label}</p>
            <p className="panel__value">{card.value}</p>
            <button className="secondary" onClick={() => onOpen(card.target)} type="button">
              Ver
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}
