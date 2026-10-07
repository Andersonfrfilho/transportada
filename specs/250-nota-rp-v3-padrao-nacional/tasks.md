# Tasks

> Pré-condição: **há `[NEEDS CLARIFICATION]` aberto em `spec.md`** — a Fase 0 (T0.3) os fecha com o
> usuário; sem isso o prompt de execução não vale. Produção só por PR com aprovação humana.

Uma task por vez. Contrato vermelho antes da implementação. Cada task fecha com typecheck + teste +
commit isolado e evidência em `evidence.md`. Migration pede `make migration-test` e `rollback.sql`.
Teste novo entra na lista explícita do `package.json` da app.

## Fase 0 — Conferência e perguntas

> 🤖 Modelo: `haiku` (T0.3 é decisão do usuário)

- [ ] **T0.1** Conferir contra `origin/staging`: existe cliente Nota RP no `cron-transportada`? Listar
      todos os pontos que falam com `notarp.com.br` (worker emissão, worker status pull, cron).
      Aceite: lista em `evidence.md`.
- [ ] **T0.2** Contar notas `pending_authorization`/`issuing` com `id_nota` da v2 em produção
      (leitura, via aprovação do usuário). Aceite: número em `evidence.md`; se > 0, decidir drenar
      antes da virada.
- [ ] **T0.3** Fechar os três `[NEEDS CLARIFICATION]` de `spec.md` com o usuário/suporte da Nota RP.
- [ ] **T0.4** Ler o `swagger.yaml` e a coleção Postman da v3 e guardar o recorte usado em
      `docs/ai-context/worker-transportada.md` (a referência não vive só na conversa).

## Fase 1 — Decisão

> 🤖 Modelo: `opus` (T1.1 🧠 — validar com `architect`)

- [ ] **T1.1** 🧠 ADR **0098** "A NFS-e fala a Nota RP v3": seleção por env, `cTribNac` em coluna,
      `hash_pedido`, vínculo de nota manual. Emenda a 0029 e a 0035. Aceite: ADR no `docs/adr/` com
      numeração conferida em `origin/staging`.

## Fase 2 — API e banco

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Contratos vermelhos: perfil aceita/rejeita `nationalTaxationCode`; payload congelado o
      leva; sem ele a criação para a v3 dá `409 NFSE_NATIONAL_TAXATION_CODE_MISSING`.
- [ ] **T2.2** Migration `nfse_emission_profiles.national_taxation_code` (nullable, check `^\d{6}$`) + `rollback.sql` + snapshot + schema Drizzle. `make migration-test` verde.
- [ ] **T2.3** Perfil (mapper, schema Zod, rotas), `freezeNfseIssuancePayload` e `FrozenPayloadShape`
      com o campo; erro de bloqueio nomeado (spec 044).
- [ ] **T2.4** Reemissão: `correction.nationalTaxationCode` na API e na política de correção.
- [ ] **T2.5** Conferir `bun --env-file=../../.env.test run test:integration` nos arquivos tocados.

## Fase 3 — Worker (e cron, se houver)

> 🤖 Modelo: `sonnet` (T3.1 🧠 `opus`: a classificação de erros v3 herda o contrato de status da v2)

- [ ] **T3.1** 🧠 Contratos vermelhos do `nota-rp-v3.client` a partir das respostas do swagger
      (fixtures): emitir 200/409/422/403/429, listar por status, cancelar, pdf/xml.
- [ ] **T3.2** `nota-rp-v3.client.ts` (cabeçalhos token+CNPJ+IM, throttle 1 req/s, mapeamento da
      tabela do plan, saneamento de mensagem).
- [ ] **T3.3** Gateway e status pull escolhem v2/v3 por `NFSE_PROVIDER_API_VERSION` (env schema do
      worker e do cron; `.env.example`; `.railway/railway.ts` — variável sem segredo).
- [ ] **T3.4** Cancelamento por nome de motivo; PDF/XML. Teste de contrato.
- [ ] **T3.5** Registrar os arquivos novos no `package.json` de `test` do worker.

## Fase 4 — Painel

> 🤖 Modelo: `sonnet`

- [ ] **T4.1** Campo "Código de tributação nacional" na aba Configurações do perfil (pt-BR e en,
      validação de 6 dígitos), com ajuda do par `cTribNac`+`cTribMun`.
- [ ] **T4.2** Campo corrigível no diálogo de reemissão (individual e em lote).
- [ ] **T4.3** Revisão de design e usabilidade (print, web.md §15), conferida ao lado do estado atual.

## Fase 5 — Nota emitida fora do sistema

> 🤖 Modelo: `sonnet` (T5.1 🧠 `opus`: muda o estado fiscal de uma nota)

- [ ] **T5.1** 🧠 Decidir e desenhar "vincular nota emitida externamente": número, data, chave de
      acesso → nota vai a `authorized` sem transmitir; auditoria com ator. Dependência da 042/T017 e
      043/T010 (as 16 notas de Ribeirão Preto).
- [ ] **T5.2** Implementar API + painel do vínculo, com contrato negativo (só nota rejeitada/falha).

## Fase 6 — Virada e fechamento

> 🤖 Modelo: `sonnet` (T6.2 exige aprovação humana)

- [ ] **T6.1** `make check` + `make migration-test` + `make worker-integration`; staging com `v2`.
- [ ] **T6.2** Virada em produção: `NFSE_PROVIDER_API_VERSION=v3`, perfil com `cTribNac 160201` e
      `cTribMun 160101`, uma nota de **valor mínimo** real, conferida no portal. Aprovação humana.
- [ ] **T6.3** Atualizar `docs/ai-context/worker-transportada.md`, `cron-transportada.md`,
      `CLAUDE.md` raiz; fechar 032/T030 com a evidência da primeira emissão real.

## Prompt de execução

Spec com `[NEEDS CLARIFICATION]` aberto não ganha prompt de execução. Perguntas pendentes:

1. Alíquota de `tributos_aproximados` (mín. 4,50% × 2,00% da nota 74).
2. ISS retido ou não no perfil.
3. `cTribMun` do perfil: `160107` ou `160101`.

Fechadas as três, este arquivo recebe o prompt de autopilot (modelos por fase acima).
