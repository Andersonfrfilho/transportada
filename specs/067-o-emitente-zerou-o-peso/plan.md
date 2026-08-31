# Plano técnico

> 🤖 Modelo: `sonnet` (T001 e T002 são 🧠 — a separação da policy e o desenho da tabela mudam
> regra fiscal; validar com `opus` antes de escrever)

## Contexto e premissas

- O gate de peso é uma função só, compartilhada por decisão registrada em
  `nfse-selection.policy.ts:22`. A decisão está certa para os motivos que os dois documentos
  compartilham e errada para o peso, que só um deles usa. A separação é cirúrgica: o comentário
  daquele arquivo continua válido depois dela.
- `composeCargoQuantities` já **omite** o peso quando ele é zero (`cte-cargo.service.ts:89`) — o
  payload não quebra hoje, ele sai sem massa. Quem impede a emissão é a elegibilidade, não o
  builder. Isso é o que torna a segunda dúvida da spec uma escolha real, e não teoria.
- `buildMagnitudeResolver` cai no peso do volume quando os produtos não declaram peso
  (`cte-cargo.service.ts:138`). Com peso declarado pela transportadora, essa queda passa a ter um
  valor útil no fim — vale conferir se o resolvedor deve enxergar a declaração ou seguir só o XML.
- Nada aqui toca no XML preservado, no `payload_sha256` nem em documento já transmitido.

## Arquitetura e arquivos afetados

**API — domínio**

- `cte-batches/domain/cte-batch-eligibility.policy.ts` — extrai `checkSharedEligibility` (autorizada,
  completa, valor, participantes, municípios) e mantém `checkDocumentEligibility` como
  `compartilhado + peso`. O motivo `missingWeight` continua no catálogo do CT-e.
- `nfse-invoices/domain/nfse-selection.policy.ts:107` — passa a chamar `checkSharedEligibility`.
  `NfseSelectionBlockReason` estreita: o union deixa de admitir o motivo de peso.
- `nfe-documents/domain/` — nasce a resolução do peso efetivo (RF04), pura: recebe soma de volumes
  e declaração, devolve o peso e a **origem** (`xml` | `declared`). A origem é o que a tela imprime.

**API — dados e leitura**

- Peso padrão **por empresa** (`default_volume_weight numeric`, kg por volume, CHECK > 0,
  nulo = estimativa desligada), ao lado dos demais ajustes de empresa. Não é tabela por nota: o
  padrão é configuração, e o valor aplicado a cada nota é derivado (`qVol × padrão`), nunca
  persistido por linha — persistir por nota criaria duas verdades quando o padrão mudasse.
- `nfe-documents/infrastructure/drizzle-nfe-document.repository.ts:282` — `loadBlockContext` ganha
  a última declaração por documento na mesma leva de `Promise.all` que já carrega os pesos de volume.
  Uma consulta a mais por página, nunca por linha.
- `cte-batches/infrastructure/cte-batch-selection.query.ts:237` e
  `nfse-invoices/infrastructure/nfse-invoice-selection.query.ts:158` — a de CT-e passa a devolver o
  peso efetivo; a de NFS-e **para de carregar peso**, que ela nunca usou.

**API — escrita**

- `companies/presentation/` — rota de configuração do peso padrão (`settings.manage`).
- `companies/application/` — use case com trilha de auditoria: mudar o padrão muda o peso que vai
  para a SEFAZ nas notas seguintes.

**Emissão**

- `cte-issuance/infrastructure/cte-issuance-payload.query.ts:412` — o volume lido para o payload
  passa pelo peso efetivo, e a **origem** (`xml` | `estimated`) entra no payload congelado. Sem
  isso, auditoria futura não consegue distinguir peso lido de peso estimado num CT-e já transmitido.

**Frontend**

- `nfe-workspace` — ação de menu "Informar peso" na linha bloqueada, diálogo com um campo, e a
  marca de peso declarado na coluna. Rótulos no `nfeWorkspace.locale.json` (acentuado — o contrato
  de acentos varre por glob).
- Invalidação pelo efeito de `mutationInvalidation.service.ts`: declarar peso muda a elegibilidade
  da nota nas duas telas de seleção, então é efeito, não lista de chaves à mão.

## Contratos/API/eventos

- `POST /nfe-documents/:documentId/declared-weights` — corpo `{ grossWeight: string }`, resposta
  `201` com a declaração. Escopo `company`. Permissão pendente da terceira dúvida da spec.
- `GET /nfe-documents` — cada linha ganha `grossWeight` com origem (`xml` | `declared`), sem
  quebrar quem já lê o campo.
- Nenhum evento novo, nenhuma fila nova.

## Dados, migration e rollback

- Migration `NNNNNNNNNNNNNN_nfe_declared_weight` criando a tabela. **Aditiva**: nada é alterado nem
  removido, e `rollback.sql` derruba só a tabela nova.
- Sem backfill: nota sem declaração é nota sem declaração, e é isso que o peso do XML já diz.

## Segurança e tenant

- `company_id` do contexto autenticado, nunca do corpo. FK composta com o documento, para não
  aceitar declarar peso de nota de outra empresa por id.
- Peso não é PII e entra em log normalmente; o autor entra por membership id, nunca por nome.
- Contrato negativo de isolamento obrigatório para a tabela nova.

## Idempotência e concorrência

- A configuração é um `PUT` idempotente por empresa; não há corrida a resolver.
- O peso estimado é **derivado na leitura**, então mudar o padrão muda a estimativa das notas ainda
  não emitidas — e não muda nada do que já congelou em payload. É essa assimetria que torna o
  congelamento da origem (T107) obrigatório e não cosmético.

## Observabilidade

- Log de nível `info` na declaração, com `documentId`, `companyId` e o par de pesos.
- A trilha de auditoria (§10 de `security.md`) recebe ator, alvo, valor anterior e novo.

## Estratégia de testes

- **Contrato antes da implementação**, com o caso real 883663/2 como fixture: XML com
  `pesoB` zero e `qVol` 20.
- `test/nfse/eligibility-without-weight.contract.ts` — a nota é elegível para NFS-e.
- `test/cte-batch/weight-gate.contract.ts` — a mesma nota segue bloqueada para CT-e sem declaração,
  e passa com ela.
- `test/cte-issuance/declared-weight-payload.contract.ts` — o `infQ` de peso bruto sai com o
  declarado.
- `test/nfe-schema/tenant-safety.contract.ts` — isolamento da tabela nova.
- Integração ponta a ponta: nota sem peso → declaração → lote → payload → DACTE.
- ⚠️ Todo arquivo novo entra **explicitamente** na lista do `package.json` da app, senão não roda.

## Riscos

- **⚠️ O maior risco desta feature não é técnico.** O `infQ` transmitido passa a poder conter peso
  estimado pela própria transportadora. Divergência grande contra a carga real é exposição fiscal
  dela, e nenhum teste pega isso — só a configuração sensata do padrão. As mitigações (padrão por
  empresa, origem congelada, marca antes da emissão) reduzem a chance de ninguém perceber; não
  eliminam a exposição. Está registrado assim na ADR de propósito.
- **Peso estimado alimentando frete por faixa de peso** (T108) faz a transportadora cobrar por um
  número que ela mesma estimou. Decidir antes de implementar.
- **Estreitar `NfseSelectionBlockReason`** é mudança de tipo público entre camadas; o frontend tem
  a chave de tradução do motivo de peso no `nfeWorkspace.locale.json` e ela continua existindo para
  o CT-e — remover a chave junto seria apagar o rótulo que ainda é usado.
