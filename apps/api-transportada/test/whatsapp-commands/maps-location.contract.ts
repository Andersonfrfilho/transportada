/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O link do Google Maps com as coordenadas na própria URL vale como a localização do motorista; o que não traz
 * coordenadas (link curto, só nome de lugar, outro site) segue sem ponto.
 */
import { describe, expect, test } from 'bun:test'

import { parseMapsLocation } from '../../src/whatsapp-commands/domain/whatsapp-maps-location.policy.js'

describe('parseMapsLocation', () => {
  test('a busca de lugar com @lat,lng (o caso real de 23/11/2026)', () => {
    const text =
      'https://maps.google.com/maps/search/Drogaria%20Poupe%20J%C3%A1%20Brodowski/@-20.99093648,-47.65712384,17z?hl=pt-BR\nR. Mal. Deodoro, 200, Brodowski, 14340-000, SP, BR'
    expect(parseMapsLocation(text)).toEqual({ latitude: -20.99093648, longitude: -47.65712384 })
  })

  test.each([
    ['https://maps.google.com/?q=-21.17,-47.81', -21.17, -47.81],
    ['https://www.google.com/maps?q=-21.170000,-47.810000', -21.17, -47.81],
    [
      'https://www.google.com/maps/dir/?api=1&destination=-20.99139,-47.65861',
      -20.99139,
      -47.65861,
    ],
    [
      'https://www.google.com/maps/place/Loja/@-21.1,-47.8,15z/data=!3d-21.11!4d-47.81',
      -21.11,
      -47.81,
    ],
    ['olha aqui https://www.google.com/maps/@-21.2,-47.9,14z.', -21.2, -47.9],
  ])('%s', (text, latitude, longitude) => {
    expect(parseMapsLocation(text)).toEqual({ latitude, longitude })
  })

  test.each([
    'https://maps.app.goo.gl/AbCdEf123',
    'https://www.google.com/maps/search/Drogaria+Poupe+Brodowski',
    'https://example.com/maps/@-21.2,-47.9,14z',
    'https://www.google.com/search?q=-21.2,-47.9',
    'https://maps.google.com/?q=0,0',
    'https://maps.google.com/?q=-95.1,-47.9',
    'pular',
    '',
  ])('sem ponto: %s', (text) => {
    expect(parseMapsLocation(text)).toBeNull()
  })
})
