/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A foto de perfil mora no banco pelo mesmo motivo que o logotipo da empresa: é imagem pequena, uma
 * por pessoa, e um bucket para isso traria credencial, ciclo de vida e URL assinada para guardar
 * algo que cabe numa coluna.
 */
import { describe, expect, test } from 'bun:test'

import { createUserPictureUseCase } from '../../src/identity/application/user-picture.use-case.js'
import {
  UserPictureNotFoundError,
  UserPictureTooLargeError,
  UserPictureUnsupportedFormatError,
} from '../../src/identity/domain/user-picture.error.js'
import {
  assertUserPictureBytes,
  detectUserPictureMimeType,
  USER_PICTURE_MAX_BYTES,
} from '../../src/identity/domain/user-picture.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000b1'
const USER_ID = '00000000-0000-4000-8000-0000000000b2'
const SUBJECT = '00000000-0000-4000-8000-0000000000b3'
const CONTEXT = { companyId: COMPANY_ID } as const

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])
/** `RIFF` + tamanho + `WEBP`: é o que o recorte de fundo devolve, então precisa entrar. */
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
])

describe('o que é imagem de perfil', () => {
  test('os três formatos que a tela produz são reconhecidos pela assinatura', () => {
    expect(detectUserPictureMimeType(PNG)).toBe('image/png')
    expect(detectUserPictureMimeType(JPEG)).toBe('image/jpeg')
    expect(detectUserPictureMimeType(WEBP)).toBe('image/webp')
  })

  /**
   * O `content-type` do multipart vem do cliente. Confiar nele deixaria qualquer arquivo entrar
   * dizendo ser PNG — e sair da rota de leitura com esse tipo, para o navegador de outra pessoa.
   */
  test('o tipo declarado não decide nada: quem decide é o conteúdo', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46])

    expect(detectUserPictureMimeType(pdf)).toBeNull()
    expect(() => assertUserPictureBytes(pdf)).toThrow(UserPictureUnsupportedFormatError)
  })

  test('arquivo grande é recusado antes de virar linha no banco', () => {
    const huge = new Uint8Array(USER_PICTURE_MAX_BYTES + 1)
    huge.set(PNG.slice(0, 8))

    expect(() => assertUserPictureBytes(huge)).toThrow(UserPictureTooLargeError)
  })

  /** Vazio não é imagem, e sem esta guarda ele passaria como formato desconhecido — outra causa. */
  test('arquivo vazio não vira foto', () => {
    expect(() => assertUserPictureBytes(new Uint8Array())).toThrow(
      UserPictureUnsupportedFormatError,
    )
  })
})

type UseCaseParams = Readonly<{
  picture?: {
    readonly bytes: Buffer
    readonly mimeType: 'image/png'
    readonly sha256: string
  } | null
  publicBaseUrl?: string
  subject?: string | undefined
  realmFails?: boolean
}>

function createUseCase(params: UseCaseParams = {}) {
  const saved: { readonly userId: string }[] = []
  const realm: unknown[] = []

  const useCase = createUserPictureUseCase({
    identityGateway: {
      async setProfilePicture(input) {
        if (params.realmFails === true) throw new Error('realm fora do ar')
        realm.push(input)
      },
    },
    ...(params.publicBaseUrl === undefined ? {} : { publicBaseUrl: params.publicBaseUrl }),
    repository: {
      async find() {
        return params.picture === undefined
          ? { bytes: Buffer.from([1]), mimeType: 'image/png' as const, sha256: 'a'.repeat(64) }
          : params.picture
      },
      async findIdentitySubject() {
        return 'subject' in params ? params.subject : SUBJECT
      },
      async remove() {
        return true
      },
      async save(input) {
        saved.push({ userId: input.userId })
        return {
          byteSize: 10,
          mimeType: 'image/png' as const,
          sha256: 'b'.repeat(64),
          updatedAt: new Date(),
        }
      },
    },
  })

  return { realm, saved, useCase }
}

describe('gravar a foto', () => {
  test('grava a imagem e publica a URL no provedor', async () => {
    const { realm, saved, useCase } = createUseCase({ publicBaseUrl: 'https://api.test' })

    await useCase.replace({ bytes: PNG, context: CONTEXT, userId: USER_ID })

    expect(saved).toEqual([{ userId: USER_ID }])
    expect(realm).toEqual([
      { pictureUrl: `https://api.test/company-users/${USER_ID}/picture`, userId: SUBJECT },
    ])
  })

  /**
   * A URL é o endereço público desta instalação, e ele não é adivinhável a partir do request: atrás
   * de proxy o `Host` é o do proxy. Sem a variável, a foto é gravada e o atributo **não** é escrito
   * — publicar um endereço inventado deixaria no realm um avatar que aponta para lugar nenhum.
   */
  test('sem endereço público configurado, grava a foto e não escreve no provedor', async () => {
    const { realm, saved, useCase } = createUseCase()

    await useCase.replace({ bytes: JPEG, context: CONTEXT, userId: USER_ID })

    expect(saved).toHaveLength(1)
    expect(realm).toEqual([])
  })

  /** Quem ainda não tem conta no provedor tem foto aqui: o atributo é o que fica para depois. */
  test('pessoa sem conta no provedor não derruba a gravação', async () => {
    const { realm, saved, useCase } = createUseCase({
      publicBaseUrl: 'https://api.test',
      subject: undefined,
    })

    await useCase.replace({ bytes: WEBP, context: CONTEXT, userId: USER_ID })

    expect(saved).toHaveLength(1)
    expect(realm).toEqual([])
  })

  /**
   * O provedor é sistema de fora, e ele cai. A foto já está gravada quando a chamada acontece —
   * derrubar a resposta faria o operador subir de novo a mesma imagem, que já está lá.
   */
  test('provedor fora do ar não perde a foto que já foi gravada', async () => {
    const { saved, useCase } = createUseCase({
      publicBaseUrl: 'https://api.test',
      realmFails: true,
    })

    const result = await useCase.replace({ bytes: PNG, context: CONTEXT, userId: USER_ID })

    expect(saved).toHaveLength(1)
    expect(result.mimeType).toBe('image/png')
  })
})

describe('ler e apagar', () => {
  test('quem não tem foto responde ausência, não linha vazia', async () => {
    const { useCase } = createUseCase({ picture: null })

    await expect(useCase.find({ context: CONTEXT, userId: USER_ID })).rejects.toBeInstanceOf(
      UserPictureNotFoundError,
    )
  })

  /** Tirar a foto tira o atributo junto: avatar no token apontando para 404 é pior que sem avatar. */
  test('apagar limpa também o atributo do provedor', async () => {
    const { realm, useCase } = createUseCase({ publicBaseUrl: 'https://api.test' })

    await useCase.remove({ context: CONTEXT, userId: USER_ID })

    expect(realm).toEqual([{ pictureUrl: undefined, userId: SUBJECT }])
  })
})
