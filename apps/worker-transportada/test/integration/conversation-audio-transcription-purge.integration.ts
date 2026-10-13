/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3, contra Postgres de verdade: o expurgo do texto quando o objeto do áudio foi apagado.
 */
import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import { seedAudioAttachment } from '../fixtures/audio-transcription-graph.fixture.js'
import {
  describeDatabase,
  HOUR,
  useAudioIntegrationContext,
} from './audio-transcription-integration.support.js'

describeDatabase('expurgo do texto da transcrição (spec 264 T3.3)', () => {
  const { backdateUpdatedAt, cycleQueue, database, enabledCompany, insertPending, rowOf } =
    useAudioIntegrationContext()

  describe('expurgo (RF18, §5.6 passo 7)', () => {
    test('ready with a deleted object loses the text but stays ready, with generated_at kept', async () => {
      const company = await enabledCompany()
      const gone = await seedAudioAttachment(database, {
        ageSeconds: HOUR,
        company,
        objectStatus: 'deleted',
      })
      const kept = await seedAudioAttachment(database, { ageSeconds: HOUR, company })
      for (const audio of [gone, kept]) {
        await insertPending(
          company,
          audio.attachmentId,
          sql`status = 'ready', text = 'segredo', generated_at = now() - interval '1 hour'`,
        )
      }
      await backdateUpdatedAt(gone.attachmentId)
      const before = await rowOf(gone.attachmentId)
      expect(await cycleQueue.purgeDeletedText()).toBe(1)
      const purged = await rowOf(gone.attachmentId)
      expect(purged).toMatchObject({ status: 'ready', text: null })
      expect(purged?.generated_at?.getTime()).toBe(before?.generated_at?.getTime())
      expect(purged?.updated_at.getTime()).toBeGreaterThan(before?.updated_at.getTime() ?? 0)
      expect((await rowOf(kept.attachmentId))?.text).toBe('segredo')
    })
  })
})
