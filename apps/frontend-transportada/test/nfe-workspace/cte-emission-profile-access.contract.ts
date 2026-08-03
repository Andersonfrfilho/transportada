/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  summarizePreview,
  type CteEmissionPreview,
} from '../../src/modules/nfe-workspace/shared/cteEmission.service'
import {
  CTE_PROFILES_ROUTE,
  CTE_PROFILES_WORKSPACE,
  canReachCteProfiles,
  navigateToCteProfiles,
  type WorkspaceNavigator,
} from '../../src/modules/nfe-workspace/shared/cteProfilesNavigation.service'

const DOCUMENT_ID = '00000000-0000-4000-8000-000000000512'
const SENDER_PROFILE_ID = '00000000-0000-4000-8000-000000000515'
const MANUAL_PROFILE_ID = '00000000-0000-4000-8000-000000000516'

const PREVIEW: CteEmissionPreview = {
  blocked: [],
  projections: [
    {
      baseAmount: '958.4800',
      documents: [
        {
          accessKey: '35260761156864000191550010000000022000000022',
          documentId: DOCUMENT_ID,
          number: '000000022',
          series: '001',
          totalAmount: '958.4800',
        },
      ],
      fiscalAmount: '43.13',
      fiscalComponents: [{ amount: '43.13', calculationType: 'main', label: 'Frete' }],
      percentage: '0.045000',
      profile: {
        groupingMode: 'per_invoice',
        id: SENDER_PROFILE_ID,
        matchedBy: 'sender_tax_id',
        name: 'Perfil Zaragoza',
        resolvedBy: 'auto',
      },
      recipientTaxId: '12345678000199',
      senderTaxId: '61156864000191',
    },
    {
      baseAmount: '100.0000',
      documents: [
        {
          accessKey: '35260761156864000191550010000000023000000023',
          documentId: '00000000-0000-4000-8000-000000000513',
          number: '000000023',
          series: '001',
          totalAmount: '100.0000',
        },
      ],
      fiscalAmount: '4.50',
      fiscalComponents: [],
      percentage: '0.045000',
      profile: {
        groupingMode: 'per_invoice',
        id: MANUAL_PROFILE_ID,
        matchedBy: 'manual',
        name: 'Perfil escolhido na mão',
        resolvedBy: 'manual',
      },
      recipientTaxId: '12345678000199',
      senderTaxId: '61156864000191',
    },
  ],
  suggestedName: 'CT-e 2026-07-30 #1',
  summary: { blockedCount: 0, documentCount: 2, projectedCount: 2, totalAmount: '47.63' },
}

function createNavigatorSpy(): Readonly<{
  calls: readonly string[]
  navigator: WorkspaceNavigator
}> {
  const calls: string[] = []
  return {
    calls,
    navigator: {
      dispatchPopState: () => calls.push('dispatchPopState'),
      pushPath: (path) => calls.push(`pushPath:${path}`),
      rememberWorkspace: (workspace) => calls.push(`rememberWorkspace:${workspace}`),
    },
  }
}

describe('CT-e emission profile access contract', () => {
  test('carries which profile answered each projection and how it was matched', () => {
    const [automatic, manual] = summarizePreview(PREVIEW).rows

    expect({
      matchedBy: automatic?.matchedBy,
      profileId: automatic?.profileId,
      profileName: automatic?.profileName,
      resolvedBy: automatic?.resolvedBy,
    }).toEqual({
      matchedBy: 'sender_tax_id',
      profileId: SENDER_PROFILE_ID,
      profileName: 'Perfil Zaragoza',
      resolvedBy: 'auto',
    })
    expect({
      matchedBy: manual?.matchedBy,
      profileId: manual?.profileId,
      profileName: manual?.profileName,
      resolvedBy: manual?.resolvedBy,
    }).toEqual({
      matchedBy: 'manual',
      profileId: MANUAL_PROFILE_ID,
      profileName: 'Perfil escolhido na mão',
      resolvedBy: 'manual',
    })
  })

  test('only settings.manage reaches the emission profiles screen', () => {
    expect(canReachCteProfiles(['settings.manage'])).toBe(true)
    expect(canReachCteProfiles(['cte.manage', 'invoices.read'])).toBe(false)
    expect(canReachCteProfiles([])).toBe(false)
  })

  test('navigating pushes the path, remembers the workspace and resyncs the shell', () => {
    const spy = createNavigatorSpy()

    navigateToCteProfiles(spy.navigator)

    expect(spy.calls).toEqual([
      `pushPath:${CTE_PROFILES_ROUTE}`,
      `rememberWorkspace:${CTE_PROFILES_WORKSPACE}`,
      'dispatchPopState',
    ])
  })
})
