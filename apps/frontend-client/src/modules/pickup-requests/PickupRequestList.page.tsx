/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import type { ReactNode } from 'react'

import { PickupRequestFormComponent } from './PickupRequestForm.component'
import { useCancelPickupRequest, usePickupRequests } from './queries/pickupRequest.query'
import { canCancelPickup, formatPickupDay, pickupStatusLabel } from './pickupRequestForm.validation'
import type { PortalClient } from '@/modules/shared/portalClient.service'
import type { PickupRequest } from '@/modules/shared/portal.types'

type PickupRequestListPageProps = Readonly<{ client: PortalClient; today: string }>

export function PickupRequestListPage({ client, today }: PickupRequestListPageProps): ReactNode {
  const requests = usePickupRequests(client)
  const [creating, setCreating] = useState(false)

  if (creating) {
    return (
      <section className="page">
        <h1 className="page__title">Pedir coleta ou entrega</h1>
        <PickupRequestFormComponent
          client={client}
          onDone={() => setCreating(false)}
          today={today}
        />
      </section>
    )
  }

  const items = requests.data ?? []
  return (
    <section className="page">
      <h1 className="page__title">Coletas e entregas</h1>
      <p className="page__subtitle">
        {items.length === 0
          ? 'Você ainda não fez nenhum pedido.'
          : 'Acompanhe aqui o andamento dos seus pedidos.'}
      </p>
      <button onClick={() => setCreating(true)} type="button">
        Fazer um pedido
      </button>
      {requests.isLoading && <div className="skeleton" />}
      {items.map((item) => (
        <PickupRequestCard client={client} item={item} key={item.id} />
      ))}
    </section>
  )
}

type PickupRequestCardProps = Readonly<{ client: PortalClient; item: PickupRequest }>

function PickupRequestCard({ client, item }: PickupRequestCardProps): ReactNode {
  const cancel = useCancelPickupRequest(client)
  const badge = item.status === 'requested' ? 'pending' : 'done'
  const window =
    item.acceptedWindowStart !== null
      ? `${formatPickupDay(item.acceptedWindowStart)} a ${formatPickupDay(item.acceptedWindowEnd ?? item.acceptedWindowStart)}`
      : `${formatPickupDay(item.windowStart)} a ${formatPickupDay(item.windowEnd)}`
  return (
    <article className="panel">
      <div className="panel__row">
        <span className="panel__value">
          {item.kind === 'pickup' ? 'Coleta' : 'Entrega'} · {item.origin.city} →{' '}
          {item.destination.city}
        </span>
        <span className={`badge badge--${badge}`}>{pickupStatusLabel(item.status)}</span>
      </div>
      <div className="panel__row">
        <span className="panel__label">Janela: {window}</span>
        <span className="panel__label">
          {item.volumes} vol · {item.weightKg} kg
        </span>
      </div>
      <p className="panel__label">{item.cargoDescription}</p>
      {item.cargoValue !== null && <p className="panel__label">Valor: R$ {item.cargoValue}</p>}
      {item.accessNotes !== null && <p className="panel__label">Acesso: {item.accessNotes}</p>}
      {item.decisionNote !== null && <p className="panel__label">Motivo: {item.decisionNote}</p>}
      {canCancelPickup(item.status) && (
        <button
          className="secondary"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate(item.id)}
          type="button"
        >
          Cancelar pedido
        </button>
      )}
      {cancel.isError && (
        <p className="panel__label">Não foi possível cancelar. Atualize a lista.</p>
      )}
    </article>
  )
}
