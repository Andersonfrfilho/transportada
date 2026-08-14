# 037 — Plano

Cinco blocos em ordem obrigatória, e a ordem é a razão de ser deste plano: os dois pacotes
(`fiscal-provider`, `logger`) publicam antes de qualquer coisa aqui, porque relaxar o banco antes de
corrigir o pacote troca uma rejeição visível por uma corrupção silenciosa.

Dois repositórios: `~/Documents/personal/adatechnology-packages` (Fases A–B) e este (C–F).

## Fase A — a primitiva no `fiscal-provider`

Arquivo novo `src/sefaz/SefazTaxId.ts` (junto de `SefazChave.ts`, que é quem mais o usa):

```ts
export const CNPJ_PATTERN = /^[A-Z0-9]{12}[0-9]{2}$/
export const CHAVE_PATTERN = /^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$/
export function charValue(character: string): number // charCodeAt(0) - 48
export function normalizeTaxId(value: string): string // tira . / - e espaço, sobe caixa
export function calcularDvCnpj(base12: string): string
export function calcularDvChave(base43: string): string
```

`normalizeTaxId` **não** usa `\D`. Caractere que sobrar fora de `[A-Z0-9]` é entrada inválida, e
quem chama rejeita — nunca remove.

Depois, três eliminações de duplicata:

- `SefazChave.ts:56`, `CteXmlBuilder.ts:11-21` e `MdfeXmlBuilder.ts:29-39` — as três cópias do
  módulo 11 passam a chamar `calcularDvChave`.
- `SefazChave.ts:28`, `CteXmlBuilder.ts:34` e `MdfeXmlBuilder.ts:51` — os três
  `replace(/\D/g,'').padStart(14,'0')` viram `normalizeTaxId`. O `padStart` sai: um CNPJ que não
  tem 14 caracteres depois de normalizar é erro, não é algo a completar com zero.
- `isChaveDvValid` (`SefazChave.ts:43`) troca `replace(/\D/g,'')` + `length !== 44` por
  `CHAVE_PATTERN`.

Os seis sítios de validação de chave (`SefazNfeProvider.ts:169-178`, `SefazNfceProvider.ts:217-226`,
`SefazMdfeProvider.ts:20,52-53,71-72`, `NfeDistribuicaoProvider.ts:284-287`,
`NfeXmlImporter.service.ts:27,454`, `SefazQrCodeVerifier.ts:90,102-106`) passam a usar
`CHAVE_PATTERN`. Os ~18 pontos de montagem de XML que hoje fazem `replace(/\D/g,'')` sobre CNPJ
(`SefazXmlBuilder.ts`, `NfeXmlBuilder.ts`, `SefazSoapClient.ts`, `CteSoapClient.ts`,
`CteXmlBuilder.ts`, `MdfeXmlBuilder.ts`, `SatProvider.ts`, `NfseProvider.ts`,
`NotaRpNfseProvider.ts:94` no header `X-Auth-CNPJ`) passam a `normalizeTaxId` — os que tocam CPF,
CEP ou telefone ficam como estão.

`collectRelatedCnpjs` (`NfeXmlImporter.service.ts:28,379`) hoje descarta CNPJ com letra; passa a
manter. `CertificateValidator.ts:168-170,180-181` compara CNPJ do certificado com o da empresa —
os dois lados normalizados. `LogObfuscator.ts:24` deixa CNPJ alfanumérico vazar em `rawResponse`.

Máscaras de impressão sem guarda de comprimento (`DanfceBuilder.ts:29-32`,
`controlid-cupom.ts:317-323`, `CupomPdfBuilder.ts:29-33,40-43,212`) fatiam por posição — com 14
caracteres a fatia continua certa, mas a guarda de conjunto entra.

O teste de fio `test/contract/mdfe-sefaz-wire.contract.test.ts:45`
(`expect(chaveAcesso.slice(6,20)).toBe(CERTIFICATE_CNPJ)`) ganha um caso alfanumérico ao lado do
numérico.

**Não-regressão é o gate desta fase:** um conjunto de CNPJs numéricos reais tem de gerar XML
idêntico ao de antes da mudança.

## Fase B — redação no `logger`

`src/redact.ts` — os três padrões (`redact.ts:44,45,50`):

- `ACCESS_KEY_PATTERN` → `(?<![A-Z0-9])[0-9]{6}[A-Z0-9]{12}[0-9]{26}(?![A-Z0-9])`
- `CNPJ_BARE_PATTERN` → `(?<![A-Z0-9])[A-Z0-9]{12}[0-9]{2}(?![A-Z0-9])`
- `CNPJ_FORMATTED_PATTERN` → aceita letra nos blocos de raiz e ordem

O risco desta fase é o inverso do resto: um padrão largo demais passa a redigir texto que não é
documento. O teste tem de fixar tanto o que casa quanto o que **não** pode casar (hash, id opaco,
palavra de 14 letras).

As duas fases publicam por changeset no GitHub Actions. Só depois este repositório sobe a versão.

## Fase C — `api-transportada`: banco

Onze CHECK de CNPJ relaxados de `^[0-9]{14}$` para `^[A-Z0-9]{12}[0-9]{2}$`:
`company-fiscal-profile.schema.ts:127,153-155`, `digital-certificate.schema.ts:75`,
`billing.schema.ts:110-113`, `fleet.schema.ts:186-189,241-244`, `mdfe.schema.ts:257`,
`nfse.schema.ts:292,367`, `cte-emission-profile.schema.ts:251-254` (nos dois ramos — o de raiz
`^[0-9]{8}$` vira `^[A-Z0-9]{8}$`).

Cinco CHECK de chave de acesso relaxados para `^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$`:
`nfe.schema.ts:228,316,515`, `cte-issuance.schema.ts:215`, `billing.schema.ts:194`, mais
`mdfe.schema.ts:121` (`ACCESS_KEY_PATTERN`).

Os CHECK de **CPF** — `fleet_drivers.tax_id`, `fleet_drivers.license_number`, `trip.driver_tax_id`,
condutor de MDF-e — **não são tocados**.

Migration por `db:generate`, `rollback.sql` à mão no molde já usado no repositório, diretório na
lista literal de `test/database-migration/static-migration.contract.ts`. Aditivas: nenhuma linha
existente é reescrita.

## Fase D — `api-transportada`: fronteira e domínio

Um `shared/tax-id.service.ts` reexportando a primitiva do pacote, no molde de
`shared/rntrc.service.ts` — nenhum módulo importa `src/sefaz/*` direto.

Os ~12 schemas Zod (`company-settings.schema.ts:21,27,56,84,151`;
`fleet-request.schema.ts:19,22,28,55,87,88,92`; `nfse-profile-request.schema.ts:17,79`;
`cte-emission-profile-request.schema.ts:30,57`; `mdfe-manifest-request.schema.ts:23,42`;
`freight-rule-mutation.schema.ts:14,19`; `nfse-invoices.schema.ts:27,132`;
`billing.schema.ts:13,472`) trocam a regex e ganham `.transform(normalizeTaxId)` — a
canonicalização acontece **na fronteira**, uma vez, não espalhada.

`fiscal-company-profile-lookup.gateway.ts:19,26,43-45` é o pior ponto do repositório: um
`onlyDigits` que apaga a letra antes da busca, fazendo a empresa não ser encontrada. Sai.

`nfe-documents.routes.ts:200` (`/^[0-9]{44}\.xml$/`) passa a `CHAVE_PATTERN`. As duas máscaras
(`dacte-format.policy.ts:78-89`, `invoice-layout.policy.ts:247-256`) ganham guarda de conjunto —
ficam duplicadas, como já estão, porque uma imprime em PDF fiscal e a outra em relatório, e unificar
as duas é mudança de escopo próprio.

`cte-batch-eligibility.policy.ts:22,137` (`isFullTaxId` → `missingParty` silencioso) e
`emission-profile-resolution.policy.ts:17,18,141,157` (raiz por `slice(0,8)`) continuam com a
mesma lógica, com o padrão novo. `freight-rule-filters.policy.ts` já faz `.trim().toUpperCase()` —
nada a mudar lá, e é a confirmação de que a canonicalização em maiúscula é o hábito da casa.

As três comparações `!==` (`update-company-settings.use-case.ts:118-120`,
`digital-certificate-rotation.service.ts:34`, `replace-digital-certificate.use-case.ts:128`)
passam a comparar valores já canonicalizados pela fronteira. Nenhuma delas ganha `toUpperCase`
local: se precisar, é sinal de que algo entrou sem passar pela fronteira.

Nada muda na discriminação CPF × CNPJ (`cte-payload.builder.ts:39-40,66-72`,
`mdfe-payload.builder.ts:34,189-191,332,336`, `cte-receiver-ie.policy.ts:34`,
`invoice-layout.policy.ts:9-10,214`): é por comprimento, e 14 continua 14.

## Fase E — `worker` e `cron`

`nfe-distribution-item.mapper.ts:19,23,130` — os dois padrões e o descarte silencioso.
`nfe-import-consumer.service.ts:320` — a fatia continua, com os dois lados canonicalizados.
`drizzle-nfe-distribution-profile.repository.ts:85-86`
(`NFE_DISTRIBUTION_CERTIFICATE_CNPJ_MISMATCH`) idem.

As colunas do worker são `text()` sem CHECK e o Zod é `min(1)` — não há padrão a relaxar, mas as
**cópias por valor** do schema Drizzle (`processing.schema.ts`,
`cte-issuance-execution.schema.ts`) precisam ser conferidas contra a API depois da Fase C, e as
quatro cópias do trilho de NFS-e no cron acompanham. É a armadilha conhecida deste monorepo.

## Fase F — `frontend-transportada`

`companySettingsMask.service.ts:6-8,11-19,51-67` é o centro: `stripNonDigits` vira
`normalizeTaxId` para CNPJ e continua existindo, com o nome que tem, para CPF/CEP/telefone.
`companySettings.constant.ts:19-24` (`PROFILE_DIGIT_LENGTHS.cnpj = 14`) segue 14 — comprimento não
mudou, conjunto mudou; `companySettingsFormValidation.service.ts:57-71` (`digitLengthError`) ganha
o erro de conjunto ao lado do de comprimento.

`nfseCredentialForm.service.ts:16,54-57` (`/^\d{14}$/`) e `pixKeyType.service.ts:10-14,24-31,35-40`
(discriminação de tipo de chave PIX — a chave CNPJ muda, a CPF não).

As 6 cópias de `replace(/\D/g,'')` (`MdfeDefaultsFields:26`, `BillingDefaultsFields:42`,
`MdfeManifestLotacaoFields:21`, `fleetForm.service.ts:72`, `rntrc.service.ts:11`) e as 3 chamadas
do fluxo de consulta (`CompanySettingsForm.component.tsx:74`, `useCompanyWizard.hook.ts:50`) são
trocadas **só onde o valor é CNPJ**.

`test/fleet/presentation-boundaries.contract.ts:28` afirma o literal `'maxLength={14}'` no fonte do
componente. O `maxLength` continua 14; o contrato só é tocado se a asserção passar a olhar outra
coisa.

O campo sobe a caixa enquanto se digita sem mover o cursor — é o único detalhe de UX desta spec, e
é o que impede o usuário de criar `12abc…` achando que criou `12ABC…`.

## Riscos

1. **Canonicalização de caixa.** Comparação `!==` e UNIQUE sensível a caixa: sem maiúscula na
   fronteira, dois cadastros da mesma empresa. Mitigação: transformação no Zod, e contrato que
   grava minúscula e lê maiúscula.
2. **Redação larga demais no `logger`.** Padrão frouxo redige o que não é documento e apaga
   informação de diagnóstico. Mitigação: teste com lista negativa explícita.
3. **Regressão no numérico.** É o custo real de mexer em geração de XML fiscal. Mitigação: o gate
   de XML idêntico na Fase A, antes de publicar.
4. **Cópias por valor no worker e no cron.** Mitigação: conferência explícita como task, não como
   lembrete.

## 🤖 Modelo por fase

| Fase                           | Modelo    |
| ------------------------------ | --------- |
| T000 (norma)                   | `sonnet`  |
| A — primitiva e XML fiscal     | `opus` 🧠 |
| B — redação de log             | `sonnet`  |
| C — migrations                 | `sonnet`  |
| D — fronteira e domínio da API | `sonnet`  |
| E — worker e cron              | `sonnet`  |
| F — frontend                   | `sonnet`  |
