# ADR 0011 — NF-e não assinada em `nfe_documents` (expand)

- Status: proposto
- Data: 2026-07-24
- Decisores: mantenedor do projeto e revisão Opus

## Contexto

O consumer de importação de NF-e (`createNfeImportConsumer`) normaliza cada XML
com `@adatechnology/fiscal-provider` (`importarNfeXml`). O resultado é uma união
de três variantes:

- `authorized-nfe` — documento autorizado, `status: 'authorized'`, com protocolo
  de autorização;
- `unsigned-nfe` — documento **sem assinatura/protocolo**, `status: 'unsigned'`,
  **sem** protocolo;
- `nfe-event` — evento (cancelamento, CCe, etc.).

O contract aceito (`test/nfe-import-consumer/mixed-batch.contract.ts`) trata a
variante `unsigned-nfe` como `imported` — ela chama `store-document` como um
documento completo. Porém o schema atual de `nfe_documents` não a acomoda:

- a coluna `status` tem CHECK `nfe_documents_status_check` restrito a
  `('authorized','cancelled','denied')`;
- `authorization_protocol` é `NOT NULL`.

Sem ajuste, persistir uma NF-e não assinada viola o CHECK e a constraint de
NOT NULL, e o item de importação nunca sai de `queued`/`pending` — que é o
sintoma real (lotes presos em `0/N`).

Descartar silenciosamente NF-e não assinada perderia evidência fiscal legítima
que existe em ambientes de homologação e em documentos ainda não protocolados.
Criar uma tabela separada duplicaria o modelo de documento inteiro (participantes,
endereços, volumes, produtos) sem ganho.

## Decisão

Expandir `nfe_documents` para acomodar a variante não assinada, de forma
aditiva (expand, sem contract nesta etapa):

1. Adicionar `'unsigned'` ao domínio permitido de `status` — alterar o CHECK
   `nfe_documents_status_check` para
   `status in ('authorized','cancelled','denied','unsigned')`.
2. Tornar `authorization_protocol` **nullable** (`DROP NOT NULL`) — uma NF-e não
   assinada não tem protocolo; documentos autorizados continuam preenchendo o
   campo.
3. Migration Drizzle versionada na API (`apps/api-transportada/drizzle/`),
   gerada por `bun run db:generate`, com rollback manual ao lado, validada por
   `make migration-test`.
4. Refletir a mesma mudança na **cópia por valor** do schema no worker
   (`apps/worker-transportada/src/database/nfe.schema.ts`): tipo
   `NfeDocumentStatus` ganha `'unsigned'` e `authorizationProtocol` deixa de ser
   `.notNull()`. Migrations continuam rodando somente na API.

Nenhuma regra de negócio nova é adicionada: o `status` reflete fielmente a saída
do fiscal-provider; a aplicação não infere protocolo ausente.

## Alternativas descartadas

- **Tabela separada para NF-e não assinada** — duplica todo o modelo relacional
  do documento; rejeitada por custo sem benefício.
- **Coagir `unsigned` para `authorized` com protocolo sintético** — falsifica
  evidência fiscal; proibido pelas regras de preservação fiscal.
- **Descartar a variante no consumer** — perde documento legítimo e mantém o
  item preso; contraria o comportamento aceito no contract.

## Consequências

- Consumidores de `nfe_documents.status` (frontend, faturamento, emissão de
  CT-e) passam a poder observar `'unsigned'`; onde o status hoje é assumido
  autorizado, revisar o tratamento antes de habilitar uso fiscal do documento.
- `authorization_protocol` nulo passa a ser um estado válido — código que lê o
  protocolo deve tratar ausência.
- Expand é reversível apenas enquanto não houver linha `unsigned` ou protocolo
  nulo persistido; depois disso, correção é roll-forward (ver Rollback).

## Rollback

Antes de existir qualquer documento `unsigned` ou com protocolo nulo: reverter a
migration (restaurar CHECK sem `'unsigned'` e `authorization_protocol NOT NULL`)
e reverter a cópia do worker. Depois de existirem dados nesse estado, não
reverter destrutivamente: manter o domínio expandido e corrigir por
roll-forward.

## Testes

- persistir NF-e `unsigned-nfe` grava `status = 'unsigned'` e
  `authorization_protocol` nulo sem violar constraint;
- persistir NF-e `authorized-nfe` continua exigindo protocolo preenchido;
- `make migration-test` aplica e reverte a migration em Postgres descartável;
- cópia do worker permanece em `typecheck` verde e alinhada ao schema da API.
