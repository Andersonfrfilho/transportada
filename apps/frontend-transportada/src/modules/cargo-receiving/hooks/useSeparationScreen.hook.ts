/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo } from 'react'

import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { useCargoArrivalQuery } from '../queries/useCargoArrivals.query'
import type { CargoArrivalDetail, CargoArrivalGroup } from '../shared/cargoArrival.types'
import type { DocumentReference } from '../shared/cargoReceivingRefusal.service'
import {
  navigateToCargoArrivalDetail,
  navigateToCargoArrivals,
} from '../shared/cargoReceivingRoute.service'
import { useOnlineStatus } from './useOnlineStatus.hook'
import { useSeparationGroups, type SeparationGroupsController } from './useSeparationGroups.hook'
import { useSeparationScanner, type SeparationScannerController } from './useSeparationScanner.hook'
import { useSeparationTouches, type SeparationTouchesController } from './useSeparationTouches.hook'

const NO_GROUPS: readonly CargoArrivalGroup[] = []

export type SeparationScreenController = Readonly<{
  arrival: CargoArrivalDetail | undefined
  documents: readonly DocumentReference[]
  errorCode: string | undefined
  groups: SeparationGroupsController
  isLoading: boolean
  isOnline: boolean
  openList: () => void
  openOffice: () => void
  scanner: SeparationScannerController
  touches: SeparationTouchesController
}>

/** A tela do celular do separador: a chegada, os grupos, o toque e o leitor, cada um no seu hook. */
export function useSeparationScreen(arrivalId: string): SeparationScreenController {
  const detail = useCargoArrivalQuery(arrivalId)
  const navigator = useMemo(createBrowserWorkspaceNavigator, [])
  const arrival = detail.data
  const allGroups = arrival?.groups ?? NO_GROUPS
  const groups = useSeparationGroups(allGroups)
  const scanner = useSeparationScanner({ groups: allGroups, onFound: groups.setQuery })
  const touches = useSeparationTouches(arrivalId)
  const isOnline = useOnlineStatus()
  const documents = useMemo(
    () =>
      allGroups.flatMap((group) =>
        group.documents.map((document) => ({
          id: document.nfeDocumentId,
          number: document.number,
        })),
      ),
    [allGroups],
  )

  return {
    arrival,
    documents,
    errorCode: detail.error instanceof Error ? detail.error.message : undefined,
    groups,
    isLoading: detail.isLoading,
    isOnline,
    openList: () => navigateToCargoArrivals(navigator),
    openOffice: () => navigateToCargoArrivalDetail({ arrivalId, navigator }),
    scanner,
    touches,
  }
}
