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

Spec com `[NEEDS CLARIFICATION]` aberto não ganha prompt de execução. Pendentes: ver `spec.md`
(município aceita emissão direta; A1; destino da Nota RP; contrato do Swagger). A Fase 0 da
**250** fecha antes desta.
