/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.3a (ADR-0101): o assunto da conversa no schema TypeScript — o vocabulário vem da
 * constante, `occurrence_*` aceita nulo só porque o CHECK de forma segura o resto, e as FKs de nota e
 * viagem levam a empresa.
 */
import { describe, expect, test } from 'bun:test'

import {
  occurrenceConversationMessages,
  occurrenceConversations,
  occurrenceConversationUploads,
} from '../../src/database/database.schema.js'
import {
  CLIENT_MESSAGE_ID_MAX_LENGTH,
  CLIENT_MESSAGE_ID_MIN_LENGTH,
  OCCURRENCE_CONVERSATION_SUBJECT_TYPES,
} from '../../src/shared/occurrence-conversation-subject.constant.js'
import {
  checkSqlByName,
  foreignKeys,
  indexColumnsByName,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('o assunto da conversa no schema (spec 260 T2.3a)', () => {
  test('o tipo de assunto tem padrão ocorrência e o CHECK lista o vocabulário inteiro', () => {
    expect(requiredColumnNames(occurrenceConversations)).toContain('subject_type')
    expect(requiredColumnNames(occurrenceConversations)).not.toContain('occurrence_kind')
    expect(requiredColumnNames(occurrenceConversations)).not.toContain('occurrence_id')
    const checks = checkSqlByName(occurrenceConversations)
    for (const subject of OCCURRENCE_CONVERSATION_SUBJECT_TYPES) {
      expect(checks.occurrence_conversations_subject_type_check).toContain(`'${subject}'`)
    }
    expect(OCCURRENCE_CONVERSATION_SUBJECT_TYPES[0]).toBe('occurrence')
  })

  test('o CHECK de forma amarra cada assunto ao que ele exige', () => {
    const shape =
      checkSqlByName(occurrenceConversations).occurrence_conversations_subject_shape_check
    expect(shape).toContain('occurrence_kind')
    expect(shape).toContain('trip_document_id')
    expect(shape?.match(/participant" = 'driver'/gu)).toHaveLength(2)
  })

  test('nota e viagem têm FK composta com a empresa e único parcial por participante', () => {
    const keys = foreignKeys(occurrenceConversations)
    expect(keys).toContainEqual(
      expect.objectContaining({
        columns: ['company_id', 'trip_id'],
        foreignTable: 'trips',
        onDelete: 'restrict',
      }),
    )
    expect(keys).toContainEqual(
      expect.objectContaining({
        columns: ['company_id', 'trip_document_id'],
        foreignTable: 'trip_documents',
        onDelete: 'restrict',
      }),
    )
    expect(uniqueColumnsByName(occurrenceConversations)).toMatchObject({
      occurrence_conversations_occurrence_participant_unique: [
        'company_id',
        'occurrence_kind',
        'occurrence_id',
        'participant',
      ],
    })
    expect(indexColumnsByName(occurrenceConversations)).toMatchObject({
      occurrence_conversations_driver_user_idx: ['company_id', 'driver_user_id'],
      occurrence_conversations_trip_idx: ['company_id', 'trip_id'],
    })
  })

  test('o eco da mensagem e o envio de arquivo por conversa', () => {
    expect(requiredColumnNames(occurrenceConversationMessages)).not.toContain('client_message_id')
    const messageChecks = checkSqlByName(occurrenceConversationMessages)
    expect(messageChecks.occurrence_conversation_messages_client_message_id_check).toContain(
      `between ${CLIENT_MESSAGE_ID_MIN_LENGTH} and ${CLIENT_MESSAGE_ID_MAX_LENGTH}`,
    )
    expect(foreignKeys(occurrenceConversationUploads)).toContainEqual(
      expect.objectContaining({
        columns: ['company_id', 'conversation_id'],
        foreignTable: 'occurrence_conversations',
        onDelete: 'restrict',
      }),
    )
  })
})
