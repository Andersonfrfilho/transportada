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
- [x] **T0.2** `sonnet` — Confirmar na API nacional (parâmetros municipais, produção restrita) que
      Ribeirão Preto aceita emissão direta pelo contribuinte, e registrar a fonte oficial da
      gratuidade. Aceite: resposta em `evidence.md`; sem ela, parar e abrir ADR "não faremos".
      **FECHADA CONDICIONALMENTE (08/10/2026):** o cadastro oficial diz `aderenteEmissorNacional = 0` (restrita e
      produção), mas o usuário informa que a prefeitura já aceita e o cadastro está desatualizado; vale a sonda T2.3b.
      Antes: fechada por confirmação do usuário de que a prefeitura atende a emissão nacional; a
      medição de `aderenteEmissorNacional` (mTLS) segue como conferência técnica na T0.3/T0.4, não como
      bloqueio. A gratuidade não tem página oficial acessível: tratar como indício. Ver `evidence.md` § T0.2.
- [x] **T0.3** `sonnet` — Ler o Swagger de produção restrita (ADN e Sefin) e transcrever para
      `plan.md`: qual serviço recebe a DPS, mTLS, corpo de emissão (compactação), consulta,
      cancelamento (evento), DANFSe, erros, limites. Fechada em 08/10/2026 com o Swagger oficial lido com o A1;
      ver `plan.md` § T0.3 e `evidence.md` § "T0.3 — fechamento (Swagger oficial)".
- [x] **T0.4** `sonnet` — Obter com o usuário o A1 de **homologação** (ou procedimento), confirmar a
      validade do A1 de produção (o da Nota RP vence em 05/11/2026) e quem renova.
      A1 de produção da transportadora liberado pelo usuário para leitura em produção restrita/produção (GET); Anderson renova (vence em 05/11/2026) e repassa ao cofre; emissão real só na T4.2; senha nunca em arquivo/log.
- [x] **T0.5** 🧠 `opus` — (destino da Nota RP já decidido pelo usuário: sai do app, fica só na lib) ADR **0099** "A NFS-e fala o Sistema Nacional": emenda 0029 e 0035; decide a
      sorte da Nota RP (contingência × remoção) e da T6.2 da 250 — fecha o [NEEDS CLARIFICATION] 3.
      Validar com `architect` antes de implementar. Numeração conferida em `origin/staging`.

## Fase 1 — Cofre e numeração (API)

> 🤖 Modelo: `sonnet` (T1.3 → `haiku`)

- [ ] **T1.1** `sonnet` — Cadastro do A1 da NFS-e (reuso do cofre da ADR-0004), com validade e alerta.
      ADR 0099 §3: finalidade própria `nfse` em `digital_certificates` (não lê o `cte`); alerta D-30/D-7 por e-mail no cron é novo.
      Revisão do architect: upload único pode selar `cte` e `nfse` (cada um com o próprio AAD); a API abre o A1 `nfse` para o mTLS
      do ADN (`node-forge`, §13); emissão `national` sem A1 `nfse` ativo e válido → `409`.
- [ ] **T1.4** `sonnet` — Credencial NFS-e `national` sem segredo (ADR 0099 §3): `NFSE_PROVIDERS` ganha `national`;
      `secret_envelope` e `callback_token_sha256` nuláveis com check por provedor; migration aditiva com `rollback.sql`
      guardado. Na mesma task, `409 NFSE_REISSUE_CORRECTION_AMBIGUOUS` (reemissão com chave herdada e `correction`,
      ADR 0099 §1). Aceite: contrato + `make migration-test`.
- [ ] **T1.2** `sonnet` — Reserva de `nDPS`/série por empresa e ambiente, idempotente (padrão ADR-0005).
      ADR 0099 §4: modelo `nfse_dps`, chave `nfse-dps:<provider_request_key>`, reserva na API ao criar a tentativa; `dps_series` no perfil.
      Revisão do architect: check de `dps_series` é 1–49998; a série `49999` é reservada à sonda e a provas fora do sistema.
- [ ] **T1.3** `haiku` — Ambiente da credencial (`homologation` | `production`) e
      `NFSE_PROVIDER_BASE_URL` por ambiente no schema de env — emenda da 0035. Aceite: `tsc` + contrato.
      ADR 0099 §5: a credencial e a tentativa já têm `fiscal_environment`; a task vira `NFSE_NATIONAL_ADN_BASE_URL` + guarda de staging.
      Revisão do architect: guarda de boot host × `FISCAL_ENVIRONMENT` na API e no worker (`producaorestrita` só em
      `homologation`); leitura do ADN (§7) com alíquota comparada só fora do Simples (`iss_rate`), no Simples gravada sem
      bloquear, ADN `404` não vira `503`; conferir se o perfil tem marcador de regime melhor que `simples_national_rate` nulo.

## Fase 2 — Adaptador no worker

> 🤖 Modelo: `sonnet` (T2.6 → `haiku`; T2.3 passa por `security-reviewer` em `opus`)

- [ ] **T2.0** `sonnet` — **Antes de qualquer valor novo na API** (ADR 0099 §2): no worker, versão de API **desconhecida**
      vira recusa fatal `NFSE_PROVIDER_VERSION_UNKNOWN` (só a ausência segue `v2`). Publicar e confirmar no ar antes de a API
      aceitar `national`; a troca de `NFSE_PROVIDER_API_VERSION` é passo de operação registrado em `evidence.md`, nunca do
      mesmo PR. Aceite: contrato vermelho → verde em `nfse-provider-api-version.policy.ts`.
- [ ] **T2.1** `sonnet` — Contratos vermelhos com fixtures do Swagger (emitir, consultar, cancelar, DANFSe).
      ADR 0099 §1 (revisão): 400/403 classificados por `erros[].codigo` (403 sem esse corpo → `error`); recusa de
      duplicidade → `GET /dps/{id}` → `accepted` (código a localizar no Anexo I/sonda; fixture provisória nomeada);
      `tipoAmbiente` divergente → falha terminal `environment_mismatch`; evento `101101`: `201` → `accepted`, pull confirma,
      `400`/`422` → `rejected`, retentativa consulta eventos antes do `POST`.
- [ ] **T2.2** `sonnet` — Montagem da DPS 1.01 e validação contra XSD.
      Revisão do architect: conferir no XSD os valores de `cMotivo` do `e101101` e se a NFS-e tem campo de código de
      verificação (senão `verificationCode = chaveAcesso`); `cNBS` sai de `nbs_code` quando preenchido.
- [ ] **T2.3** `sonnet` — Assinatura XMLDSig com o A1 (gateway da aplicação, sem internals do pacote
      fiscal). Revisão de segurança: chave e senha nunca em log, buffers zerados.
      Revisão do architect: `xml-crypto` 6.3.x + `@xmldom/xmldom`, PKCS#12 por `node-forge` 1.3.x, todos pelo §13.
- [ ] **T2.3b** `sonnet` — **SONDA (antes da Fase 1 e da Fase 3):** com a DPS montada e assinada, um
      `POST /nfse` de teste em **produção restrita**. Se a Sefin recusar por o município não ser aderente ao
      Emissor Nacional, **parar**, registrar o código/mensagem em `evidence.md` e voltar ao usuário (ADR "não
      faremos" ou webservice ISS.Net). Se aceitar, o risco do cadastro desatualizado está fechado. Exige o A1
      (o usuário digita a senha; nada de segredo em arquivo).
      **Ação antes do envio (revisão do architect, ADR 0099 §4/§8):** a sonda preparada usa série 1 / `nDPS` 1 e deve
      passar à **série `49999`** (reservada, fora do perfil). Enviar com `cNBS` preenchido e registrar se a Sefin o cobra,
      o algoritmo de assinatura aceito e o código da recusa de duplicidade, se aparecer. **Se recusar por convênio,** as
      saídas são: retomar a T6.2 da 250 (virada para `v3`, aprovação humana) ou o webservice ISS.Net — a produção está na
      v2, que já recusa a empresa; não há "regressão zero".
- [ ] **T2.4** `sonnet` — `nfse-national.client.ts` + gateway + seleção `national` por env, com mTLS e
      limitador do processo.
- [ ] **T2.5** `sonnet` — Status pull e documentos (XML fiscal imutável + PDF no storage).
      ADR 0099 §6: o PDF é DANFSe renderizado no worker (`pdfkit`) dentro de `fetchDocument({ kind: 'pdf' })`.
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
- [ ] **T4.2b** `sonnet` — Remover a Nota RP do app (decisão de 08/10/2026), **só depois** da T4.2:
      clientes v2/v3, roteio por versão, `NFSE_PROVIDER_API_VERSION`, limitador de 1 req/s, vínculo
      externo e seus contratos; a lib `@adatechnology/fiscal-provider` não é tocada. `cTribNac`
      (`national_taxation_code`) fica: é campo do padrão nacional. Aceite: `make check`,
      `make migration-test` e grep sem `nota-rp` em `apps/`.
      ADR 0099 §2/§9: pré-condição zero nota v2/v3 não terminal **e zero v2/v3 em `failed` com causa ambígua sem
      `providerDocumentId`** (reemitida por `national` duplicaria nota que talvez exista na Nota RP); o limitador fica
      (renomeado), sai só a instância v3.
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
 · sonnet → T0.2, T0.3, T0.4, T1.1, T1.2, T1.4, T2.0 (publicada antes de a API aceitar `national`),
   T2.1–T2.5, T3.1, T3.2
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
