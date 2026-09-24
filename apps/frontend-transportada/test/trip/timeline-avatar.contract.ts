import { describe, expect, it } from 'bun:test'

import {
  resolveTripTimelineAvatar,
  resolveTripTimelineAvatarInitials,
  resolveTripTimelineAvatarPaletteIndex,
  TRIP_TIMELINE_AVATAR_PALETTE_SIZE,
} from '../../src/modules/trip/shared/tripTimelineAvatar.service'
import type { TripTimelineItem } from '../../src/modules/trip/shared/trip.types'

const BASE_ITEM: TripTimelineItem = {
  actorName: 'Marina Alves',
  channel: 'office',
  closeReason: null,
  document: null,
  fromStatus: null,
  id: 'item-1',
  kind: 'trip.status_changed',
  occurrence: null,
  occurredAt: '2026-09-18T12:00:00.000Z',
  onBehalfOfDriverName: null,
  recordedAt: null,
  returnReason: null,
  stop: null,
  toStatus: 'separated',
}

/**
 * Spec 180 RF9/RF10/RF11 (CA08/CA09): avatar de iniciais nasce do `actorName` que o item já
 * publica, cor estável entre renders, e nenhum avatar sem autor identificado.
 */
describe('avatar de iniciais do evento (spec 180 RF9-RF11)', () => {
  it('primeiro e último nome viram as iniciais (RF10)', () => {
    expect(resolveTripTimelineAvatarInitials('Eurides Dias Fontes')).toBe('EF')
  })

  it('nome de uma palavra só dá uma letra (RF10)', () => {
    expect(resolveTripTimelineAvatarInitials('Marina')).toBe('M')
  })

  it('nome vazio não quebra — string vazia', () => {
    expect(resolveTripTimelineAvatarInitials('   ')).toBe('')
  })

  it('a cor é estável para o mesmo nome entre chamadas (RF10, CA08)', () => {
    const first = resolveTripTimelineAvatarPaletteIndex('Marina Alves')
    const second = resolveTripTimelineAvatarPaletteIndex('Marina Alves')
    expect(first).toBe(second)
  })

  it('o índice de cor sempre cai dentro da paleta', () => {
    for (const name of ['Marina Alves', 'João Pereira', 'Zé', 'Eurides Dias Fontes']) {
      const index = resolveTripTimelineAvatarPaletteIndex(name)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(TRIP_TIMELINE_AVATAR_PALETTE_SIZE)
    }
  })

  it('com actorName, o evento tem avatar (CA08)', () => {
    const avatar = resolveTripTimelineAvatar(BASE_ITEM)
    expect(avatar).not.toBeNull()
    expect(avatar?.initials).toBe('MA')
  })

  it('sem actorName, o evento não tem avatar (RF11, CA09)', () => {
    expect(resolveTripTimelineAvatar({ ...BASE_ITEM, actorName: null })).toBeNull()
  })
})
