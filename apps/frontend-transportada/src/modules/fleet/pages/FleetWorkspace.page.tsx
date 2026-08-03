/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Tabs, type TabsItem } from '@/components/ui/tabs'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { DriverForm } from '../components/DriverForm.component'
import { DriverPanel } from '../components/DriverPanel.component'
import { VehicleForm } from '../components/VehicleForm.component'
import { VehiclePanel } from '../components/VehiclePanel.component'
import { useDriverVehicles, type DriverVehiclesController } from '../hooks/useDriverVehicles.hook'
import { useFleet } from '../hooks/useFleet.hook'
import { useVehicleLookup, type VehicleLookupController } from '../hooks/useVehicleLookup.hook'
import type {
  FleetDriverDetail,
  FleetDriverFilters,
  FleetVehicleDetail,
  FleetVehicleFilters,
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

function flipStatus(status: 'active' | 'inactive'): 'active' | 'inactive' {
  return status === 'active' ? 'inactive' : 'active'
}

function FleetEditorPanel({
  driverVehicles,
  editor,
  onClose,
  vehicleLookup,
  workspace,
}: Readonly<{
  driverVehicles: DriverVehiclesController
  editor: FleetEditor
  onClose: () => void
  vehicleLookup: VehicleLookupController
  workspace: FleetWorkspace
}>) {
  if (editor === null || !workspace.viewModel.canManageFleet) return null

  if (editor.kind === 'vehicle') {
    return (
      <VehicleForm
        key={editor.vehicle?.id ?? 'new-vehicle'}
        {...(editor.vehicle === undefined ? {} : { vehicle: editor.vehicle })}
        lookup={vehicleLookup}
        onCancel={onClose}
        onCreate={(body) => workspace.createVehicleMutation.mutateAsync(body)}
        onUpdate={(input) => workspace.updateVehicleMutation.mutateAsync(input)}
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
      vehicles={driverVehicles}
    />
  )
}

export function FleetWorkspacePage() {
  const { t } = useTranslation('fleet')
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const [vehicleFilters, setVehicleFilters] = useState<FleetVehicleFilters>({})
  const [driverFilters, setDriverFilters] = useState<FleetDriverFilters>({})
  const [editor, setEditor] = useState<FleetEditor>(null)
  const [activeTab, setActiveTab] = useState<'drivers' | 'vehicles'>('vehicles')
  const workspace = useFleet({
    ...(companyId === undefined ? {} : { companyId }),
    driverFilters,
    permissions,
    vehicleFilters,
  })
  const vehicleLookup = useVehicleLookup({
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
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

  function toggleVehicleStatus(vehicle: FleetVehicleDetail): void {
    workspace.updateVehicleMutation.mutate({
      ...toVehicleBody(toVehicleFormState(vehicle)),
      expectedVersion: vehicle.version,
      status: flipStatus(vehicle.status),
      vehicleId: vehicle.id,
    })
  }

  function toggleDriverStatus(driver: FleetDriverDetail): void {
    workspace.updateDriverMutation.mutate({
      ...toDriverBody(toDriverFormState(driver)),
      driverId: driver.id,
      expectedVersion: driver.version,
      status: flipStatus(driver.status),
    })
  }

  function selectTab(id: string): void {
    setActiveTab(id === 'drivers' ? 'drivers' : 'vehicles')
    setEditor(null)
  }

  const tabs: readonly TabsItem[] = [
    {
      id: 'vehicles',
      label: t('tabs.vehicles'),
      panel: (
        <VehiclePanel
          actions={{
            onEdit: (vehicle) => setEditor({ kind: 'vehicle', vehicle }),
            onNew: () => setEditor({ kind: 'vehicle' }),
            onToggleStatus: toggleVehicleStatus,
          }}
          canManageFleet={canManageFleet}
          filters={{ onChange: setVehicleFilters, value: vehicleFilters }}
          view={{
            status,
            ...(workspace.viewModel.vehicles === undefined
              ? {}
              : { vehicles: workspace.viewModel.vehicles }),
          }}
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
  ]

  return (
    <main className={styles.fleetShell}>
      <header className={styles.header}>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1>{t('title')}</h1>
        <p className={styles.intro}>{t('intro')}</p>
      </header>
      <section className={styles.workspaceDeck}>
        <Tabs ariaLabel={t('title')} items={tabs} onChange={selectTab} value={activeTab} />
        <FleetEditorPanel
          driverVehicles={driverVehicles}
          editor={editor}
          vehicleLookup={vehicleLookup}
          workspace={workspace}
          onClose={() => setEditor(null)}
        />
      </section>
    </main>
  )
}
