# ADR 0028 — Cliente da fatura é o tomador gravado na emissão do CT-e

- Status: aceito
- Data: 2026-08-09
- Decisores: mantenedor do projeto e revisão Opus
- Substitui: [ADR 0027](0027-billing-customer-is-nfe-emitter.md)

## Contexto

A ADR 0027 trocou o cliente da fatura do destinatário para o emitente da NF-e e
destravou a geração de faturas. Ela também registrou, honestamente, a limitação
que a decisão carregava: numa instalação cujo perfil de emissão cobre do
destinatário (`taker = '3'`), o faturamento continuaria assumindo o remetente.

Essa limitação é o problema, não um detalhe. Quem paga o frete **já é
configurável** — `cte_emission_profiles.taker` existe, a emissão o respeita via
`resolveTakerParty`, e o payload do CT-e declara `tomador` a partir dele. Só o
faturamento cravava o papel no código. O produto é genérico e instalado por
transportadora (ADR-0021): duas instalações com políticas opostas de tomador
usam o mesmo código, e cravar um papel acerta uma e erra a outra.

A ADR 0027 rejeitou persistir o tomador por supor que o histórico não teria
fonte confiável de backfill. A suposição estava errada: `cte_issuance_payloads`
guarda o `payload` jsonb da emissão, que já contém `tomador` mais o `remetente`
e o `destinatario` completos. O histórico se reconstrói do dado real da própria
emissão, sem re-resolver perfil e sem adivinhar.

## Decisão

1. O cliente da fatura é o **tomador do frete**, resolvido do `taker` do perfil
   de emissão. Nenhum papel de participante da NF-e decide cliente.
2. O tomador resolvido é **gravado na emissão**, em
   `cte_issuance_payloads.taker_tax_id` / `taker_legal_name`. O perfil pode mudar
   depois; um CT-e já autorizado não troca de tomador junto com ele.
3. A resolução tem uma leitura só: `resolveCtePayloadTaker` em
   `cte-payload.builder.ts` usa o mesmo `resolveTakerParty` e a mesma nota de
   referência (`assertConsistentParties`) que constroem o payload. Contrato
   `cte-payload-receiver-ie.contract.ts` prova que o tomador resolvido é o mesmo
   que o payload declara.
4. O faturamento junta `cte_issuance_payloads` por `(company_id, attempt_id)` —
   `cte_fiscal_documents` já carrega `attempt_id` — pelo seam único
   `buildBillingTakerJoin()`, consumido por `findBillingPreviewByIds` e
   `queryEligibleCtes`. Filtros de nome e documento passam a bater no tomador.
5. O relatório da fatura (`invoice-report.query.ts`) **continua** lendo
   `recipient`: ali o destinatário é a coluna por linha de CT-e, que mostra para
   onde cada carga foi. O cliente do cabeçalho vem de
   `billing_invoices.customer_name` / `customer_document`, gravados na criação.
6. O `payload_sha256` continua sobre `payload` + `providerConfig`. O tomador é
   derivado deles, não entrada nova, e a idempotência da emissão não muda.

## Alternativas rejeitadas

- **Manter o papel cravado e trocar a constante por instalação.** Configuração
  paralela para uma pergunta que o perfil de emissão já responde — duas fontes
  da verdade com risco de divergirem, exatamente o que a ADR 0027 recusou ao
  descartar uma chave nova por empresa.
- **Ler o perfil de emissão no momento de faturar.** O perfil é mutável. Uma
  troca de política reescreveria o cliente de CT-e já autorizados, inclusive de
  faturas em aberto.
- **Derivar o tomador do `payload` jsonb na hora da consulta.** Funciona, mas
  põe a regra fiscal dentro do SQL do faturamento e paga o custo em toda
  listagem. Aqui o jsonb serve só ao backfill, uma vez.

## Consequências

- Instalações que cobram do remetente e instalações que cobram do destinatário
  passam a faturar certo com o mesmo código — muda o `taker` do perfil.
- CT-e autorizado sem linha em `cte_issuance_payloads` não aparece na listagem
  elegível. É o mesmo recorte de antes (o join do participante também era
  interno) e está explícito nos guardas `isNotNull` da consulta.
- **Faturas já criadas não mudam.** Elas guardam cliente em `customer_name` /
  `customer_document` e continuam como foram gravadas.
- O backfill cobre `tomador` `'0'` e `'3'`. Outros valores não existem:
  `resolveTakerParty` recusa `'1'` e `'2'` com `CTE_PAYLOAD_UNSUPPORTED_TAKER`.

## Segurança e rollback

O join carrega `company_id` além de `attempt_id`; nenhuma consulta passou a
alcançar dado de outra empresa. `companyId` continua vindo do contexto
autenticado. As duas colunas novas guardam razão social e CNPJ/CPF do tomador —
o mesmo dado que a fatura já imprime — e nenhum material sensível de certificado
entra ali.

Contratos que guardam a decisão:

- `test/cte-issuance-domain/cte-payload-receiver-ie.contract.ts` — o tomador
  segue o `taker` do perfil, concorda com o que o payload declara e recusa os
  mesmos valores não modelados.
- `test/cte-issuance-application/payload.contract.ts` — a emissão persiste o
  tomador ao lado do payload.
- `test/cte-issuance-schema/issuance.contract.ts` — as colunas existem e são
  anuláveis.
- `test/billing-schema/eligible-query-tenant-safety.contract.ts` — o join
  compila por `company_id` + `attempt_id` e nenhum filtro cita papel de nota.
- `test/integration/billing-repository.integration.ts` — a fixture dá ao tomador
  um documento que **nenhum** participante da nota tem; voltar a agrupar por
  papel muda o valor e o teste fica vermelho.

Rollback é `drizzle/20260809134710_cte_issuance_payload_taker/rollback.sql` mais
reverter o commit. Nada se perde: as colunas são derivadas do `payload` jsonb da
própria emissão, que fica intacto, e reaplicar a migration as reconstrói.
