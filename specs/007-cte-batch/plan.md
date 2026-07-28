# Plano técnico — Lotes e emissão de CT-e

## Contexto e evidência de entrada

- O projeto possui autenticação OAuth2/JWT, tenant + RBAC e isolamento por empresa.
- A base de cálculos de frete já oferece snapshots imutáveis por NF-e.
- A stack de CT-e atual ainda não implementa ciclo completo de lote/estado.

Vamos adicionar uma feature autocontida para lote com:

- criação/edição de lote com validação de elegibilidade;
- submissão idempotente;
- máquina de estados auditável;
- consulta de status com anti-enumeração;
- trilha mínima para integração futura com gateway CT-e.

## Arquitetura proposta

Separação por bounded context:

- `apps/api-transportada/src/cte-batches/`
  - `domain/`
  - `application/`
  - `infrastructure/`
  - `presentation/`
- `apps/frontend-transportada/src/modules/cte-batch/`
- Banco:
  - novas tabelas para `cte_batches`, `cte_batch_items`, `cte_batch_events` e
    `cte_submission_records` para controle de idempotência e replay seguro.

Regra de controle:

- `cte_batches` guarda metadados do lote e estado corrente.
- `cte_batch_items` associa NF-e por empresa com snapshot de cálculo.
- `cte_batch_events` registra transições (sem sobrescrever estado histórico).
- `cte_submission_records` registra idempotência de submissão por tenant + key.

## Modelo de dados (alto nível)

- Uma empresa só enxerga lotes do seu tenant.
- Cada lote tem um proprietário e data de revisão.
- Itens inválidos não entram no lote.
- Emissão é um fluxo assíncrono com estado explícito e transições finitas.

Estados mínimos:

- `DRAFT`
- `SUBMITTED`
- `IN_FLIGHT`
- `DONE`
- `ERROR`
- `CANCELLED`

Regras de transição:

- `SUBMIT` só parte de `DRAFT`.
- `CANCEL` permitido em `DRAFT` e `SUBMITTED`.
- `ERROR` nasce de falha de gateway/mock/fila durante `IN_FLIGHT`.
- `DONE` nasce apenas de evento de retorno final.

## API inicial

- `POST /cte-batches`
- `GET /cte-batches`
- `GET /cte-batches/:id`
- `PATCH /cte-batches/:id`
- `POST /cte-batches/:id/submit`
- `POST /cte-batches/:id/cancel`
- `GET /cte-batches/:id/events`

Diretrizes:

- RBAC de autorização antes do parser de body.
- `companyId` nunca vindo de cliente.
- `Cache-Control: no-store`.
- IDs inexistentes e cross-tenant retornam resposta segura equivalente.
- Erros estruturados com código interno estável, sem expor XML fiscal.

## Segurança e observabilidade

- Derivar `companyId` do contexto autenticado e membership.
- Auditoria registra ator, lote, estado anterior/novo e correlation id.
- Logs sem XML, sem chaves e sem PFX.
- Métricas de submissão por estado e motivo de erro.

## Estratégia de implementação

1. Contratos de schema e migration (Opus (alto))
2. Contratos de domínio de lote e estado (Opus (alto))
3. Implementação de repositório e use-cases (Opus (alto))
4. Contratos de HTTP e implementação de rotas (Sonnet + revisão Opus)
5. Contratos frontend e implementação de UI (Sonnet)
6. Smoke responsivo Playwright (Sonnet + revisão Opus)
7. Integração de `make check` final da feature

## Riscos e dependências

- Dependência de gateway real de CT-e deve ser introduzida com estratégia de
  adapter para não bloquear o ciclo de lote.
- Sem confirmação de homologação no início, a submissão pode operar em modo mock
  e não emitir protocolo real.
- Mudanças futuras de schema da resposta da SEFAZ exigirão versão de contrato.
