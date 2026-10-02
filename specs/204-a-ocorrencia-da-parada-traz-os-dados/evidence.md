# Evidência — Feature 204

Uma entrada por task, na ordem do `tasks.md`. Cada entrada traz o comando rodado, a contagem de testes
(antes → depois), o commit e o que foi conferido. Relatório de agente não é evidência: vale a saída do
comando e o `git log`.

## Escrita da spec (2026-09-25)

- Números conferidos com `git fetch && git log --all -- 'specs/203*' 'specs/204*'`, `ls specs/`,
  `ls docs/adr` e os worktrees de `git worktree list`. Nenhum 203/204 e nenhuma ADR acima da 0084.
  A 203 e a ADR-0085 ficam reservadas para a sessão do "o attach nunca descarta".
- Specs lidas antes de escrever: 057, 060, 082 (as duas), 157, 164, 166, 167, 172, 173, 179 (com
  `duplicacao.md`), 182, e as não commitadas 192, 193, 195, 196, 197 e 198 no que tocam esta.
- ADRs lidas: 0045 §5–§6, 0057 (a do endereço errado), 0067, 0070.
- Nenhum código foi escrito nesta etapa.
- Revisão no mesmo dia, depois da crítica (7 MAJOR) e das respostas do usuário: lista de taxas como
  etapa `charge` de `company_occurrence_types`, recibo sempre obrigatório, taxa confirmada como custo
  pela parcela `delivery_charges`, chaves novas de aviso, dedupe pela ocorrência, `occurredAt` do
  toque, FK `SET NULL (stop_occurrence_id)` e dependência da spec 209.
- Postgres conferido: a imagem do `compose.yaml` é 17.10 (`PG_VERSION` da imagem pelo digest), e o
  servidor de produção é `postgres-ssl:18` (`docs/ops/backup-emergencia.md:29`).

## Fase 0

### T0.1

- Pré-requisitos em `origin/staging` (tabela do `plan.md`, com a 209): _a preencher_
- O renderizador de aviso troca placeholder ausente por "", ou quebra? _a preencher_
- Algum contrato de paridade do worker exige as chaves novas? _a preencher_
- A página pública do lote lê o recibo da ocorrência? _a preencher_
- Confirmar taxa em viagem `completed` gera nova versão da valoração (ADR-0049 §5)? _a preencher_

## Fase 1

### T1.1

### T1.2

### T1.3

## Fase 2

### T2.1

### T2.2

### T2.3

## Fase 3

### T3.1

### T3.2

### T3.3

### T3.4

### T3.5

### T3.6

### T3.7

## Fase 4

### T4.0

### T4.1

### T4.2

### T4.3

### T4.4

### T4.5

### T4.6

### T4.7

## Fase 5

### T5.1

### T5.2

### T5.3

## Fase 6

### T6.1 — preview e "pode subir"

### T6.2 — revisão de design

### T6.3

### T6.4
