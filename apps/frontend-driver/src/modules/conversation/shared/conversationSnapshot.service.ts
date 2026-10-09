/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantSubjectRef } from '@adatechnology/conversation-contracts'

export type ConversationSnapshotEntry = Readonly<{
  lastMessageAt: string | null
  subject: ParticipantSubjectRef
  unreadCount: number
}>

export type ConversationSnapshot = readonly ConversationSnapshotEntry[]

export type ConversationSnapshotDiff = Readonly<{
  changedSubjects: readonly ParticipantSubjectRef[]
  inboxChanged: boolean
}>

function keyOf(subject: ParticipantSubjectRef): string {
  return `${subject.subjectType}:${subject.subjectId}`
}

/** Assunto novo, `lastMessageAt` ou `unreadCount` diferente: qualquer um deles pede revalidar. */
export function diffConversationSnapshots(
  previous: ConversationSnapshot,
  current: ConversationSnapshot,
): ConversationSnapshotDiff {
  const previousByKey = new Map(previous.map((entry) => [keyOf(entry.subject), entry]))
  const changedSubjects = current
    .filter((entry) => {
      const before = previousByKey.get(keyOf(entry.subject))
      return (
        before === undefined ||
        before.lastMessageAt !== entry.lastMessageAt ||
        before.unreadCount !== entry.unreadCount
      )
    })
    .map((entry) => entry.subject)
  return { changedSubjects, inboxChanged: changedSubjects.length > 0 }
}
