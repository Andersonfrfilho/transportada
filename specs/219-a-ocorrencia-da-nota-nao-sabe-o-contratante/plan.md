# Plano técnico

## Contexto e premissas

Continuação direta da spec 218: o backend já resolve `attachmentMode` em 3 camadas
(`listFieldOccurrenceTypes`, `resolveOccurrenceAttachmentModeForRecipient`) e a rota
`GET /me/trips/current/occurrence-types` já aceita `contractorId`/`recipientTaxId` (T9). O único
elo que falta é o snapshot expor esses dois campos por documento, e o app usá-los.

Branch de trabalho parte de `claude/fervent-sutherland-937527` (onde a 218 foi implementada e
fechada), num worktree próprio (`218-snapshot-occurrence-overrides`) — a reconciliação dessa
branch com `origin/staging` é assunto separado (fora do escopo desta spec).

## Arquitetura e arquivos afetados

Backend (`apps/api-transportada`):

- `src/trips/application/find-current-driver-trip.use-case.ts` — tipo `DriverTripDocument`.
- `src/trips/infrastructure/drizzle-current-driver-trip.repository.ts` — `toDriverDocument`
  (a consulta SQL não muda: `contractors.id`/`nfeParticipants.taxId` já estão selecionados).
- `test/integration/me-trip.integration.ts` — estende o teste "o override de contratante muda o
  comprovante efetivo..." (spec 218) com as novas asserções.

Frontend (`apps/frontend-driver`):

- `src/modules/driver-trip/shared/driverTrip.types.ts` — `DriverTripDocument`.
- `src/modules/driver-trip/shared/driverTripClient.service.ts` — `listOccurrenceTypes`.
- `src/modules/driver-trip/hooks/useOccurrenceRegistrationForm.hook.ts` — busca por nota + overlay.
- `src/modules/driver-trip/shared/occurrenceRegistration.service.ts` — função pura de mescla,
  testável sem React.
- `test/driver-trip/occurrence-registration.contract.ts` — client (query string).
- `test/driver-trip/occurrence-registration-wiring.contract.ts` — hook chama o client com os
  campos do documento; a mescla é a função pura importada, não reescrita.

`apps/frontend-transportada` (legado `/minha-viagem`) **não muda** — a Fase 5 da 218 já dispensou
réplica no painel antigo por decisão do usuário; mesma decisão vale aqui.

## Contratos/API/eventos

Nenhuma rota nova. `GET /me/trips/current` ganha dois campos por documento (aditivo, nunca quebra
consumidor antigo). `GET /me/trips/current/occurrence-types` não muda de contrato — só passa a
receber os parâmetros que já aceitava sem uso.

## Dados, migration e rollback

Nenhuma. Os dois campos vêm de colunas já lidas pela consulta existente.

## Segurança e tenant

Nenhuma consulta nova — mesma junção com `company_id` que a spec 218 já auditou.
`contractorId`/`recipientTaxId` seguem a mesma regra de PII de `taxId` (nunca em log) — o app já
não loga o documento inteiro.

## Idempotência e concorrência

N/A — leitura pura, sem efeito colateral.

## Observabilidade

Nenhuma métrica nova. A falha da busca por nota é silenciosa por design (RF4/P4) — não é erro que
mereça log: é o caminho "sem override para refinar" tratado como "sem exceção".

## Estratégia de testes

TDD, contrato antes:

1. Backend: estende o teste de integração da 218 com asserções em `contractorId`/`recipientTaxId`
   nos dois documentos já usados naquele cenário — visto falhar (campos `undefined`), depois passa.
2. Frontend cliente: novo teste prova a query string com os dois parâmetros, e sem eles quando
   ausentes — visto falhar (assinatura não aceita parâmetro), depois passa.
3. Frontend função pura de mescla (`occurrenceRegistration.service.ts`): tabela de casos (com
   overlay, sem overlay, tipo ausente na resposta por nota) — TDD direto, sem React.
4. Frontend wiring: contrato de texto-fonte provando que o hook chama o client com
   `document.contractorId`/`document.recipientTaxId` e usa a função pura de mescla (não reimplementa
   a lógica inline) — mesmo estilo de `occurrence-registration-wiring.contract.ts` já existente.

Gates: `bun run check` (lint + typecheck + testes + build) nas duas apps; `bun run test:integration`
da API (o contrato estendido é de integração, precisa de Postgres).

## Riscos

- Nota com `contractorId` mas cujo tipo de ocorrência não existe mais na resposta por nota (catálogo
  mudou entre as duas chamadas): mitigado por RF4 (mantém o geral para esse tipo, nunca remove).
- Chamada extra por nota poderia parecer N+1 se a página abrisse muitos formulários ao mesmo tempo —
  não abre: o formulário é um diálogo por nota, um de cada vez (mesmo padrão de hoje).
