/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4b: cada escolha de foto dispara um preparo assíncrono (reduzir no aparelho). Duas escolhas
 * seguidas deixavam a foto mais LENTA sobrescrever a última escolhida — a pessoa via a foto B, o envio levava a A.
 * Só a escolha mais recente vale: o resultado (e a falha) de uma escolha antiga é ignorado.
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import { act } from 'react'

import { useOccurrencePhoto } from '@/modules/cargo-receiving/hooks/useOccurrencePhoto.hook'
import type { OccurrenceDraftPhoto } from '@/modules/cargo-receiving/shared/cargoOccurrenceForm.validation'

import { installCargoOccurrenceDouble } from './cargoOccurrenceHarness.helper'
import { renderHook, settle } from './renderHook.helper'

type Prepared = { original: Blob; thumbnail: Blob | undefined }

function deferred() {
  const state: {
    reject: (reason: Error) => void
    resolve: (value: Prepared) => void
  } = { reject: () => undefined, resolve: () => undefined }
  const promise = new Promise<Prepared>((resolve, reject) => {
    state.resolve = resolve
    state.reject = reject
  })
  return { promise, ...state }
}

const photoFile = (name: string) => new File([new Uint8Array(8)], name, { type: 'image/jpeg' })
const blobOf = (size: number): Prepared => ({
  original: new Blob([new Uint8Array(size)], { type: 'image/jpeg' }),
  thumbnail: undefined,
})

beforeEach(() => {
  document.body.innerHTML = ''
})

async function mountPhotoHook() {
  const prepared: OccurrenceDraftPhoto[] = []
  const pending = new Map<string, ReturnType<typeof deferred>>()
  installCargoOccurrenceDouble({
    prepare: (file) => {
      const entry = deferred()
      pending.set(file.name, entry)
      return entry.promise
    },
  })
  const hook = await renderHook(() => useOccurrencePhoto((photo) => prepared.push(photo)))
  return { hook, pending, prepared }
}

describe('duas escolhas seguidas de foto', () => {
  test('a mais lenta termina DEPOIS da última escolhida e não a sobrescreve', async () => {
    const { hook, pending, prepared } = await mountPhotoHook()

    await act(async () => {
      hook.result().setFile(photoFile('lenta.jpg'))
      hook.result().setFile(photoFile('rapida.jpg'))
      await Promise.resolve()
    })
    await act(async () => {
      pending.get('rapida.jpg')?.resolve(blobOf(20))
      await Promise.resolve()
    })
    await settle()
    await act(async () => {
      pending.get('lenta.jpg')?.resolve(blobOf(10))
      await Promise.resolve()
    })
    await settle()

    expect(prepared.map((photo) => photo.original.size)).toEqual([20])
    expect(hook.result().isPreparing).toBe(false)
    expect(hook.result().previewUrl).toBeDefined()
    hook.unmount()
  })

  test('na ordem natural (a primeira termina antes) só a última vale também', async () => {
    const { hook, pending, prepared } = await mountPhotoHook()

    await act(async () => {
      hook.result().setFile(photoFile('a.jpg'))
      hook.result().setFile(photoFile('b.jpg'))
      await Promise.resolve()
    })
    await act(async () => {
      pending.get('a.jpg')?.resolve(blobOf(10))
      await Promise.resolve()
    })
    await settle()
    expect(hook.result().isPreparing).toBe(true)
    await act(async () => {
      pending.get('b.jpg')?.resolve(blobOf(20))
      await Promise.resolve()
    })
    await settle()

    expect(prepared.map((photo) => photo.original.size)).toEqual([20])
    expect(hook.result().isPreparing).toBe(false)
    hook.unmount()
  })

  test('a falha de uma escolha antiga não derruba a foto boa da última', async () => {
    const { hook, pending, prepared } = await mountPhotoHook()

    await act(async () => {
      hook.result().setFile(photoFile('velha.jpg'))
      hook.result().setFile(photoFile('nova.jpg'))
      await Promise.resolve()
    })
    await act(async () => {
      pending.get('nova.jpg')?.resolve(blobOf(20))
      await Promise.resolve()
    })
    await settle()
    await act(async () => {
      pending.get('velha.jpg')?.reject(new Error('FOTO_ILEGIVEL'))
      await Promise.resolve()
    })
    await settle()

    expect(prepared.map((photo) => photo.original.size)).toEqual([20])
    expect(hook.result().failure).toBeUndefined()
    hook.unmount()
  })

  test('uma escolha só continua funcionando: o resultado entra e o preparo termina', async () => {
    const { hook, pending, prepared } = await mountPhotoHook()

    await act(async () => {
      hook.result().setFile(photoFile('unica.jpg'))
      await Promise.resolve()
    })
    expect(hook.result().isPreparing).toBe(true)
    await act(async () => {
      pending.get('unica.jpg')?.resolve(blobOf(30))
      await Promise.resolve()
    })
    await settle()

    expect(prepared.map((photo) => photo.original.size)).toEqual([30])
    expect(hook.result().isPreparing).toBe(false)
    hook.unmount()
  })
})
