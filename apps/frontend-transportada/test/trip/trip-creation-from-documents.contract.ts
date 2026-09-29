/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import type { WorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'
import {
  buildTripCreationRoute,
  navigateToTripCreation,
  parseTripCreationDocumentIds,
  TRIP_CREATION_DOCUMENTS_PARAMETER,
  TRIPS_ROUTE,
  TRIP_WORKSPACE,
} from '@/modules/trip/shared/tripRoute.service'

type RecordedNavigation = Readonly<{
  navigator: WorkspaceNavigator
  paths: string[]
  popStates: number[]
  workspaces: string[]
}>

function recordNavigation(): RecordedNavigation {
  const paths: string[] = []
  const popStates: number[] = []
  const workspaces: string[] = []
  return {
    navigator: {
      dispatchPopState: () => popStates.push(popStates.length + 1),
      pushPath: (path) => paths.push(path),
      rememberWorkspace: (workspace) => workspaces.push(workspace),
    },
    paths,
    popStates,
    workspaces,
  }
}

describe('criar viagem a partir da seleção de notas', () => {
  test('a seleção viaja na query string, com o caminho de viagens intacto', () => {
    const route = buildTripCreationRoute(['doc-1', 'doc-2'])

    expect(route.startsWith(`${TRIPS_ROUTE}?`)).toBe(true)
    expect(new URL(route, 'https://exemplo.test').pathname).toBe(TRIPS_ROUTE)
    expect(parseTripCreationDocumentIds(route.slice(route.indexOf('?')))).toEqual([
      'doc-1',
      'doc-2',
    ])
  })

  test('sem nota escolhida a rota é a lista de viagens, sem parâmetro pendurado', () => {
    expect(buildTripCreationRoute([])).toBe(TRIPS_ROUTE)
    expect(buildTripCreationRoute(['', ''])).toBe(TRIPS_ROUTE)
  })

  test('a leitura devolve lista vazia quando o parâmetro não veio, ou veio vazio', () => {
    expect(parseTripCreationDocumentIds('')).toEqual([])
    expect(parseTripCreationDocumentIds('?outro=1')).toEqual([])
    expect(parseTripCreationDocumentIds(`?${TRIP_CREATION_DOCUMENTS_PARAMETER}=`)).toEqual([])
    expect(parseTripCreationDocumentIds(`?${TRIP_CREATION_DOCUMENTS_PARAMETER}=a,,b`)).toEqual([
      'a',
      'b',
    ])
  })

  test('navegar lembra a área de viagens e avisa o shell — sem isso a tela não troca', () => {
    const recorded = recordNavigation()

    navigateToTripCreation({ documentIds: ['doc-1'], navigator: recorded.navigator })

    expect(recorded.paths).toEqual([buildTripCreationRoute(['doc-1'])])
    expect(recorded.workspaces).toEqual([TRIP_WORKSPACE])
    expect(recorded.popStates).toHaveLength(1)
  })
})
