# Tasks

> 🤖 Modelo da fase: `sonnet`. T101 é 🧠 — validar com `opus`.

A feature tem **duas metades que entregam em separado**, e isso é de propósito: a metade da NFS-e
corrige um bloqueio que já está barrando emissão hoje, e ela **não depende de nenhuma das
`[NEEDS CLARIFICATION]`** — todas as três são do lado do CT-e. Amarrar as duas faria a correção
esperar por uma decisão fiscal que não a afeta.

## Fase A — A NFS-e para de perguntar o peso (destrava o caso 883663/2)

> Sem dúvida aberta. Pode começar.

- [x] T001 [P] Contrato de elegibilidade de NFS-e sem peso, com fixture da 883663/2
      (`pesoB` 0.000, `qVol` 20) — `apps/api-transportada/test/nfse/eligibility-without-weight.contract.ts` + `test/fixtures/` — evidência: teste vermelho pelo motivo certo
- [x] T002 Extrair `checkSharedEligibility` (autorizada, completa, valor, participantes,
      municípios) mantendo o peso só no CT-e —
      `cte-batches/domain/cte-batch-eligibility.policy.ts` — evidência: `bun run typecheck`
- [x] T003 `nfse-selection.policy.ts:107` passa a chamar o gate compartilhado e
      `NfseSelectionBlockReason` deixa de admitir o motivo de peso —
      `nfse-invoices/domain/nfse-selection.policy.ts` — evidência: T001 verde
- [x] T004 A query de seleção de NFS-e para de carregar peso, que ela nunca usou —
      `nfse-invoices/infrastructure/nfse-invoice-selection.query.ts:158` — evidência: uma consulta
      a menos por página, contratos verdes
- [x] T005 [P] O rótulo de peso sai da tela de NFS-e e **continua** na de CT-e —
      `frontend-transportada/src/modules/nfse-invoice/locales/` — evidência: chave viva no
      `nfeWorkspace.locale.json`, morta no de NFS-e
- [x] T006 `make check` e `evidence.md` da fase A — evidência: gate verde + a 883663/2 emitindo

## Fase B — O peso padrão da empresa estima o que o emitente não declarou

> Decisão de 2026-08-31: o CT-e emite com peso estimado.
> **A origem do peso não vira coluna.** Ela é derivável: `nfe_volumes` é imutável e o XML é
> preservado, então payload com peso e volume zerado na origem é peso estimado, sempre. Gravar de
> novo o que já dá para deduzir custava migration no payload congelado por nada.

- [x] T101 [P] Contrato do gate: bloqueia sem XML e sem padrão, passa com padrão, XML vence
      padrão, `qVol` zero segue bloqueado — `test/cte-batch/weight-gate.contract.ts` —
      evidência: teste vermelho
- [x] T102 Migration de uma coluna: `companies.default_volume_weight numeric` (nula = estimativa
      desligada, CHECK > 0) + `rollback.sql` — evidência: `make migration-test`
- [x] T103 Resolução pura do peso efetivo: XML → `qVol` × padrão → ausência —
      `nfe-documents/domain/` — evidência: unitário das combinações
- [x] T104 Elegibilidade e payload leem o peso efetivo, com o padrão resolvido **uma vez por
      empresa** antes do `map` — `drizzle-nfe-document.repository.ts:282`,
      `cte-batch-selection.query.ts`, `cte-issuance-payload.query.ts:412` — evidência: T101 verde
- [x] T105 Campo do peso padrão no painel de configuração já existente + marca de peso estimado
      na prévia do lote (uma superfície, a que antecede a emissão) —
      `frontend-transportada/` — evidência: contrato + `locale-accents.contract.ts`
- [x] T106 ADR curta `docs/adr/0052-o-peso-que-o-emitente-nao-declarou.md` registrando a decisão e
      o risco fiscal, e `CLAUDE.md` atualizado — evidência: diff revisado
- [x] T107 `make check` e `evidence.md` — evidência: gate verde

**Decidido junto, para não virar task:** o peso estimado **não** entra no frete por faixa de peso
(a transportadora não cobra por número que ela mesma estimou), e instalação nova nasce **sem**
padrão. Instalação nova sem padrão é o comportamento de hoje, bloqueio incluso.

`[P]` significa que a tarefa pode executar em paralelo sem editar os mesmos
arquivos. Marque como concluída apenas após registrar evidência.
