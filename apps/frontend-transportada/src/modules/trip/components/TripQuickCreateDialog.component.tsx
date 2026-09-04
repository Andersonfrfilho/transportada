/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { BarcodeScanner } from '@/components/ui/barcode-scanner'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { MultiSelect } from '@/components/ui/multi-select'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useVehicleSelectOptions } from '@/modules/fleet/hooks/useVehicleSelectOptions.hook'
import { resolveVehicleColorSwatch } from '@/modules/fleet/shared/vehicleOption.service'
import { VEHICLE_TYPE_ICONS } from '@/modules/shared/vehicleTypeIcon.service'
import type { FleetDriverDetail, FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'
import type { NfeDocumentListItem } from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'
import { useTripValuationPreview } from '@/modules/trip-financials/hooks/useTripValuationPreview.hook'

import { TripAssemblyMap } from './TripAssemblyMap.component'
import { TripDocumentSearch } from './TripDocumentSearch.component'
import { TripValuationPreview } from './TripValuationPreview.component'
import type { TripQuickCreateController } from '../hooks/useTripQuickCreate.hook'
import {
  buildDriverSelectOption,
  describeBoundVehicle,
} from '../shared/driverBoundVehicles.service'
import type { ScannedNfeDocument } from '../shared/trip.types'
import type { TripQuickCreateEntry } from '../shared/tripQuickCreate.service'
import { isQuickCreateEntryPending, stagedDocumentIds } from '../shared/tripQuickCreate.service'
import styles from '../styles/trip.module.css'

type TripQuickCreateDialogProps = Readonly<{
  permissions: readonly string[]
  /** Só as notas livres: nota já em viagem não é oferecida no lote, e não vira recusa em massa. */
  availableDocuments: readonly NfeDocumentListItem[]
  drivers: readonly FleetDriverDetail[]
  quickCreate: TripQuickCreateController
  vehicles: readonly FleetVehicleDetail[]
}>

function QuickCreateEntryRow({
  entry,
  onRemove,
}: Readonly<{ entry: TripQuickCreateEntry; onRemove: () => void }>) {
  const { t } = useTranslation('trip')

  return (
    <li className={styles.scanQueueRow}>
      <span className={styles.scanQueueKey}>
        {entry.document === undefined
          ? entry.accessKey
          : `${entry.document.number}/${entry.document.series} · ${entry.document.recipientName}`}
      </span>
      {/* Dois supermercados da mesma rede têm o mesmo nome: o que os separa é a cidade. */}
      {entry.document?.recipientCity === undefined ||
      entry.document.recipientCity === null ? null : (
        <span className={styles.scanQueuePlace}>
          {entry.document.recipientCity}
          {entry.document.recipientState === null ? '' : `/${entry.document.recipientState}`}
        </span>
      )}
      {isQuickCreateEntryPending(entry) ? (
        <SkeletonGroup label={t('quickCreate.resolving')}>
          <Skeleton variant="text" width="7rem" />
        </SkeletonGroup>
      ) : entry.refusal === undefined ? (
        <span>{t('quickCreate.staged')}</span>
      ) : (
        <span className={styles.alert} role="alert">
          {t(`quickCreate.refusal.${entry.refusal}`)}
        </span>
      )}
      <Button
        aria-label={t('quickCreate.remove')}
        onClick={onRemove}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Icon name="close" />
      </Button>
    </li>
  )
}

export function TripQuickCreateDialog({
  availableDocuments,
  drivers,
  permissions,
  quickCreate,
  vehicles,
}: TripQuickCreateDialogProps) {
  const { t } = useTranslation('trip')
  /** A cor sai do vocabulário da frota: copiar as chaves daria duas grafias no mesmo produto. */
  const { t: tFleet } = useTranslation('fleet')
  const [typedKey, setTypedKey] = useState('')
  /**
   * O que o filtro alcança hoje. Ele não entra na viagem — serve para o mapa dizer, em cinza claro,
   * qual cidade vizinha ficou de fora da seleção.
   */
  const [filteredDocuments, setFilteredDocuments] = useState<readonly ScannedNfeDocument[]>([])
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: quickCreate.isOpen,
    onClose: quickCreate.close,
  })
  const activeDrivers = drivers.filter((driver) => driver.status === 'active')
  const tractionVehicles = vehicles.filter(
    (vehicle) => vehicle.status === 'active' && vehicle.role === 'traction',
  )
  const vehicleOptions = useVehicleSelectOptions(tractionVehicles)
  const vehicleById = new Map(
    vehicles.map((vehicle) => [
      vehicle.id,
      {
        /** Implemento tem `vehicleType` vazio — o tipo é de quem traciona, então ali não há ícone. */
        ...(vehicle.vehicleType === '' ? {} : { icon: VEHICLE_TYPE_ICONS[vehicle.vehicleType] }),
        description: describeBoundVehicle({
          brand: vehicle.brand,
          colorLabel:
            resolveVehicleColorSwatch(vehicle.color) === undefined
              ? ''
              : tFleet(`colorOption.${vehicle.color}`),
          model: vehicle.model,
          modelYear: vehicle.modelYear,
        }),
        plate: vehicle.plate,
      },
    ]),
  )
  /** A conta acompanha a escolha: muda a nota, o motorista ou o veículo, e o número acompanha. */
  const selectedNotes = useMemo(
    () => quickCreate.stagedDocuments.map(toAssemblyNote),
    [quickCreate.stagedDocuments],
  )
  /** A nota já em fila não é "o que faltou": o mapa a desenha como parada, não como ausência. */
  const nearbyNotes = useMemo(() => {
    const staged = new Set(quickCreate.stagedDocuments.map((document) => document.id))
    return filteredDocuments.filter((document) => !staged.has(document.id)).map(toAssemblyNote)
  }, [filteredDocuments, quickCreate.stagedDocuments])

  const valuationPreview = useTripValuationPreview({
    driverIds: quickCreate.driverIds,
    nfeDocumentIds: stagedDocumentIds(quickCreate.queue),
    permissions,
    vehicleId: quickCreate.vehicleId,
  })
  const bindingByDriverId = new Map(
    quickCreate.bindings.map((binding) => [binding.driverId, binding]),
  )

  if (!quickCreate.isOpen) return null

  /** A chave digitada passa pelo mesmo caminho do bipe: quem decide o que ela vira é o serviço. */
  function submitTypedKey(): void {
    if (typedKey.trim() === '') return
    quickCreate.acceptScan(typedKey)
    setTypedKey('')
  }

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="trip-quick-create-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="trip-quick-create-title">{t('quickCreate.title')}</h2>
            <p className={styles.hint}>{t('quickCreate.intro')}</p>
          </div>
          <Button
            aria-label={t('quickCreate.close')}
            onClick={quickCreate.close}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </header>

        <div className={styles.scanRow}>
          <label className={styles.scanField}>
            {t('quickCreate.accessKey')}
            <input
              onChange={(event) => setTypedKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                submitTypedKey()
              }}
              placeholder={t('quickCreate.accessKeyPlaceholder')}
              type="text"
              value={typedKey}
            />
          </label>
          <Button onClick={submitTypedKey} size="sm" type="button" variant="secondary">
            <Icon name="add" />
            {t('quickCreate.add')}
          </Button>
          {quickCreate.canScan ? (
            <Button onClick={quickCreate.openScanner} size="sm" type="button">
              <Icon name="camera" />
              {t('quickCreate.scan')}
            </Button>
          ) : null}
        </div>

        <TripDocumentSearch
          documents={availableDocuments}
          onFilteredChange={setFilteredDocuments}
          onStage={quickCreate.stageDocuments}
        />

        {quickCreate.queue.length === 0 ? (
          <p className={styles.hint}>{t('quickCreate.empty')}</p>
        ) : (
          <ul className={styles.scanQueueList}>
            {quickCreate.queue.map((entry) => (
              <QuickCreateEntryRow
                entry={entry}
                key={entry.accessKey}
                onRemove={() => quickCreate.removeEntry(entry.accessKey)}
              />
            ))}
          </ul>
        )}

        <p className={styles.hint}>
          {t('quickCreate.stagedCount', { count: quickCreate.stagedCount })}
        </p>

        <div className={styles.fieldGrid}>
          <label>
            {t('creation.drivers')}
            {activeDrivers.length === 0 ? (
              <p className={styles.hint}>{t('creation.driversEmpty')}</p>
            ) : (
              <MultiSelect
                ariaLabel={t('creation.drivers')}
                clearAllLabel={t('creation.driversClearAll')}
                emptyLabel={t('creation.driversNoMatch')}
                onChange={quickCreate.setDriverIds}
                options={activeDrivers.map((driver) =>
                  buildDriverSelectOption({
                    binding: bindingByDriverId.get(driver.id),
                    driver,
                    /**
                     * Só para quem **está** na viagem. Na lista ainda por escolher, o que ajuda a
                     * decidir é o veículo do cadastro de cada um — carimbar o da viagem em todos
                     * daria placa a motorista que não tem nenhuma.
                     */
                    ...(quickCreate.driverIds.includes(driver.id)
                      ? { tripVehicleId: quickCreate.vehicleId }
                      : {}),
                    vehicleById,
                  }),
                )}
                placeholder={t('creation.driversPlaceholder')}
                removeLabel={t('creation.driversRemove')}
                searchPlaceholder={t('creation.driversSearch')}
                summaryLabel={(count) => t('creation.driversSummary', { count })}
                values={quickCreate.driverIds}
              />
            )}
          </label>

          <label>
            {t('creation.vehicle')}
            <Select
              ariaLabel={t('creation.vehicle')}
              clearable
              onChange={quickCreate.setVehicleId}
              options={vehicleOptions}
              placeholder={t('creation.vehiclePlaceholder')}
              searchPlaceholder={t('creation.vehicleSearch')}
              value={quickCreate.vehicleId}
            />
          </label>
        </div>

        <TripAssemblyMap
          nearby={nearbyNotes}
          onOrderChange={quickCreate.setCityOrder}
          order={quickCreate.cityOrder}
          selected={selectedNotes}
          vehicleId={quickCreate.vehicleId}
        />

        <TripValuationPreview preview={valuationPreview} />

        {quickCreate.issues.map((issue) => (
          <p className={styles.alert} key={issue}>
            {t(`quickCreate.issue.${issue}`)}
          </p>
        ))}

        {quickCreate.createMutation.isError ? (
          <p className={styles.alert} role="alert">
            {t('quickCreate.failed')}
          </p>
        ) : null}

        <div className={styles.dialogFooter}>
          <Button onClick={quickCreate.close} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('quickCreate.cancel')}
          </Button>
          <Button
            disabled={quickCreate.issues.length > 0 || quickCreate.createMutation.isPending}
            onClick={() => quickCreate.createMutation.mutate()}
            size="sm"
            type="button"
          >
            <Icon name="check" />
            {t('quickCreate.submit')}
          </Button>
        </div>

        <BarcodeScanner
          closeLabel={t('detail.scanClose')}
          deniedMessage={t('detail.scanDenied')}
          isOpen={quickCreate.isScannerOpen}
          onClose={quickCreate.closeScanner}
          onRead={quickCreate.acceptScan}
          readingMessage={t('detail.scanReading')}
          startingMessage={t('detail.scanStarting')}
          title={t('detail.scanTitle')}
          unavailableMessage={t('detail.scanUnavailable')}
        />
      </div>
    </div>,
    document.body,
  )
}

/** O recorte que o mapa da montagem lê da nota: onde ela para, e o que identifica a parada. */
function toAssemblyNote(document: ScannedNfeDocument) {
  return {
    address: document.recipientAddress,
    /**
     * ⚠️ `addressNumber` é o número do **endereço**, e `number` é o número da **nota**. Trocar os
     * dois faria a chave da parada nascer do número fiscal, e cada nota viraria uma parada própria.
     */
    addressNumber: document.recipientAddressNumber,
    city: document.recipientCity,
    cityCode: document.recipientCityCode,
    id: document.id,
    latitude: document.recipientLatitude,
    locationPrecision: document.recipientLocationPrecision,
    longitude: document.recipientLongitude,
    number: document.number,
    postalCode: document.recipientPostalCode,
    recipient: document.recipientName,
    state: document.recipientState,
  }
}
