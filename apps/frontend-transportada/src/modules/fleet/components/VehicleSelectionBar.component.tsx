/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { COPY_FEEDBACK_MILLISECONDS } from '@/modules/shared/clipboard.constant'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { saveArchiveFile } from '@/modules/shared/archiveDownload.service'

import type { VehicleTableController } from '../hooks/useVehicleTable.hook'
import type { FleetVehicleDetail, FleetVehicleStatus } from '../shared/fleet.types'
import {
  buildVehiclePlateList,
  buildVehicleSelectionCsv,
  VEHICLE_EXPORT_COLUMNS,
  VEHICLE_EXPORT_FILE_NAME,
  VEHICLE_EXPORT_MEDIA_TYPE,
  type VehicleExportColumn,
} from '../shared/vehicleSelectionExport.service'
import styles from '../styles/fleet.module.css'

/** Coluna cujo valor é slug fechado: o arquivo leva o rótulo que o operador lê na tela. */
const EXPORT_VALUE_KEY_PREFIX: Readonly<Partial<Record<VehicleExportColumn, string>>> = {
  color: 'colorOption',
  fuelType: 'fuelOption',
  ownership: 'ownershipOption',
  role: 'roleOption',
  secondaryFuelType: 'fuelOption',
  status: 'status',
}

/** A coluna do arranjo devolve a chave inteira: ela alterna entre dois grupos por linha. */
const EXPORT_TRANSLATED_KEY_COLUMNS: readonly VehicleExportColumn[] = ['fuelArrangement']

export type VehicleStatusChange = Readonly<{
  status: FleetVehicleStatus
  vehicles: readonly FleetVehicleDetail[]
}>

type VehicleSelectionBarProps = Readonly<{
  canManageFleet: boolean
  isUpdatingStatus: boolean
  onChangeStatus: (input: VehicleStatusChange) => void
  table: VehicleTableController
}>

export function VehicleSelectionBar({
  canManageFleet,
  isUpdatingStatus,
  onChangeStatus,
  table,
}: VehicleSelectionBarProps) {
  const { t } = useTranslation('fleet')
  const [hasCopiedPlates, setHasCopiedPlates] = useState(false)

  const selected = table.selectedVehicles
  if (selected.length === 0) return null

  const inactive = selected.filter((vehicle) => vehicle.status === 'inactive')
  const active = selected.filter((vehicle) => vehicle.status === 'active')

  function exportSelection(): void {
    const csv = buildVehicleSelectionCsv({
      labels: {
        header: Object.fromEntries(
          VEHICLE_EXPORT_COLUMNS.map((column) => [column, t(`vehicleExport.${column}`)]),
        ) as Record<VehicleExportColumn, string>,
        translateValue: ({ column, value }) => {
          if (value === '') return value
          if (EXPORT_TRANSLATED_KEY_COLUMNS.includes(column)) return t(value)
          const prefix = EXPORT_VALUE_KEY_PREFIX[column]
          if (prefix === undefined) return value
          return t(`${prefix}.${value}`)
        },
      },
      vehicles: selected,
    })

    saveArchiveFile({
      blob: new Blob([csv], { type: VEHICLE_EXPORT_MEDIA_TYPE }),
      fileName: VEHICLE_EXPORT_FILE_NAME,
    })
  }

  async function copyPlates(): Promise<void> {
    try {
      await navigator.clipboard.writeText(buildVehiclePlateList(selected))
      setHasCopiedPlates(true)
      window.setTimeout(() => setHasCopiedPlates(false), COPY_FEEDBACK_MILLISECONDS)
    } catch {
      setHasCopiedPlates(false)
    }
  }

  return (
    <div className={styles.bulkBar}>
      <p className={styles.counter}>{t('vehicleSelection.count', { count: selected.length })}</p>
      <div className={styles.bulkActions}>
        {canManageFleet ? (
          <>
            <Button
              disabled={inactive.length === 0 || isUpdatingStatus}
              onClick={() => onChangeStatus({ status: 'active', vehicles: inactive })}
              size="sm"
              type="button"
            >
              <Icon name="power" />
              {t('vehicleSelection.activate', { count: inactive.length })}
            </Button>
            <Button
              disabled={active.length === 0 || isUpdatingStatus}
              onClick={() => onChangeStatus({ status: 'inactive', vehicles: active })}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Icon name="power" />
              {t('vehicleSelection.deactivate', { count: active.length })}
            </Button>
          </>
        ) : null}
        <Button onClick={exportSelection} size="sm" type="button" variant="secondary">
          <Icon name="export" />
          {t('vehicleSelection.export', { count: selected.length })}
        </Button>
        <Button
          onClick={() => {
            void copyPlates()
          }}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name={hasCopiedPlates ? 'check' : 'copy'} />
          {hasCopiedPlates
            ? t('vehicleSelection.copied')
            : t('vehicleSelection.copyPlates', { count: selected.length })}
        </Button>
        <Button onClick={table.clearSelection} size="sm" type="button" variant="ghost">
          <Icon name="close" />
          {t('vehicleSelection.clear')}
        </Button>
      </div>
    </div>
  )
}
