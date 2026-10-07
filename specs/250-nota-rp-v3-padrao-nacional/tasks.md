# Tasks

> Pré-condição: nenhum `[NEEDS CLARIFICATION]` aberto (fechados na T0.3, 07/10/2026).
> Produção só por PR com aprovação humana.

Uma task por vez. Contrato vermelho antes da implementação. Cada task fecha com typecheck + teste +
commit isolado e evidência em `evidence.md`. Migration pede `make migration-test` e `rollback.sql`.
Teste novo entra na lista explícita do `package.json` da app.

## Fase 0 — Conferência e perguntas

> 🤖 Modelo: `haiku` (T0.3 é decisão do usuário)

- [x] **T0.1** Conferir contra `origin/staging`: existe cliente Nota RP no `cron-transportada`? Listar
      todos os pontos que falam com `notarp.com.br` (worker emissão, worker status pull, cron).
      Aceite: lista em `evidence.md`.
- [ ] **T0.2** (adiada para antes da T6.2; precisa de aprovação) Contar notas `pending_authorization`/`issuing` com `id_nota` da v2 em produção
      (leitura, via aprovação do usuário). Aceite: número em `evidence.md`; se > 0, decidir drenar
      antes da virada.
- [x] **T0.3** Fechar os três `[NEEDS CLARIFICATION]` de `spec.md` com o usuário/suporte da Nota RP.
      Fechados em 07/10/2026 (2,00% · não retido · 160101).
- [x] **T0.4** Ler o `swagger.yaml` e a coleção Postman da v3 e guardar o recorte usado em
      `docs/ai-context/worker-transportada.md` (a referência não vive só na conversa).

## Fase 1 — Decisão

> 🤖 Modelo: `opus` (T1.1 🧠 — validar com `architect`)

- [x] **T1.1** 🧠 ADR **0098** "A NFS-e fala a Nota RP v3": versão por tentativa, `cTribNac` e alíquota
      SN em coluna, chave de provedor persistida, `not_found`→adiamento, limitador por processo.
      Revisão `architect`/Opus em 07/10/2026: aprovado com ajustes, todos incorporados.

## Fase 2 — API e banco

> 🤖 Modelo: `sonnet`

- [x] **T2.1** Contratos vermelhos: perfil aceita/rejeita `nationalTaxationCode` e
      `simplesNationalRate`; payload congelado leva os dois; sem eles, com `NFSE_PROVIDER_API_VERSION=v3`
      na **API**, a criação dá `409 NFSE_NATIONAL_TAXATION_CODE_MISSING`; `providerConfig` grava
      `providerApiVersion`.
- [x] **T2.2** Migration `nfse_emission_profiles.national_taxation_code` (nullable, check `^\d{6}$`) + `rollback.sql` + snapshot + schema Drizzle. `make migration-test` verde.
      Escopo real: também `simples_national_rate` (perfil) e `nfse_issuance_attempts.provider_request_key` (ADR 0098).
- [x] **T2.3** Perfil (mapper, schema Zod, rotas), `freezeNfseIssuancePayload` e `FrozenPayloadShape`
      com os dois campos; `NFSE_PROVIDER_API_VERSION` no schema de env da API e em `providerConfig`;
      erro de bloqueio nomeado (spec 044).
- [x] **T2.4** Reemissão: `correction.nationalTaxationCode` e `correction.simplesNationalRate` na API e
      na política de correção; **reuso de `provider_request_key`** quando a tentativa anterior terminou
      ambígua (sem `providerDocumentId` e com causa de transporte).
- [x] **T2.5** Conferir `bun --env-file=../../.env.test run test:integration` nos arquivos tocados.

## Fase 3 — Worker (e cron, se houver)

> 🤖 Modelo: `sonnet` (T3.1 🧠 `opus`: a classificação de erros v3 herda o contrato de status da v2)

- [x] **T3.1** 🧠 Contratos vermelhos do `nota-rp-v3.client` a partir das respostas do swagger
      (fixtures): emitir 200/409/422/403/429, listar por status, cancelar, pdf/xml.
- [x] **T3.2** (cliente + limitador; porta e credencial seguem na T3.3) Porta: `issue` recebe a chave do provedor e `id_nota` opcional; `NfseCredentialAccess`
      ganha `taxId` (os dois repositórios do worker o carregam). `nota-rp-v3.client.ts` (token+CNPJ+IM,
      origem + `/api/v3`, mapeamento do plan, saneamento, `Falha`→`NOTA_RP_FALHA`, `not_found`→`error`).
- [x] **T3.3** Gateways (emissão, status pull, cancelamento, documentos) roteiam pela
      `providerApiVersion` da tentativa; a variável vale só para emissões novas (env schema do worker
      e da API; `.env.example`; `.railway/railway.ts`). **Limitador único por processo** envolvendo o
      `fetch` do composition root, compartilhado pelos dois gateways; contrato com relógio injetado.
- [x] **T3.4** Cancelamento: `'2'`→`servico_nao_prestado`, `'4'`→`outros`+"Nota duplicada"; PDF/XML.
      Payload sem `nationalTaxationCode` na v3 → recusa fatal nomeada. Teste de contrato.
- [ ] **T3.5** Registrar os arquivos novos no `package.json` de `test` do worker.

## Fase 4 — Painel

> 🤖 Modelo: `sonnet`

- [ ] **T4.1** Campo "Código de tributação nacional" na aba Configurações do perfil (pt-BR e en,
      validação de 6 dígitos), com ajuda do par `cTribNac`+`cTribMun`.
- [ ] **T4.2** Campo corrigível no diálogo de reemissão (individual e em lote).
- [ ] **T4.3** Revisão de design e usabilidade (print, web.md §15), conferida ao lado do estado atual.

## Fase 5 — Nota emitida fora do sistema

> 🤖 Modelo: `sonnet` (T5.1 🧠 `opus`: muda o estado fiscal de uma nota)

- [ ] **T5.1** 🧠 Decidir e desenhar "vincular nota emitida externamente": **preferir vincular pelo
      `id_nota` da Nota RP** (o status pull traz número, chave, PDF e XML); digitar número/data/chave
      é a contingência. A nota vai a `authorized` sem transmitir; auditoria com ator. Dependência da 042/T017 e
      043/T010 (as 16 notas de Ribeirão Preto).
- [ ] **T5.2** Implementar API + painel do vínculo, com contrato negativo (só nota rejeitada/falha).

## Fase 6 — Virada e fechamento

> 🤖 Modelo: `sonnet` (T6.2 exige aprovação humana)

- [ ] **T6.1** `make check` + `make migration-test` + `make worker-integration`. Staging **não emite
      NFS-e** (ADR-0035): a prova fiscal é a T6.2.
- [ ] **T6.2** Virada em produção: `NFSE_PROVIDER_API_VERSION=v3`, perfil com `cTribNac 160201` e
      `cTribMun 160101`, uma nota de **valor mínimo** real, conferida no portal. Aprovação humana.
- [ ] **T6.3** Atualizar `docs/ai-context/worker-transportada.md`, `cron-transportada.md`,
      `CLAUDE.md` raiz; fechar 032/T030 com a evidência da primeira emissão real.

## Prompt de execução

> Os três `[NEEDS CLARIFICATION]` foram fechados na T0.3 (07/10/2026). O prompt abaixo **parava na T0.3 e perguntava** ao
> usuário antes de qualquer código; ele não decide alíquota, retenção nem `cTribMun` por conta própria.

```text
/oh-my-claudecode:autopilot Execute a spec specs/250-nota-rp-v3-padrao-nacional/ (leia spec.md,
plan.md, tasks.md e evidence.md antes de tocar em código). Uma task por vez, na ordem do tasks.md,
a partir de um worktree próprio (`make worktree NAME=spec-250`), nunca no checkout principal.
Modelos: Fase 0 → executor model=haiku · Fases 2, 3, 4, 5 e 6 → executor model=sonnet ·
T1.1 🧠, T3.1 🧠 e T5.1 🧠 → opus (validar com architect antes de implementar) ·
revisão final → code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
PORTÃO 1 (T0.3): antes de qualquer código, pergunte ao usuário (AskUserQuestion) os três
[NEEDS CLARIFICATION] de spec.md — alíquota de tributos_aproximados (mín. 4,50% × 2,00% da nota 74),
ISS retido ou não, cTribMun 160107 × 160101 — e grave as respostas em spec.md e evidence.md. Sem
resposta, pare.
Cada task fecha com typecheck + testes + commit isolado (git add com caminhos explícitos, --no-verify
por causa do hook que varre a árvore) e evidência em evidence.md. Migration (T2.2) pede
`make migration-test`, rollback.sql e snapshot; teste novo entra na lista do package.json da app;
`bun --env-file=../../.env.test run test:integration` para o que tocar test/integration.
Após rebase, `bun install --frozen-lockfile` antes do typecheck. Numeração de ADR/migration
conferida em origin/staging antes do commit (ADR 0098 reservado a esta spec).
Publicação em staging: git fetch → rebase origin/staging → install → gates → push HEAD:staging,
encadeado com && (rebase parado nunca chega ao push). Staging fica com
NFSE_PROVIDER_API_VERSION=v2 até a virada.
NÃO reemitir a nota de serviço da Comercial Zaragoza (R$ 2.601,95): ela já existe como NFS-e nº 74,
emitida à mão no portal — usar o vínculo de nota externa (T5.x) ou descartar.
Pare e pergunte antes de: leitura de dado de produção (T0.2), deploy em produção, merge de PR para
main, T6.2 (virada para v3 e primeira nota real de valor mínimo), migration destrutiva, qualquer
[NEEDS CLARIFICATION] novo.
```
