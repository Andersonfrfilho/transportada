/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6 (D6): o remetente original é lido do bloco encaminhado ou do cabeçalho da mensagem
 * anexada — é INFORMAÇÃO de quem encaminha, nunca autenticação. Cabeçalho duplicado, lista de
 * endereços ou ausência não adivinham: viram `ambiguous` ou `missing`.
 */
import { describe, expect, test } from 'bun:test'

import {
  readOriginalSenderFromForwardedText,
  readOriginalSenderFromHeaders,
} from '../../src/cargo-preview-email/domain/forwarded-original-sender.policy.js'

const header = (key: string, value: string) => ({ key, value })

describe('o remetente original no cabeçalho da mensagem anexada (spec 237 T4.6)', () => {
  test('um From só dá o endereço, minúsculo', () => {
    expect(
      readOriginalSenderFromHeaders([
        header('subject', 'x'),
        header('from', 'FR <FR@Contratante.example>'),
      ]),
    ).toEqual({ address: 'fr@contratante.example', kind: 'found' })
  })

  test('From duplicado, mesmo igual, é ambíguo (cabeçalho forjado)', () => {
    expect(
      readOriginalSenderFromHeaders([header('from', 'a@x.example'), header('from', 'a@x.example')]),
    ).toEqual({ kind: 'ambiguous' })
  })

  test('mais de um endereço no From é ambíguo', () => {
    expect(readOriginalSenderFromHeaders([header('from', 'a@x.example, b@x.example')])).toEqual({
      kind: 'ambiguous',
    })
  })

  test.each([[''], ['sem arroba'], ['<>']])('From malformado %p é ausente', (value) => {
    expect(readOriginalSenderFromHeaders([header('from', value)])).toEqual({ kind: 'missing' })
  })

  test('sem From é ausente', () => {
    expect(readOriginalSenderFromHeaders([header('subject', 'x')])).toEqual({ kind: 'missing' })
  })
})

describe('o remetente original no bloco encaminhado do texto (spec 237 T4.6)', () => {
  test.each([
    [
      'Gmail',
      '---------- Forwarded message ---------\nFrom: FR <fr@contratante.example>\nDate: x\n\ncorpo',
    ],
    [
      'Gmail em português',
      '---------- Mensagem encaminhada ---------\nDe: FR <fr@contratante.example>\nData: x\n\ncorpo',
    ],
    [
      'Thunderbird',
      '-------- Forwarded Message --------\nFrom: fr@contratante.example\nSubject: x\n\ncorpo',
    ],
    [
      'Apple Mail',
      'Begin forwarded message:\n\nFrom: FR <fr@contratante.example>\nSubject: x\n\ncorpo',
    ],
    [
      'Outlook',
      'segue\n________________________________\nDe: FR <fr@contratante.example>\nEnviado: terça\nPara: x\n\ncorpo',
    ],
    [
      'Outlook texto, com o endereço repetido em <mailto:>',
      'segue\n________________________________\nFrom: Fulano <fr@contratante.example<mailto:fr@contratante.example>>\nSent: Tuesday\nTo: x\n\ncorpo',
    ],
    [
      'Outlook clássico, com [mailto:]',
      '-----Original Message-----\nFrom: Fulano [mailto:fr@contratante.example]\nSent: Tuesday\nTo: x\n\ncorpo',
    ],
    [
      'Outlook em português com a mensagem original',
      '----- Mensagem original -----\nDe: Fulano <fr@contratante.example>\nEnviada em: terça\nPara: x\n\ncorpo',
    ],
    [
      'Apple Mail em português',
      'Início da mensagem encaminhada:\n\nDe: FR <fr@contratante.example>\nAssunto: x\n\ncorpo',
    ],
    [
      'Apple Mail em inglês, endereço sem nome',
      'Begin forwarded message:\n\nFrom: fr@contratante.example\nSubject: x\n\ncorpo',
    ],
    [
      'De dobrado em duas linhas',
      '---------- Mensagem encaminhada ---------\nDe: Fulano de Tal da Silva\n <fr@contratante.example>\nData: x\n\ncorpo',
    ],
    [
      'De dobrado dentro de uma citação',
      'nota\n> ---------- Forwarded message ---------\n> From: Fulano\n>  <fr@contratante.example>\n> Date: x\n>\n> corpo',
    ],
    [
      'assinatura com ____ antes do bloco encaminhado',
      'Att,\nEquipe\n________________________________\nTelefone: 11 9999-9999\n\n---------- Forwarded message ---------\nFrom: FR <fr@contratante.example>\nDate: x\n\ncorpo',
    ],
    [
      'citado com >',
      'nota\n> ---------- Forwarded message ---------\n> From: fr@contratante.example\n>\n> corpo',
    ],
  ])('lê o From do bloco do %s', (_client, text) => {
    expect(readOriginalSenderFromForwardedText(text)).toEqual({
      address: 'fr@contratante.example',
      kind: 'found',
    })
  })

  test('só o primeiro bloco vale; um marcador falso depois dele não troca o remetente', () => {
    const text = [
      '---------- Forwarded message ---------',
      'From: fr@contratante.example',
      'Subject: x',
      '',
      'corpo',
      '---------- Forwarded message ---------',
      'From: mallory@evil.example',
      '',
    ].join('\n')
    expect(readOriginalSenderFromForwardedText(text)).toEqual({
      address: 'fr@contratante.example',
      kind: 'found',
    })
  })

  test('a assinatura com ____ sem bloco algum depois dela é ausente, não um erro', () => {
    expect(
      readOriginalSenderFromForwardedText('Att,\n________________________________\nTel: 1'),
    ).toEqual({
      kind: 'missing',
    })
  })

  test.each([
    ['dois pares de <>', 'x <fr@contratante.example> <mallory@evil.example>'],
    ['comentário com outro endereço', 'fr@contratante.example (mallory@evil.example)'],
    ['grupo', 'grupo: fr@contratante.example;'],
    ['nome codificado que só decodifica para endereço', '=?utf-8?q?fr=40contratante.example?='],
    [
      'Outlook com mailto de outro endereço',
      'x <fr@contratante.example<mailto:mallory@evil.example>>',
    ],
    ['mailto: no endereço', 'mailto:fr@contratante.example'],
  ])('From hostil no bloco (%s) nunca vira o endereço permitido', (_name, value) => {
    const text = `---------- Forwarded message ---------\nFrom: ${value}\nDate: x\n\ncorpo`
    const result = readOriginalSenderFromForwardedText(text)
    expect(result.kind).not.toBe('found')
    const headers = readOriginalSenderFromHeaders([header('from', value)])
    expect(headers.kind).not.toBe('found')
  })

  test('dois From no mesmo bloco são ambíguos', () => {
    const text = '---------- Forwarded message ---------\nFrom: a@x.example\nFrom: b@x.example\n\nc'
    expect(readOriginalSenderFromForwardedText(text)).toEqual({ kind: 'ambiguous' })
  })

  test('mais de um endereço na linha do From é ambíguo', () => {
    const text = '---------- Forwarded message ---------\nFrom: a@x.example, b@x.example\n\nc'
    expect(readOriginalSenderFromForwardedText(text)).toEqual({ kind: 'ambiguous' })
  })

  test('um From solto, sem marcador de encaminhamento, não vale', () => {
    expect(readOriginalSenderFromForwardedText('From: fr@contratante.example\n\ncorpo')).toEqual({
      kind: 'missing',
    })
  })

  test('um marcador além das 200 primeiras linhas não vale', () => {
    const text = `${'linha\n'.repeat(250)}---------- Forwarded message ---------\nFrom: fr@contratante.example\n\nc`
    expect(readOriginalSenderFromForwardedText(text)).toEqual({ kind: 'missing' })
  })

  test('um From além do cabeçalho curto do bloco não vale', () => {
    const text = `---------- Forwarded message ---------\n${'Campo: x\n'.repeat(14)}From: fr@contratante.example\n\nc`
    expect(readOriginalSenderFromForwardedText(text)).toEqual({ kind: 'missing' })
  })

  test.each([[undefined], [''], ['texto sem encaminhamento']])('texto %p é ausente', (text) => {
    expect(readOriginalSenderFromForwardedText(text)).toEqual({ kind: 'missing' })
  })
})
