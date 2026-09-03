/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import type { MultiSelectOption } from '@/components/ui/multi-select'
import { useDriverVehicles } from '@/modules/fleet/hooks/useDriverVehicles.hook'
import { useDriverVehiclePairs } from '@/modules/fleet/hooks/useDriverVehiclePairs.hook'

import { useMultiVehicleSuggestion } from '../hooks/useMultiVehicleSuggestion.hook'
import { driverOptions as toDriverOptions } from '../shared/multiVehiclePairing.service'
import { MultiVehicleSuggestionDialog } from './MultiVehicleSuggestionDialog.component'

type MultiVehicleSuggestionActionProps = Readonly<{
  className?: string | undefined
  companyId?: string | undefined
  documentIds: readonly string[]
  onAccepted: () => void
  onOpenTrip: (tripId: string) => void
  permissions: readonly string[]
}>

/**
 * Spec 058 P2: a ação mora no módulo do roteirizador e carrega a própria tradução — a tabela de
 * notas só empresta o estilo do botão da barra de seleção, como já faz com a NFS-e.
 *
 * Ela nasce da **seleção**, e não de uma tela própria, porque é ali que o operador já escolhe as
 * notas: uma segunda lista de notas para montar o pool seria a mesma tabela, de novo, sem os
 * filtros que ele acabou de usar.
 */
export function MultiVehicleSuggestionAction({
  className,
  companyId,
  documentIds,
  onAccepted,
  onOpenTrip,
  permissions,
}: MultiVehicleSuggestionActionProps) {
  const { t } = useTranslation('routing')
  /**
   * Spec 081: o vínculo do cadastro é o que preenche os dois lados do par. Ele só é buscado com a
   * permissão de escrita de viagem — sem o botão não há diálogo, e sem diálogo não há pareamento.
   */
  const pairing = useDriverVehiclePairs({
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
  })
  const dialog = useMultiVehicleSuggestion({
    documentIds,
    links: pairing.links,
    onAccepted,
    permissions,
  })

  /**
   * A lista de veículos é a mesma do vínculo do motorista: veículos **ativos**, uma consulta com
   * chave própria. Reusá-la evita uma terceira consulta de frota e mantém uma resposta só em cache.
   */
  const fleet = useDriverVehicles({
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
  })

  const vehicleOptions = useMemo<readonly MultiSelectOption[]>(
    () =>
      fleet.options
        /** Só quem traciona: implemento sozinho não puxa carga, e a API recusaria com 409. */
        .filter((vehicle) => vehicle.role === 'traction')
        .map((vehicle) => ({ label: toVehicleLabel(vehicle), value: vehicle.id })),
    [fleet.options],
  )

  const vehicleLabels = useMemo<Record<string, string>>(
    () => Object.fromEntries(fleet.options.map((vehicle) => [vehicle.id, toVehicleLabel(vehicle)])),
    [fleet.options],
  )

  /** Só o de vínculo único: com dois veículos não dá para saber qual ele leva hoje. */
  const driverOptions = useMemo<readonly MultiSelectOption[]>(
    () => toDriverOptions({ drivers: pairing.drivers, links: pairing.links }),
    [pairing.drivers, pairing.links],
  )

  /** A linha do veículo oferece **todos** — é por ela que quem tem dois caminhões é escalado. */
  const driverRowOptions = useMemo<readonly MultiSelectOption[]>(
    () => pairing.drivers.map((driver) => ({ label: driver.name, value: driver.id })),
    [pairing.drivers],
  )

  const driverLabels = useMemo<Record<string, string>>(
    () => Object.fromEntries(pairing.drivers.map((driver) => [driver.id, driver.name])),
    [pairing.drivers],
  )

  if (!dialog.canOpen) return null

  return (
    <>
      <button
        className={className}
        disabled={documentIds.length === 0}
        onClick={dialog.open}
        type="button"
      >
        <Icon name="send" />
        {t('multiVehicle.action')}
      </button>
      <MultiVehicleSuggestionDialog
        dialog={dialog}
        documentCount={documentIds.length}
        driverLabels={driverLabels}
        driverOptions={driverOptions}
        driverRowOptions={driverRowOptions}
        onOpenTrip={onOpenTrip}
        vehicleLabels={vehicleLabels}
        vehicleOptions={vehicleOptions}
      />
    </>
  )
}

/** A placa é o que o operador reconhece; o modelo desempata duas placas parecidas. */
function toVehicleLabel(
  vehicle: Readonly<{ brand?: string; model?: string; plate: string }>,
): string {
  const description = [vehicle.brand, vehicle.model].filter((part) => (part ?? '') !== '').join(' ')

  return description === '' ? vehicle.plate : `${vehicle.plate} · ${description}`
}
