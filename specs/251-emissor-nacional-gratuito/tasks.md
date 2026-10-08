# Tasks

> Pré-condição: **há `[NEEDS CLARIFICATION]` aberto em `spec.md`**. Nada além da Fase 0 começa antes
> de T0.2 (o município aceita emissão direta). O código da spec 250 (seleção por env, `cTribNac`,
> vínculo externo) precisa estar em `origin/staging`; **a virada da 250 em produção não é
> pré-requisito** (decisão de 08/10/2026). Produção só por PR com aprovação humana.

Uma task por vez; contrato vermelho antes da implementação; cada task fecha com typecheck + teste +
commit isolado e evidência em `evidence.md`. Migration pede `make migration-test` e `rollback.sql`.

Modelos (rules/model-economy.md): `haiku` = mecânica com aceite por comando; `sonnet` = decisão local;
`opus` = só a decisão que outras tasks herdam (🧠). Gate falhou 2x → sobe um nível e registra em
`evidence.md`.

## Fase 0 — Levantamento

> 🤖 Modelo: `sonnet` (T0.1 → `haiku`; T0.5 é 🧠 `opus`)

- [x] **T0.1** `haiku` — Conferir spec 250 em `origin/staging` e ler as specs 032/040/175 (nada aqui
      duplica decisão delas). Aceite: lista de contratos herdados em `evidence.md`.
- [ ] **T0.2** `sonnet` — Confirmar na API nacional (parâmetros municipais, produção restrita) que
      Ribeirão Preto aceita emissão direta pelo contribuinte, e registrar a fonte oficial da
      gratuidade. Aceite: resposta em `evidence.md`; sem ela, parar e abrir ADR "não faremos".
- [ ] **T0.3** `sonnet` — Ler o Swagger de produção restrita (ADN e Sefin) e transcrever para
      `plan.md`: qual serviço recebe a DPS, mTLS, corpo de emissão (compactação), consulta,
      cancelamento (evento), DANFSe, erros, limites. Se o Swagger recusar sem certificado, ler pelo
      repositório do Swagger/OpenAPI publicado e registrar.
- [ ] **T0.4** `sonnet` — Obter com o usuário o A1 de **homologação** (ou procedimento), confirmar a
      validade do A1 de produção (o da Nota RP vence em 05/11/2026) e quem renova.
- [ ] **T0.5** 🧠 `opus` — ADR **0099** "A NFS-e fala o Sistema Nacional": emenda 0029 e 0035; decide a
      sorte da Nota RP (contingência × remoção) e da T6.2 da 250 — fecha o [NEEDS CLARIFICATION] 3.
      Validar com `architect` antes de implementar. Numeração conferida em `origin/staging`.

## Fase 1 — Cofre e numeração (API)

> 🤖 Modelo: `sonnet` (T1.3 → `haiku`)

- [ ] **T1.1** `sonnet` — Cadastro do A1 da NFS-e (reuso do cofre da ADR-0004), com validade e alerta.
- [ ] **T1.2** `sonnet` — Reserva de `nDPS`/série por empresa e ambiente, idempotente (padrão ADR-0005).
- [ ] **T1.3** `haiku` — Ambiente da credencial (`homologation` | `production`) e
      `NFSE_PROVIDER_BASE_URL` por ambiente no schema de env — emenda da 0035. Aceite: `tsc` + contrato.

## Fase 2 — Adaptador no worker

> 🤖 Modelo: `sonnet` (T2.6 → `haiku`; T2.3 passa por `security-reviewer` em `opus`)

- [ ] **T2.1** `sonnet` — Contratos vermelhos com fixtures do Swagger (emitir, consultar, cancelar, DANFSe).
- [ ] **T2.2** `sonnet` — Montagem da DPS 1.01 e validação contra XSD.
- [ ] **T2.3** `sonnet` — Assinatura XMLDSig com o A1 (gateway da aplicação, sem internals do pacote
      fiscal). Revisão de segurança: chave e senha nunca em log, buffers zerados.
- [ ] **T2.4** `sonnet` — `nfse-national.client.ts` + gateway + seleção `national` por env, com mTLS e
      limitador do processo.
- [ ] **T2.5** `sonnet` — Status pull e documentos (XML fiscal imutável + PDF no storage).
- [ ] **T2.6** `haiku` — Registrar os arquivos novos de teste no `package.json` do worker e da API.

## Fase 3 — Painel

> 🤖 Modelo: `sonnet` (textos pt-BR/en → `haiku`)

- [ ] **T3.1** `sonnet` — Tela de certificado/ambiente da NFS-e com validade e estado.
- [ ] **T3.1b** `haiku` — Locales pt-BR e en da tela, sem string literal repetida.
- [ ] **T3.2** `sonnet` — Revisão de design e usabilidade (print, web.md §15).

## Fase 4 — Homologação e virada

> 🤖 Modelo: `haiku` para gates e docs (T4.2 exige aprovação humana)

- [ ] **T4.1** `haiku` — Staging emite em produção restrita; `make check`, `make migration-test`,
      `make worker-integration` verdes.
- [ ] **T4.2** humano — Virada em produção: nota de valor mínimo, conferida no portal nacional,
      aprovação humana. Mesma nota serve para fechar a 032/T030.
- [ ] **T4.3** `haiku` — Documentar em `docs/ai-context/*`, `CLAUDE.md`; fechar a 250 conforme a
      decisão da T0.5.

## Prompt de execução

> Para no PORTÃO 1 (T0.2) e no PORTÃO 2 (T0.3–T0.5). Rode numa sessão em `sonnet`; as trocas são por
> subagente (`model=`), sem pedir `/model`.

```text
/oh-my-claudecode:autopilot Execute a spec specs/251-emissor-nacional-gratuito/ (leia spec.md,
plan.md e tasks.md, e a evidence.md da 250, antes de tocar em código). Uma task por vez, na ordem do
tasks.md, a partir de um worktree próprio (`make worktree NAME=spec-251`).
PORTÃO 0: confira em origin/staging que o código da spec 250 está lá (seleção por
NFSE_PROVIDER_API_VERSION, nationalTaxationCode, vínculo externo). A virada da 250 em produção NÃO é
pré-requisito. Se o código não estiver em staging, pare e avise.
Modelo por task (delegue ao subagente executor com model=<modelo>; o modelo está escrito em cada task):
 · haiku → T0.1, T1.3, T2.6, T3.1b, T4.1, T4.3
 · sonnet → T0.2, T0.3, T0.4, T1.1, T1.2, T2.1–T2.5, T3.1, T3.2
 · opus 🧠 → T0.5 (ADR 0099, validada por architect antes de seguir) e a revisão de segurança da T2.3
   (security-reviewer, opus)
 · revisão final → code-reviewer model=sonnet, em passe separado de quem escreveu.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md. Volte ao nível
da fase na task seguinte.
PORTÃO 1 (T0.2): confirme na API nacional que Ribeirão Preto aceita emissão direta pelo contribuinte.
Se NÃO aceitar, pare, escreva a ADR "não faremos" e avise o usuário.
PORTÃO 2 (T0.3–T0.5): transcreva o Swagger de produção restrita para plan.md; pergunte ao usuário
(AskUserQuestion) pelo A1 de homologação, quem renova o A1 de produção e o destino da Nota RP
(contingência × remoção) e da T6.2 da 250. Sem resposta, pare.
Cada task fecha com typecheck + testes + commit isolado (caminhos explícitos, --no-verify) e
evidência em evidence.md. Migration pede `make migration-test` e rollback.sql; teste novo entra na
lista do package.json; integração com --env-file. Nunca importar internals src/sefaz/* do pacote
fiscal; nunca logar certificado, senha ou XML sensível; zerar buffers de chave.
Staging emite em PRODUÇÃO RESTRITA; ADR 0099 está reservado a esta spec (conferir em origin/staging).
Pare e pergunte antes de: usar certificado real, deploy em produção, merge de PR para main, T4.2
(virada e nota real de valor mínimo), migration destrutiva, qualquer [NEEDS CLARIFICATION] novo.
Ao terminar, rode /oh-my-claudecode:cancel.
```
