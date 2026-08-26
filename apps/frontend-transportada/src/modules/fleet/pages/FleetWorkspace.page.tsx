/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Tabs, type TabsItem } from '@/components/ui/tabs'
import { SETTINGS_MANAGE_PERMISSION } from '@/modules/company-settings/shared/companySettings.constant'
import { resolveSettingsDataScope } from '@/modules/company-settings/shared/companySettingsTabs.service'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { AggregateApplicationsTab } from '../components/AggregateApplicationsTab.component'
import { AggregateDocumentsTab } from '../components/AggregateDocumentsTab.component'
import { DriverForm } from '../components/DriverForm.component'
import { DriverPanel } from '../components/DriverPanel.component'
import { EnergySettingsPanel } from '../components/EnergySettingsPanel.component'
import { FreightRegionPanel } from '../components/FreightRegionPanel.component'
import { FuelPricePanel } from '../components/FuelPricePanel.component'
import { VehicleForm } from '../components/VehicleForm.component'
import { VehiclePanel } from '../components/VehiclePanel.component'
import type { VehicleStatusChange } from '../components/VehicleSelectionBar.component'
import { useAggregateApplications } from '../hooks/useAggregateApplications.hook'
import { useAggregateDocuments } from '../hooks/useAggregateDocuments.hook'
import { useDriverRegions, type DriverRegionsController } from '../hooks/useDriverRegions.hook'
import { useDriverVehicles, type DriverVehiclesController } from '../hooks/useDriverVehicles.hook'
import { useEnergySettings } from '../hooks/useEnergySettings.hook'
import { useFleet } from '../hooks/useFleet.hook'
import { useFreightRegions } from '../hooks/useFreightRegions.hook'
import { useFuelPrices } from '../hooks/useFuelPrices.hook'
import { useVehicleCatalog, type VehicleCatalogController } from '../hooks/useVehicleCatalog.hook'
import { useVehicleColumns } from '../hooks/useVehicleColumns.hook'
import { useVehicleTable } from '../hooks/useVehicleTable.hook'
import type {
  FleetDriverDetail,
  FleetDriverFilters,
  FleetVehicleDetail,
  FleetVehicleStatus,
} from '../shared/fleet.types'
import {
  toDriverBody,
  toDriverFormState,
  toVehicleBody,
  toVehicleFormState,
} from '../shared/fleetForm.service'
import type { FleetViewStatus } from '../shared/fleetViewModel.service'
import styles from '../styles/fleet.module.css'

type FleetEditor =
  | null
  | Readonly<{ driver?: FleetDriverDetail; kind: 'driver' }>
  | Readonly<{ kind: 'vehicle'; vehicle?: FleetVehicleDetail }>

type FleetWorkspace = ReturnType<typeof useFleet>

type FleetTabId = 'applications' | 'documents' | 'drivers' | 'fuel' | 'regions' | 'vehicles'

const FLEET_TAB_IDS: readonly FleetTabId[] = [
  'vehicles',
  'drivers',
  'applications',
  'documents',
  'fuel',
  'regions',
]

function resolveFleetTab(id: string): FleetTabId {
  return FLEET_TAB_IDS.find((tab) => tab === id) ?? 'vehicles'
}

/** O cliente joga o código da API como mensagem do erro: é ele que a tela mostra ao operador. */
function toErrorCode(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

function flipStatus(status: 'active' | 'inactive'): 'active' | 'inactive' {
  return status === 'active' ? 'inactive' : 'active'
}

function FleetEditorPanel({
  driverRegions,
  driverVehicles,
  editor,
  onClose,
  onEditVehicle,
  vehicleCatalog,
  vehicles,
  workspace,
}: Readonly<{
  driverRegions: DriverRegionsController
  driverVehicles: DriverVehiclesController
  editor: FleetEditor
  onClose: () => void
  onEditVehicle: (vehicle: FleetVehicleDetail) => void
  vehicleCatalog: VehicleCatalogController
  vehicles: readonly FleetVehicleDetail[]
  workspace: FleetWorkspace
}>) {
  if (editor === null || !workspace.viewModel.canManageFleet) return null

  if (editor.kind === 'vehicle') {
    return (
      <VehicleForm
        key={editor.vehicle?.id ?? 'new-vehicle'}
        {...(editor.vehicle === undefined ? {} : { vehicle: editor.vehicle })}
        catalog={vehicleCatalog}
        drivers={workspace.viewModel.driverDirectory ?? []}
        onCancel={onClose}
        onCreate={(body) => workspace.createVehicleMutation.mutateAsync(body)}
        onEditVehicle={onEditVehicle}
        onCreateDriver={(body) => workspace.createDriverMutation.mutateAsync(body)}
        onUpdateDriver={(input) => workspace.updateDriverMutation.mutateAsync(input)}
        onUpdate={(input) => workspace.updateVehicleMutation.mutateAsync(input)}
        vehicles={vehicles}
      />
    )
  }

  return (
    <DriverForm
      key={editor.driver?.id ?? 'new-driver'}
      {...(editor.driver === undefined ? {} : { driver: editor.driver })}
      onCancel={onClose}
      onCreate={(body) => workspace.createDriverMutation.mutateAsync(body)}
      onUpdate={(input) => workspace.updateDriverMutation.mutateAsync(input)}
      regions={driverRegions}
      vehicles={driverVehicles}
    />
  )
}

export function FleetWorkspacePage() {
  const { t } = useTranslation('fleet')
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const [driverFilters, setDriverFilters] = useState<FleetDriverFilters>({})
  const [editor, setEditor] = useState<FleetEditor>(null)
  const [activeTab, setActiveTab] = useState<FleetTabId>('vehicles')
  const canManageSettings = permissions.includes(SETTINGS_MANAGE_PERMISSION)
  const settingsScope = resolveSettingsDataScope('fleet', activeTab)
  const fuelPrices = useFuelPrices({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: canManageSettings && settingsScope.fuelPrices,
  })
  const energySettings = useEnergySettings({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: canManageSettings && settingsScope.fuelPrices,
  })
  const freightRegions = useFreightRegions({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: settingsScope.freightRegions,
  })
  const workspace = useFleet({
    ...(companyId === undefined ? {} : { companyId }),
    driverFilters,
    permissions,
  })
  const vehicleCatalog = useVehicleCatalog({
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
  })
  const vehicleColumns = useVehicleColumns()
  const vehicles = workspace.viewModel.vehicles ?? []
  const vehicleTable = useVehicleTable(vehicles)
  const driverRegions = useDriverRegions({
    ...(companyId === undefined ? {} : { companyId }),
    ...(editor?.kind === 'driver' && editor.driver !== undefined
      ? { driverId: editor.driver.id }
      : {}),
    permissions,
  })
  const aggregateApplications = useAggregateApplications({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: workspace.viewModel.canManageFleet && activeTab === 'applications',
  })
  const aggregateDocuments = useAggregateDocuments({
    enabled: workspace.viewModel.canManageFleet && activeTab === 'documents',
  })
  const driverVehicles = useDriverVehicles({
    ...(companyId === undefined ? {} : { companyId }),
    ...(editor?.kind === 'driver' && editor.driver !== undefined
      ? { driverId: editor.driver.id }
      : {}),
    permissions,
  })
  const { canManageFleet } = workspace.viewModel
  const status: FleetViewStatus = authQuery.isPending
    ? 'loading'
    : authQuery.isError
      ? 'error'
      : workspace.viewModel.status

  function setVehicleStatus(vehicle: FleetVehicleDetail, status: FleetVehicleStatus): void {
    workspace.updateVehicleMutation.mutate({
      ...toVehicleBody(toVehicleFormState(vehicle)),
      expectedVersion: vehicle.version,
      status,
      vehicleId: vehicle.id,
    })
  }

  function changeVehicleStatus(input: VehicleStatusChange): void {
    for (const vehicle of input.vehicles) setVehicleStatus(vehicle, input.status)
    vehicleTable.clearSelection()
  }

  function toggleDriverStatus(driver: FleetDriverDetail): void {
    workspace.updateDriverMutation.mutate({
      ...toDriverBody(toDriverFormState(driver)),
      driverId: driver.id,
      expectedVersion: driver.version,
      // O vínculo não passa pelo formulário: quem o reenvia é a ficha carregada
      membershipId: driver.membershipId,
      status: flipStatus(driver.status),
    })
  }

  function selectTab(id: string): void {
    setActiveTab(resolveFleetTab(id))
    setEditor(null)
  }

  const fuelPriceErrorCode = toErrorCode(
    fuelPrices.adjustMutation.error ?? fuelPrices.clearMutation.error,
  )
  const energyErrorCode = toErrorCode(
    energySettings.chooseMutation.error ?? energySettings.clearMutation.error,
  )
  const fuelTab: TabsItem = {
    id: 'fuel',
    label: t('tabs.fuel'),
    panel: (
      <>
        <FuelPricePanel
          {...(fuelPriceErrorCode === undefined ? {} : { errorCode: fuelPriceErrorCode })}
          disabled={fuelPrices.adjustMutation.isPending || fuelPrices.clearMutation.isPending}
          loading={fuelPrices.query.isLoading}
          prices={fuelPrices.query.data}
          saved={fuelPrices.adjustMutation.isSuccess || fuelPrices.clearMutation.isSuccess}
          onAdjust={(input) => fuelPrices.adjustMutation.mutate(input)}
          onClear={(product) => fuelPrices.clearMutation.mutate(product)}
        />
        <EnergySettingsPanel
          {...(energyErrorCode === undefined ? {} : { errorCode: energyErrorCode })}
          disabled={
            energySettings.chooseMutation.isPending || energySettings.clearMutation.isPending
          }
          loading={energySettings.query.isLoading}
          saved={energySettings.chooseMutation.isSuccess || energySettings.clearMutation.isSuccess}
          settings={energySettings.query.data}
          onChoose={(input) => energySettings.chooseMutation.mutate(input)}
          onClear={() => energySettings.clearMutation.mutate()}
        />
      </>
    ),
  }

  /** Aba aberta para quem lê a frota: a cobertura é o que o formulário de motorista consulta. */
  const regionsTab: TabsItem = {
    id: 'regions',
    label: t('tabs.regions'),
    panel: (
      <FreightRegionPanel
        actions={{
          onCreate: (body) => freightRegions.createMutation.mutateAsync(body),
          onUpdate: (input) => freightRegions.updateMutation.mutateAsync(input),
        }}
        canManageSettings={canManageSettings}
        companyId={companyId}
        loading={freightRegions.query.isLoading}
        regions={freightRegions.query.data}
      />
    ),
  }

  const tabs: readonly TabsItem[] = [
    {
      id: 'vehicles',
      label: t('tabs.vehicles'),
      panel: (
        <VehiclePanel
          actions={{
            onChangeStatus: changeVehicleStatus,
            onEdit: (vehicle) => setEditor({ kind: 'vehicle', vehicle }),
            onNew: () => setEditor({ kind: 'vehicle' }),
            onToggleStatus: (vehicle) => setVehicleStatus(vehicle, flipStatus(vehicle.status)),
          }}
          canManageFleet={canManageFleet}
          columns={vehicleColumns}
          isUpdatingStatus={workspace.updateVehicleMutation.isPending}
          table={vehicleTable}
          view={{ status }}
        />
      ),
    },
    {
      id: 'drivers',
      label: t('tabs.drivers'),
      panel: (
        <DriverPanel
          actions={{
            onEdit: (driver) => setEditor({ driver, kind: 'driver' }),
            onNew: () => setEditor({ kind: 'driver' }),
            onToggleStatus: toggleDriverStatus,
          }}
          canManageFleet={canManageFleet}
          filters={{ onChange: setDriverFilters, value: driverFilters }}
          view={{
            status,
            ...(workspace.viewModel.drivers === undefined
              ? {}
              : { drivers: workspace.viewModel.drivers }),
          }}
        />
      ),
    },
    ...(canManageFleet
      ? [
          {
            id: 'applications',
            label: t('tabs.applications'),
            panel: (
              <AggregateApplicationsTab
                applications={aggregateApplications.query.data ?? []}
                isApproving={aggregateApplications.approveMutation.isPending}
                isRejecting={aggregateApplications.rejectMutation.isPending}
                loading={aggregateApplications.query.isLoading}
                onApprove={(id) => aggregateApplications.approveMutation.mutate(id)}
                onReject={(input) => aggregateApplications.rejectMutation.mutate(input)}
                onViewDriver={(name) => {
                  setDriverFilters({ nameContains: name })
                  selectTab('drivers')
                }}
              />
            ),
          } satisfies TabsItem,
          {
            id: 'documents',
            label: t('tabs.documents'),
            panel: (
              <AggregateDocumentsTab
                documents={aggregateDocuments.query.data ?? []}
                isReviewing={aggregateDocuments.reviewMutation.isPending}
                loading={aggregateDocuments.query.isLoading}
                onOpenFile={(id) => {
                  void aggregateDocuments
                    .getDownloadUrl(id)
                    .then((url) => window.open(url, '_blank', 'noopener,noreferrer'))
                }}
                onReview={(input) => aggregateDocuments.reviewMutation.mutate(input)}
              />
            ),
          } satisfies TabsItem,
        ]
      : []),
    ...(canManageSettings ? [fuelTab] : []),
    regionsTab,
  ]

  return (
    <main className={styles.fleetShell}>
      <header className={styles.header}>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1>{t('title')}</h1>
        <p className={styles.intro}>{t('intro')}</p>
      </header>
      <section className={styles.workspaceDeck} data-editor-open={editor !== null}>
        <Tabs ariaLabel={t('title')} items={tabs} onChange={selectTab} value={activeTab} />
        <FleetEditorPanel
          driverRegions={driverRegions}
          driverVehicles={driverVehicles}
          editor={editor}
          onEditVehicle={(vehicle) => setEditor({ kind: 'vehicle', vehicle })}
          vehicleCatalog={vehicleCatalog}
          vehicles={vehicles}
          workspace={workspace}
          onClose={() => setEditor(null)}
        />
      </section>
    </main>
  )
}
