/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { DeliveryMap } from '@/components/DeliveryMap.component'
import { useDeliveries, useDeliveryLocation } from './queries/portal.query'
import { isSchedulable, isTrackable, toDeliveryView } from './shared/deliveryStatus.service'
import { ScheduleForm } from './ScheduleForm.component'
import type { PortalClient } from '@/modules/shared/portalClient.service'
import { PortalRequestError } from '@/modules/shared/portalClient.service'
import type { Delivery } from '@/modules/shared/portal.types'

const NOT_BOUND_CODE = 'CONTRACTOR_NOT_BOUND'

type DeliveryListPageProps = Readonly<{ client: PortalClient }>

export function DeliveryListPage({ client }: DeliveryListPageProps) {
  const deliveries = useDeliveries(client)
  const [openKey, setOpenKey] = useState<string | null>(null)

  if (deliveries.isLoading) {
    return (
      <section className="page">
        <h1 className="page__title">Minhas entregas</h1>
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </section>
    )
  }

  /**
   * Conta sem vínculo é o único erro que a tela explica por extenso: a pessoa não tem o que fazer a
   * respeito sozinha, e "não foi possível carregar" a deixaria tentando de novo para sempre.
   */
  if (deliveries.error instanceof PortalRequestError && deliveries.error.code === NOT_BOUND_CODE) {
    return (
      <section className="page">
        <h1 className="page__title">Minhas entregas</h1>
        <p className="page__subtitle">
          Sua conta ainda não está ligada a um CNPJ. Peça à transportadora para vincular o documento
          da sua empresa ao seu acesso.
        </p>
      </section>
    )
  }

  if (deliveries.error !== null) {
    return (
      <section className="page">
        <h1 className="page__title">Minhas entregas</h1>
        <p className="page__subtitle">Não foi possível carregar suas entregas agora.</p>
        <button onClick={() => void deliveries.refetch()} type="button">
          Tentar de novo
        </button>
      </section>
    )
  }

  const items = deliveries.data ?? []

  return (
    <section className="page">
      <h1 className="page__title">Minhas entregas</h1>
      <p className="page__subtitle">
        {items.length === 0
          ? 'Nenhuma nota sua chegou à transportadora ainda.'
          : `${items.length} nota(s) sob acompanhamento.`}
      </p>
      {items.map((delivery) => (
        <DeliveryCard
          client={client}
          delivery={delivery}
          isOpen={openKey === delivery.accessKey}
          key={delivery.accessKey}
          onToggle={() =>
            setOpenKey((current) => (current === delivery.accessKey ? null : delivery.accessKey))
          }
        />
      ))}
    </section>
  )
}

type DeliveryCardProps = Readonly<{
  client: PortalClient
  delivery: Delivery
  isOpen: boolean
  onToggle: () => void
}>

function DeliveryCard({ client, delivery, isOpen, onToggle }: DeliveryCardProps) {
  const view = toDeliveryView(delivery)
  const trackable = isTrackable(delivery)
  const location = useDeliveryLocation(client, {
    accessKey: delivery.accessKey,
    enabled: isOpen && trackable,
  })

  return (
    <article className="panel">
      <div className="panel__row">
        <div>
          <p className="panel__label">Nota fiscal</p>
          <p className="panel__value">
            {delivery.number}/{delivery.series}
          </p>
        </div>
        <span className={`badge badge--${view.badge}`}>{view.label}</span>
      </div>
      <div className="panel__row">
        <span className="panel__label">Emitida em</span>
        <span className="panel__value">
          {new Date(delivery.issuedAt).toLocaleDateString('pt-BR')}
        </span>
      </div>
      {delivery.estimatedArrivalAt !== null && (
        <div className="panel__row">
          <span className="panel__label">Previsão de chegada</span>
          <span className="panel__value">
            {new Date(delivery.estimatedArrivalAt).toLocaleString('pt-BR')}
          </span>
        </div>
      )}
      {delivery.returnReason !== null && delivery.returnReason !== '' && (
        <div className="panel__row">
          <span className="panel__label">Motivo da devolução</span>
          <span className="panel__value">{delivery.returnReason}</span>
        </div>
      )}
      <button aria-expanded={isOpen} className="secondary" onClick={onToggle} type="button">
        {isOpen ? 'Fechar' : 'Abrir'}
      </button>
      {isOpen && (
        <>
          {trackable && location.data != null && <DeliveryMap location={location.data} />}
          {/* Sem posição não se explica por quê: o motorista pode não ter consentido, e dizer isso
              seria contar ao cliente algo que é do motorista. */}
          {trackable && location.data == null && !location.isLoading && (
            <p className="panel__label">Sem posição no momento.</p>
          )}
          {isSchedulable(delivery) && (
            <ScheduleForm accessKey={delivery.accessKey} client={client} />
          )}
        </>
      )}
    </article>
  )
}
