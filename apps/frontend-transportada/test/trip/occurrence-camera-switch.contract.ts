/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  buildCameraConstraints,
  countVideoInputDevices,
  DEFAULT_CAMERA_FACING_MODE,
  nextCameraFacingMode,
  openCameraStream,
} from '@/components/ui/barcodeScanner.service'

function navigatorWith(devices: readonly unknown[]): unknown {
  return { mediaDevices: { enumerateDevices: () => Promise.resolve(devices) } }
}

describe('seleção de câmera', () => {
  test('a traseira continua sendo o padrão', () => {
    expect(DEFAULT_CAMERA_FACING_MODE).toBe('environment')
    expect(buildCameraConstraints()).toEqual({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    })
  })

  /** `exact` faria o aparelho de uma câmera só responder `OverconstrainedError`. */
  test('a frontal também entra como ideal, nunca exact', () => {
    expect(buildCameraConstraints('user')).toEqual({
      audio: false,
      video: { facingMode: { ideal: 'user' } },
    })
  })

  test('virar alterna entre as duas e volta', () => {
    expect(nextCameraFacingMode('environment')).toBe('user')
    expect(nextCameraFacingMode(nextCameraFacingMode('environment'))).toBe('environment')
  })

  test('abrir a câmera repassa a escolha ao getUserMedia', async () => {
    const asked: unknown[] = []
    const source = {
      mediaDevices: {
        getUserMedia: (constraints: unknown) => {
          asked.push(constraints)
          return Promise.resolve({ getTracks: () => [] })
        },
      },
    }

    await openCameraStream(source, 'user')

    expect(asked).toEqual([{ audio: false, video: { facingMode: { ideal: 'user' } } }])
  })

  test('conta só as entradas de vídeo', async () => {
    const devices = [{ kind: 'videoinput' }, { kind: 'audioinput' }, { kind: 'videoinput' }]

    expect(await countVideoInputDevices(navigatorWith(devices))).toBe(2)
  })

  test('aparelho sem enumeração ou com falha responde zero — o botão de virar não aparece', async () => {
    expect(await countVideoInputDevices(undefined)).toBe(0)
    expect(await countVideoInputDevices({ mediaDevices: {} })).toBe(0)
    expect(
      await countVideoInputDevices({
        mediaDevices: {
          enumerateDevices: () => Promise.reject(new Error('NotAllowed')),
        },
      }),
    ).toBe(0)
  })
})
