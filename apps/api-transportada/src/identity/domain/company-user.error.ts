/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/**
 * Cobre tanto "não existe" quanto "existe em outra empresa" — a mensagem não pode confirmar
 * qual dos dois é o caso, nem carregar o id do usuário ou da empresa.
 */
export class CompanyUserNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'COMPANY_USER_NOT_FOUND',
      message: 'Company user was not found.',
      status: 404,
    })
    this.name = 'CompanyUserNotFoundError'
  }
}

/**
 * O `username` é o login: precisa ser único no provedor de identidade. A mensagem não diz de quem
 * é o login já usado — isso enumeraria usuários de outras empresas para quem só administra a sua.
 */
export class DuplicateUsernameError extends ApiError {
  public constructor() {
    super({
      code: 'USERNAME_ALREADY_TAKEN',
      message: 'Username is already taken.',
      status: 409,
    })
    this.name = 'DuplicateUsernameError'
  }
}

/**
 * O contato do convite é o e-mail do usuário no provedor de identidade, e lá ele é único. Como no
 * login já usado, a mensagem não diz de quem é o e-mail.
 */
export class DuplicateContactError extends ApiError {
  public constructor() {
    super({
      code: 'COMPANY_USER_CONTACT_TAKEN',
      message: 'Contact is already taken.',
      status: 409,
    })
    this.name = 'DuplicateContactError'
  }
}

/**
 * O CPF identifica a pessoa no realm inteiro: a mesma pessoa em duas empresas é uma identidade só.
 * Como no login já usado, a mensagem não diz de quem é o documento — isso enumeraria gente de
 * outras empresas para quem só administra a sua.
 */
export class DuplicateTaxIdError extends ApiError {
  public constructor() {
    super({
      code: 'COMPANY_USER_TAX_ID_TAKEN',
      message: 'Tax id is already taken.',
      status: 409,
    })
    this.name = 'DuplicateTaxIdError'
  }
}

/**
 * Vínculo na aplicação sem identidade externa correspondente é estado inconsistente: falha alto,
 * porque continuar significaria mudar o banco sem que o provedor de identidade acompanhe.
 */
export class IdentitySubjectNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'IDENTITY_SUBJECT_NOT_FOUND',
      message: 'Identity provider subject was not found for the user.',
      status: 409,
    })
    this.name = 'IdentitySubjectNotFoundError'
  }
}

export class SelfMembershipRemovalError extends ApiError {
  public constructor() {
    super({
      code: 'SELF_MEMBERSHIP_REMOVAL',
      message: 'A user cannot remove their own membership.',
      status: 409,
    })
    this.name = 'SelfMembershipRemovalError'
  }
}

/**
 * O provedor recusou a troca do login. O caso comum é o realm com `editUsernameAllowed` desligado,
 * que é o **padrão do Keycloak**: ali o login é imutável depois de criado, e nenhuma permissão desta
 * aplicação muda isso — é configuração do realm.
 *
 * A mensagem não repete o texto do provedor: ele varia por versão e por idioma do servidor, e o que
 * o formulário precisa é saber em que campo ancorar a recusa.
 */
export class UsernameChangeRefusedError extends ApiError {
  public constructor() {
    super({
      code: 'USERNAME_CHANGE_REFUSED',
      message: 'The identity provider refused the username change.',
      status: 409,
    })
    this.name = 'UsernameChangeRefusedError'
  }
}
