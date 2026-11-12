/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  AccessKeyCheckEntry,
  AccessKeyLookupClient,
  AccessKeyLookupView,
  RequestLookupResult,
} from '../../src/modules/nfe-access-key-lookup/shared/accessKeyLookupClient.service'
import type { QueueScheduler } from '../../src/modules/nfe-access-key-lookup/shared/accessKeyLookupQueue.service'

export const KEY_ONE = '35080599999090910270550010000000015180051273'
export const KEY_TWO = '35260712001234560001550010000000011000000007'

type Task = { due: number; handle: number; run: () => void }

export type FakeScheduler = QueueScheduler & {
  advance: (ms: number) => Promise<void>
  pendingCount: () => number
}

/** Deixa as promessas já resolvidas (cliente falso) terminarem antes de o relógio andar de novo. */
export async function flushPromises(): Promise<void> {
  for (let round = 0; round < 8; round += 1) await Promise.resolve()
}

export function createFakeScheduler(): FakeScheduler {
  let current = 0
  let nextHandle = 1
  let tasks: Task[] = []
  return {
    async advance(ms) {
      const target = current + ms
      for (;;) {
        const due = tasks.filter((task) => task.due <= target).sort((a, b) => a.due - b.due)[0]
        if (due === undefined) break
        tasks = tasks.filter((task) => task !== due)
        current = due.due
        due.run()
        await flushPromises()
      }
      current = target
      await flushPromises()
    },
    clear(handle) {
      tasks = tasks.filter((task) => task.handle !== handle)
    },
    now: () => current,
    pendingCount: () => tasks.length,
    schedule(run, delayMs) {
      const handle = nextHandle
      nextHandle += 1
      tasks.push({ due: current + delayMs, handle, run })
      return handle
    },
  }
}

type Mutable<TObject> = { -readonly [Key in keyof TObject]: TObject[Key] }

export type FakeClient = Mutable<AccessKeyLookupClient> & {
  calls: { checks: string[][]; gets: string[]; requests: string[] }
  documents: Map<string, string>
  getResponses: Map<string, () => Promise<AccessKeyLookupView>>
  requestResponses: Map<string, () => Promise<RequestLookupResult>>
}

export function view(
  partial: Partial<AccessKeyLookupView> & { status: AccessKeyLookupView['status'] },
): AccessKeyLookupView {
  return { documentId: null, id: 'lookup-1', notBefore: null, reason: null, ...partial }
}

export function createFakeClient(): FakeClient {
  const client: FakeClient = {
    calls: { checks: [], gets: [], requests: [] },
    checkAccessKeys(accessKeys) {
      client.calls.checks.push([...accessKeys])
      const entries: AccessKeyCheckEntry[] = accessKeys.map((accessKey) => ({
        accessKey,
        documentId: client.documents.get(accessKey) ?? null,
      }))
      return Promise.resolve(entries)
    },
    documents: new Map(),
    getLookup(lookupId) {
      client.calls.gets.push(lookupId)
      const respond = client.getResponses.get(lookupId)
      return respond === undefined
        ? Promise.resolve(view({ id: lookupId, status: 'querying' }))
        : respond()
    },
    getResponses: new Map(),
    requestLookup(accessKey) {
      client.calls.requests.push(accessKey)
      const respond = client.requestResponses.get(accessKey)
      return respond === undefined
        ? Promise.resolve({ kind: 'lookup', lookup: view({ status: 'queued' }) })
        : respond()
    },
    requestResponses: new Map(),
  }
  return client
}
