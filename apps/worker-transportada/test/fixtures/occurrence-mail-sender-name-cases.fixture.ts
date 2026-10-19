/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §8): cópia por valor de `SENDER_DISPLAY_NAME_CASES` da API (`occurrence-mail-sender-name.policy.ts`).
 * `expected` é o que a API grava em `from_display_name`; o worker reaplica o saneamento e não pode mudá-lo.
 */
export type SenderDisplayNameCase = {
  readonly companyDisplayName: string
  readonly expected: string
  readonly name: string
  readonly signer: {
    readonly kind: 'operator' | 'owner' | 'team'
    readonly name?: string
    readonly userId?: string
  }
}

const COMPANY = 'Tapete Mágico'

function person(name: string): SenderDisplayNameCase['signer'] {
  return { kind: 'operator', name, userId: 'user' }
}

export const SENDER_DISPLAY_NAME_CASES: readonly SenderDisplayNameCase[] = [
  {
    companyDisplayName: COMPANY,
    expected: 'Tapete Mágico',
    name: 'equipe: só o nome de exibição',
    signer: { kind: 'team' },
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana Lima — Tapete Mágico',
    name: 'operador: nome e nome de exibição',
    signer: person('Ana Lima'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Carla — Tapete Mágico',
    name: 'dono: como o operador',
    signer: { kind: 'owner', name: 'Carla', userId: 'owner' },
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana Lima — Tapete Mágico',
    name: 'CRLF no nome vira espaço',
    signer: person('Ana\r\nLima'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana Bcc: x@y.z — Tapete Mágico',
    name: 'tentativa de injetar cabeçalho: a quebra some, o texto fica numa linha',
    signer: person('Ana\r\nBcc: x@y.z'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana Lima — Tapete Mágico',
    name: 'NUL vira espaço',
    signer: person('Ana\u0000Lima'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana Lima — Tapete Mágico',
    name: 'tabulação vira espaço',
    signer: person('Ana\tLima'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana Lima — Tapete Mágico',
    name: 'U+2028 vira espaço',
    signer: person('Ana\u2028Lima'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana Lima — Tapete Mágico',
    name: 'U+2029 vira espaço',
    signer: person('Ana\u2029Lima'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana Lima — Tapete Mágico',
    name: 'controle C1 (NEL) vira espaço',
    signer: person('Ana\u0085Lima'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana Lima — Tapete Mágico',
    name: 'DEL vira espaço',
    signer: person('Ana\u007fLima'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana Chefe Lima — Tapete Mágico',
    name: 'aspas saem',
    signer: person('Ana "Chefe" Lima'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'AnaLima — Tapete Mágico',
    name: 'barra invertida sai',
    signer: person('Ana\\Lima'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana ana@x.com — Tapete Mágico',
    name: 'ângulos saem',
    signer: person('Ana <ana@x.com>'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Lima Ana Jr — Tapete Mágico',
    name: 'vírgula e ponto e vírgula saem',
    signer: person('Lima, Ana; Jr'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'AnaLima — Tapete Mágico',
    name: 'bidi: RLO (U+202E) sai',
    signer: person('Ana\u202ELima'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana — Tapete Mágico',
    name: 'bidi: isolados U+2066 e U+2069 saem',
    signer: person('A\u2066n\u2069a'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana — Tapete Mágico',
    name: 'marcas LRM e RLM (U+200E, U+200F) saem',
    signer: person('A\u200En\u200Fa'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana — Tapete Mágico',
    name: 'marca de letra árabe (U+061C) sai',
    signer: person('Ana\u061C'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana — Tapete Mágico',
    name: 'largura zero (U+200B a U+200D) e BOM (U+FEFF) saem',
    signer: person('A\u200Bn\u200Ca\u200D\uFEFF'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana — Tapete Mágico',
    name: 'invisível: WORD JOINER (U+2060) sai',
    signer: person('A\u2060na'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana — Tapete Mágico',
    name: 'invisível: hífen opcional (U+00AD) sai',
    signer: person('A\u00ADna'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana — Tapete Mágico',
    name: 'invisível: separador mongol (U+180E) sai',
    signer: person('A\u180Ena'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana — Tapete Mágico',
    name: 'invisível: tag (U+E0041) sai',
    signer: person('A\u{E0041}na'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana Lima — Tapete Mágico',
    name: 'espaços repetidos e pontas são colapsados',
    signer: person('  Ana    Lima  '),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Ana — Lima — Tapete Mágico',
    name: 'travessão no nome da pessoa é mantido',
    signer: person('Ana — Lima'),
  },
  {
    companyDisplayName: COMPANY,
    expected: 'Tapete Mágico',
    name: 'nome só de invisíveis: some a pessoa',
    signer: person('\u200B\u202E'),
  },
  {
    companyDisplayName: 'Tapete "Mágico"\r\nTransportes\u202E',
    expected: 'Tapete Mágico Transportes',
    name: 'o nome de exibição também é saneado',
    signer: { kind: 'team' },
  },
  {
    companyDisplayName: COMPANY,
    expected: `${'a'.repeat(184)} — Tapete Mágico`,
    name: 'pessoa acima do que cabe: corta a pessoa, o total fica em 200',
    signer: person('a'.repeat(300)),
  },
  {
    companyDisplayName: COMPANY,
    expected: `${'a'.repeat(183)} — Tapete Mágico`,
    name: 'o corte que termina em espaço não deixa espaço antes do travessão',
    signer: person(`${'a'.repeat(183)} ${'b'.repeat(50)}`),
  },
  {
    companyDisplayName: COMPANY,
    expected: `${'😀'.repeat(92)} — Tapete Mágico`,
    name: 'o corte não parte um par substituto',
    signer: person('😀'.repeat(200)),
  },
  {
    companyDisplayName: 'D'.repeat(300),
    expected: 'D'.repeat(200),
    name: 'nome de exibição acima de 200: cortado, a pessoa cai',
    signer: person('Ana Lima'),
  },
  {
    companyDisplayName: 'D'.repeat(300),
    expected: 'D'.repeat(200),
    name: 'equipe com nome de exibição acima de 200: cortado em 200',
    signer: { kind: 'team' },
  },
]
