# Tasks — Feature 175

Uma task por vez, na ordem. Cada uma fecha com typecheck, lint, teste da app tocada, commit
isolado e evidência em `evidence.md`.

## Fase 1 — A permissão que diverge

> 🤖 Modelo: `sonnet`

- [x] **T001** Contrato que prova que o gate de NFS-e do frontend usa a mesma permissão que a rota
      exige (`nfse.issue`). Escrever **antes** da correção e confirmar que falha.
- [x] **T002** Trocar `NFSE_MANAGE_PERMISSION` por `nfse.issue` em
      `modules/nfse-invoice/shared/nfseEmission.service.ts:101` e no que consumir a constante.
      Conferir se `nfse.manage` ainda tem uso legítimo (leitura, configuração) antes de removê-la.
- [x] **T003** Verificar na bancada que quem tem só `nfse.manage` não vê mais o botão na tela de
      notas, e que quem tem `nfse.issue` vê. Registrar a medição, não a suposição.

## Fase 2 — A ação sai do dado

> 🤖 Modelo: `sonnet`

- [x] **T101** Contrato: `expectedDocument === 'cte'` → rótulo de CT-e; `'nfse'` → rótulo de NFS-e;
      `null` → nenhuma ação. Inclui o caso do campo **ausente** na resposta (trata como `null`).
- [x] **T102** Confirmar que `expectedDocument` chega ao componente da linha
      (`fiscalReadinessByDocumentId` em `TripDetail.component.tsx`). Se não chegar, propagar — e só
      mexer na API se o campo não estiver saindo dela.
- [x] **T103** Trocar o botão fixo pela ação derivada, com a permissão conferida por documento
      (`cte.submit` / `nfse.issue`).
- [x] **T104** Locales pt-BR e en dos dois rótulos e do estado sem ação.

## Fase 3 — A fonte única e o caminho da NFS-e

> 🤖 Modelo: `sonnet` — **T205 é 🧠**

- [x] **T201** 🧠 Fronteira de módulo decidida (análise de 23/09): a regra não é declarada em lugar
      nenhum, é costume permissivo, e o padrão do repositório é o **componente de ação autocontido**
      exportado pelo módulo dono — precedente literal em `NfeDocumentTable.component.tsx:13`, que já
      importa `NfseEmissionAction` de `nfse-invoice`. Decisão: `trip` importa `NfseEmissionAction`,
      não o diálogo. Nada se move, não há ciclo. Emitir **um** documento é caminho legítimo
      (`nfse-invoice.use-case.ts:130`) — não vira ADR.
- [x] **T205** 🧠 **ADR-0071**: fazer `expectedDocument` sair da fonte única
      (`classifyDocumentOutput`, pelo perfil de emissão) em vez de `resolveFiscalDocumentKind`, e
      transportar o `nfseProfileId` e os estados `blocked`/`no_profile` até a viagem. Contrato que
      prova que existe **uma conta só** — falha se alguma tela voltar a decidir por município.
      Frontend tolerante primeiro: o bundle aceita as chaves novas antes de a API emitir.
- [x] **T206** Escrever a regra de fronteira, hoje só costume, num parágrafo em
      `apps/frontend-transportada/CLAUDE.md`: módulo consome de outro apenas o componente de ação
      autocontido que o dono exporta, nunca o diálogo ou o hook internos.
- [x] **T202** Contrato: a ação de NFS-e **abre o diálogo** com a nota pré-selecionada e não dispara
      emissão antes de o perfil ser escolhido.
- [x] **T203** Implementar a abertura do diálogo a partir da linha, por `NfseEmissionAction`.
      Pré-requisito: descer `permissions` e `companyId` até `TripStopList` (molde em
      `NfeWorkspace.page.tsx:196,220`) — hoje a lista só recebe `canSubmitCte` já resolvido.
- [x] **T204** Estados `no_profile` e `blocked`: contrato primeiro, depois a linha informando e sem
      oferecer a ação. ⚠️ Não confundir com "nenhum perfil casa com a nota", que é resolução de
      perfil de CT-e e não existe no caminho da NFS-e.

## Fase 4 — O resumo e o fecho

> 🤖 Modelo: `sonnet` — **T303 é 🧠**

- [ ] **T301** Contrato: o resumo de prontidão conta NFS-e pendente, e viagem só com NFS-e
      pendente não é dita "pronta".
- [ ] **T302** Implementar a contagem.
- [ ] **T303** 🧠 Revisão de design e usabilidade das linhas com as duas ações, em 375px e no
      desktop, **com print** (web.md §15). Conferir área de toque, contraste e a linha marcada.
- [ ] **T304** `evidence.md` consolidado: o que foi medido, onde, e o que ficou de fora.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/175-o-documento-que-a-nota-espera/ (leia spec.md,
plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 1 → executor model=sonnet · Fase 2 → executor model=sonnet · Fase 3 → executor
model=sonnet, T201 🧠 valida com architect em opus antes de escrever código · Fase 4 → executor
model=sonnet, T303 🧠 revisão de design com print · revisão final → code-reviewer model=opus.
Teste de contrato antes da implementação. Cada task fecha com typecheck + lint + teste da app
tocada + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: criar rota nova na API, deploy, migration destrutiva, qualquer
[NEEDS CLARIFICATION].
```
