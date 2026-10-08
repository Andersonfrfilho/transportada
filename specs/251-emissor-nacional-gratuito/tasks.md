# Tasks

> Pré-condição: **há `[NEEDS CLARIFICATION]` aberto em `spec.md`** e a **spec 250 ainda não está em
> produção**. Nada aqui começa antes de T0.2 (o município aceita emissão direta). Produção só por PR
> com aprovação humana.

Uma task por vez; contrato vermelho antes da implementação; cada task fecha com typecheck + teste +
commit isolado e evidência em `evidence.md`. Migration pede `make migration-test` e `rollback.sql`.

## Fase 0 — Levantamento

> 🤖 Modelo: `sonnet` (T0.2 e T0.5 🧠 `opus`: decidem se a spec continua)

- [ ] **T0.1** Conferir spec 250 em `origin/staging` e ler as specs 032/040/175 (nada aqui duplica
      decisão delas).
- [ ] **T0.2** 🧠 Confirmar na API nacional (parâmetros municipais, produção restrita) que Ribeirão
      Preto aceita emissão direta pelo contribuinte. Aceite: resposta registrada em `evidence.md`;
      sem isso, parar e abrir ADR "não faremos".
- [ ] **T0.3** Ler o Swagger de produção restrita e transcrever para `plan.md`: URLs, autenticação
      mTLS, corpo de emissão (compactação), consulta, cancelamento (evento), DANFSe, erros, limites.
- [ ] **T0.4** Obter com o usuário o A1 de **homologação** (ou procedimento) e confirmar a validade do
      A1 de produção; registrar quem renova.
- [ ] **T0.5** 🧠 ADR **0099** "A NFS-e fala o Sistema Nacional": emenda 0029 e 0035; decide a sorte
      da Nota RP (contingência × remoção) — fecha o [NEEDS CLARIFICATION] 3. Numeração conferida
      em `origin/staging`.

## Fase 1 — Cofre e numeração (API)

> 🤖 Modelo: `sonnet`

- [ ] **T1.1** Cadastro do A1 da NFS-e (reuso do cofre da ADR-0004), com validade e alerta.
- [ ] **T1.2** Reserva de `nDPS`/série por empresa e ambiente, idempotente (padrão ADR-0005).
- [ ] **T1.3** Ambiente da credencial (`homologation` | `production`) e `NFSE_PROVIDER_BASE_URL` por
      ambiente — emenda da 0035.

## Fase 2 — Adaptador no worker

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Contratos vermelhos com fixtures do Swagger (emitir, consultar, cancelar, DANFSe).
- [ ] **T2.2** Montagem da DPS 1.01 e validação contra XSD.
- [ ] **T2.3** Assinatura XMLDSig com o A1 (gateway da aplicação, sem internals do pacote fiscal).
- [ ] **T2.4** `nfse-national.client.ts` + gateway + seleção `national` por env.
- [ ] **T2.5** Status pull e documentos (XML fiscal imutável + PDF no storage).

## Fase 3 — Painel

> 🤖 Modelo: `sonnet`

- [ ] **T3.1** Tela de certificado/ambiente da NFS-e com validade e estado.
- [ ] **T3.2** Revisão de design e usabilidade (print, web.md §15).

## Fase 4 — Homologação e virada

> 🤖 Modelo: `sonnet` (T4.2 exige aprovação humana)

- [ ] **T4.1** Staging emite em produção restrita; `make check`, `make migration-test`,
      `make worker-integration` verdes.
- [ ] **T4.2** Virada em produção: nota de valor mínimo, conferida no portal nacional, aprovação
      humana.
- [ ] **T4.3** Documentar em `docs/ai-context/*`, `CLAUDE.md`; fechar a 250 conforme a decisão da
      T0.5.

## Prompt de execução

> Esta spec só começa depois que a **250 estiver em produção** e depois da **T0.2** (o município
> aceita emissão direta?). O prompt para nessas duas condições.

```text
/oh-my-claudecode:autopilot Execute a spec specs/251-emissor-nacional-gratuito/ (leia spec.md,
plan.md, tasks.md e a evidence.md da 250 antes de tocar em código). Uma task por vez, na ordem do
tasks.md, a partir de um worktree próprio (`make worktree NAME=spec-251`).
PORTÃO 0: confira em origin/staging e em produção que a spec 250 foi entregue
(NFSE_PROVIDER_API_VERSION=v3 emitindo). Se não, pare e avise.
Modelos: Fase 0 → executor model=sonnet · T0.2 🧠 e T0.5 🧠 → opus (validar com architect) ·
Fases 1, 2, 3 e 4 → executor model=sonnet · revisão final → code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
PORTÃO 1 (T0.2): confirme na API nacional (parâmetros municipais, produção restrita) que Ribeirão
Preto aceita emissão direta. Se NÃO aceitar, pare, escreva a ADR "não faremos" e avise o usuário.
PORTÃO 2 (T0.3–T0.5): transcreva o Swagger de produção restrita para plan.md; pergunte ao usuário
(AskUserQuestion) pelo A1 de homologação, quem renova o A1 de produção e o destino da Nota RP
(contingência × remoção). Sem resposta, pare.
Cada task fecha com typecheck + testes + commit isolado (caminhos explícitos, --no-verify) e
evidência em evidence.md. Migration pede `make migration-test` e rollback.sql; teste novo entra na
lista do package.json; integração com --env-file. Nunca importar internals src/sefaz/* do pacote
fiscal; nunca logar certificado, senha ou XML sensível; zerar buffers de chave.
Staging emite em PRODUÇÃO RESTRITA; ADR 0099 reservado a esta spec (conferir em origin/staging).
Pare e pergunte antes de: usar certificado real, deploy em produção, merge de PR para main, T4.2
(virada e nota real de valor mínimo), migration destrutiva, qualquer [NEEDS CLARIFICATION] novo.
```
