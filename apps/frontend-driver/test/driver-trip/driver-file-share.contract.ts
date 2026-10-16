/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  DriverFileShareError,
  openDriverFileInNewTab,
  shareDriverFiles,
  type DriverFileShareDependencies,
} from '@/modules/driver-trip/shared/driverFileShare.service'

const FILES = [
  { contentType: 'application/pdf', fileName: 'boleto.pdf', objectId: 'obj-1' },
  { contentType: 'image/jpeg', fileName: 'foto.jpg', objectId: 'obj-2' },
]

type Recorder = {
  downloads: string[]
  shared: { files: File[]; title: string | undefined }[]
}

function buildDependencies(input: {
  readonly canShare: boolean | undefined
  readonly fetchFails?: boolean
  readonly shareError?: Error
}): { dependencies: DriverFileShareDependencies; recorder: Recorder } {
  const recorder: Recorder = { downloads: [], shared: [] }
  const navigatorLike: DriverFileShareDependencies['navigator'] = {
    ...(input.canShare === undefined ? {} : { canShare: () => input.canShare === true }),
    share: (data) => {
      if (input.shareError !== undefined) return Promise.reject(input.shareError)
      recorder.shared.push({ files: [...(data.files ?? [])], title: data.title })
      return Promise.resolve()
    },
  }
  return {
    dependencies: {
      fetch: (url) => {
        if (input.fetchFails === true) return Promise.reject(new TypeError('network'))
        return Promise.resolve(new Response(`bytes:${url}`, { status: 200 }))
      },
      navigator: navigatorLike,
      save: ({ fileName }) => {
        recorder.downloads.push(fileName)
      },
    },
    recorder,
  }
}

const readUrl = (objectId: string): Promise<string> =>
  Promise.resolve(`https://storage.test/${objectId}`)

async function captureError(attempt: Promise<unknown>): Promise<unknown> {
  try {
    await attempt
  } catch (error) {
    return error
  }
  return undefined
}

describe('shareDriverFiles', () => {
  it('shares File objects when the browser can share files', async () => {
    const { dependencies, recorder } = buildDependencies({ canShare: true })
    const outcome = await shareDriverFiles({ dependencies, files: FILES, readUrl, title: 'Avaria' })
    expect(outcome).toBe('shared')
    expect(recorder.downloads).toEqual([])
    expect(recorder.shared).toHaveLength(1)
    expect(recorder.shared[0]?.title).toBe('Avaria')
    expect(recorder.shared[0]?.files.map((file) => file.name)).toEqual(['boleto.pdf', 'foto.jpg'])
    expect(recorder.shared[0]?.files[0]?.type).toBe('application/pdf')
  })

  it('downloads every file when canShare says no', async () => {
    const { dependencies, recorder } = buildDependencies({ canShare: false })
    const outcome = await shareDriverFiles({ dependencies, files: FILES, readUrl, title: 'x' })
    expect(outcome).toBe('downloaded')
    expect(recorder.shared).toEqual([])
    expect(recorder.downloads).toEqual(['boleto.pdf', 'foto.jpg'])
  })

  it('downloads when canShare does not exist', async () => {
    const { dependencies, recorder } = buildDependencies({ canShare: undefined })
    const outcome = await shareDriverFiles({ dependencies, files: FILES, readUrl, title: 'x' })
    expect(outcome).toBe('downloaded')
    expect(recorder.downloads).toHaveLength(2)
  })

  it('treats the user closing the share sheet as a cancel, not an error', async () => {
    const abort = new DOMException('cancelled', 'AbortError')
    const { dependencies } = buildDependencies({ canShare: true, shareError: abort })
    const outcome = await shareDriverFiles({ dependencies, files: FILES, readUrl, title: 'x' })
    expect(outcome).toBe('cancelled')
  })

  it('throws a typed error when the share sheet fails for another reason', async () => {
    const { dependencies } = buildDependencies({ canShare: true, shareError: new Error('boom') })
    const error = await captureError(
      shareDriverFiles({ dependencies, files: FILES, readUrl, title: 'x' }),
    )
    expect(error).toBeInstanceOf(DriverFileShareError)
  })

  it('throws a typed error when the file cannot be fetched', async () => {
    const { dependencies, recorder } = buildDependencies({ canShare: true, fetchFails: true })
    const error = await captureError(
      shareDriverFiles({ dependencies, files: FILES, readUrl, title: 'x' }),
    )
    expect(error).toBeInstanceOf(DriverFileShareError)
    expect(recorder.shared).toEqual([])
  })

  it('throws a typed error when the signed url cannot be read', async () => {
    const { dependencies } = buildDependencies({ canShare: true })
    const error = await captureError(
      shareDriverFiles({
        dependencies,
        files: FILES,
        readUrl: () => Promise.reject(new Error('404')),
        title: 'x',
      }),
    )
    expect(error).toBeInstanceOf(DriverFileShareError)
  })
})

describe('openDriverFileInNewTab', () => {
  it('opens the url in a new tab without opener', () => {
    const calls: unknown[][] = []
    openDriverFileInNewTab({
      open: (...args: unknown[]) => {
        calls.push(args)
        return null
      },
      url: 'https://storage.test/x',
    })
    expect(calls).toEqual([['https://storage.test/x', '_blank', 'noopener']])
  })
})
