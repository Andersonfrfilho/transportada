/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { readFileSync } from 'node:fs'

import { listActiveDrivingDrivers } from '@/modules/fleet/shared/driverCrewRole.service'
import { TRIP_FEEDBACK_KEY_BY_ERROR } from '@/modules/trip/shared/trip.constant'
import { resolveCrewDialogErrorKey } from '@/modules/trip/shared/tripCrewDialog.service'
import {
  listDriverCandidates,
  listHelperCandidates,
} from '@/modules/trip/shared/tripCrewHelpers.service'
import enLocale from '@/modules/trip/locales/trip.en.locale.json'
import ptLocale from '@/modules/trip/locales/trip.locale.json'

/**
 * Spec 234 T11 (D5): quem não dirige (`canDrive` falso) nunca é oferecido como motorista; quem pode
 * ajudar é oferecido como ajudante. A API é quem recusa de verdade (`TRIP_DRIVER_CANNOT_DRIVE`) — a
 * tela só deixa de oferecer o que ela recusaria.
 */
type Candidate = Readonly<{
  canActAsHelper: boolean
  canDrive: boolean
  id: string
  status: string
}>

function person(
  id: string,
  options: Readonly<{ canActAsHelper: boolean; canDrive: boolean; status?: string }>,
): Candidate {
  return { ...options, id, status: options.status ?? 'active' }
}

const ONLY_DRIVES = person('only-drives', { canActAsHelper: false, canDrive: true })
const DRIVES_AND_HELPS = person('drives-and-helps', { canActAsHelper: true, canDrive: true })
const ONLY_HELPS = person('only-helps', { canActAsHelper: true, canDrive: false })
const INACTIVE_DRIVER = person('inactive', {
  canActAsHelper: false,
  canDrive: true,
  status: 'inactive',
})
const FLEET = [ONLY_DRIVES, DRIVES_AND_HELPS, ONLY_HELPS, INACTIVE_DRIVER]

function ids(people: readonly { id: string }[]): readonly string[] {
  return people.map((member) => member.id)
}

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

describe('o seletor de motoristas exclui quem não dirige (spec 234 T11)', () => {
  it('criação e montagem: só ativo que dirige', () => {
    expect(ids(listActiveDrivingDrivers(FLEET))).toEqual(['only-drives', 'drives-and-helps'])
  })

  it('troca de tripulação: quem não dirige sai, e o motorista atual fica para poder ser retirado', () => {
    expect(ids(listDriverCandidates({ currentDriverIds: [], drivers: FLEET }))).toEqual([
      'only-drives',
      'drives-and-helps',
      'inactive',
    ])
    expect(ids(listDriverCandidates({ currentDriverIds: ['only-helps'], drivers: FLEET }))).toEqual(
      ['only-drives', 'drives-and-helps', 'only-helps', 'inactive'],
    )
  })

  it('o ajudante puro está no seletor de ajudantes e não no de motoristas', () => {
    const helpers = listHelperCandidates({ currentHelperIds: [], driverIds: [], drivers: FLEET })

    expect(ids(helpers)).toEqual(['drives-and-helps', 'only-helps'])
    expect(ids(listActiveDrivingDrivers(FLEET))).not.toContain('only-helps')
  })

  it('o motorista que também ajuda aparece nos dois, e o que só dirige só no dos motoristas', () => {
    const helpers = ids(
      listHelperCandidates({ currentHelperIds: [], driverIds: [], drivers: FLEET }),
    )
    const drivers = ids(listActiveDrivingDrivers(FLEET))

    expect(helpers).toContain('drives-and-helps')
    expect(drivers).toContain('drives-and-helps')
    expect(helpers).not.toContain('only-drives')
    expect(drivers).toContain('only-drives')
  })

  it('todo seletor de condutor do painel passa pelo filtro', () => {
    for (const path of [
      'src/modules/trip/components/TripQuickCreateDialog.component.tsx',
      'src/modules/trip/components/TripRouteAssemblyPanel.component.tsx',
      'src/modules/mdfe-manifest/components/MdfeManifestCreationPanel.component.tsx',
      'src/modules/trip/pages/TripWorkspace.page.tsx',
    ]) {
      expect(readSource(path)).toContain('listActiveDrivingDrivers(')
    }
    expect(readSource('src/modules/trip/components/TripCrewDialog.component.tsx')).toContain(
      'listDriverCandidates(',
    )
  })

  it('o seletor de ajudantes da criação parte de quem está ativo, não de quem dirige', () => {
    const source = readSource('src/modules/trip/components/TripQuickCreateDialog.component.tsx')

    expect(source).toMatch(/drivers: activeDrivers,\n/)
    expect(source).toContain("drivers.filter((driver) => driver.status === 'active')")
  })
})

describe('a recusa de condutor que não dirige chega legível (spec 234 T11)', () => {
  const driverError = new Error('TRIP_DRIVER_CANNOT_DRIVE')
  const helperError = new Error('TRIP_CREW_HELPER_CANNOT_DRIVE')

  it('na troca de tripulação tem mensagem própria', () => {
    expect(resolveCrewDialogErrorKey(driverError)).toBe('driverCannotDrive')
  })

  it('não se confunde com o 403 do ajudante que tenta despachar', () => {
    expect(resolveCrewDialogErrorKey(helperError)).toBe('generic')
    expect(resolveCrewDialogErrorKey(helperError)).not.toBe(resolveCrewDialogErrorKey(driverError))
    expect(TRIP_FEEDBACK_KEY_BY_ERROR.TRIP_DRIVER_CANNOT_DRIVE).toBe('driverCannotDrive')
    expect(TRIP_FEEDBACK_KEY_BY_ERROR.TRIP_CREW_HELPER_CANNOT_DRIVE).toBeUndefined()
  })

  it('o texto existe nos dois idiomas, na troca e na criação, e não é o genérico', () => {
    for (const locale of [ptLocale, enLocale]) {
      expect(locale.crewDialog.error.driverCannotDrive).toBeString()
      expect(locale.crewDialog.error.driverCannotDrive).not.toBe(locale.crewDialog.error.generic)
      expect(locale.feedback.driverCannotDrive).toBeString()
    }
  })
})

describe('a lista vazia de ajudantes diz onde marcar (spec 234 T11)', () => {
  it('aponta Frota e Acesso, nos dois diálogos e nos dois idiomas', () => {
    expect(ptLocale.creation.helpersEmpty).toContain('Frota')
    expect(ptLocale.creation.helpersEmpty).toContain('Acesso')
    expect(ptLocale.crewDialog.helpersEmpty).toBe(ptLocale.creation.helpersEmpty)
    expect(enLocale.creation.helpersEmpty).toContain('Fleet')
    expect(enLocale.creation.helpersEmpty).toContain('Access')
    expect(enLocale.crewDialog.helpersEmpty).toBe(enLocale.creation.helpersEmpty)
  })
})
