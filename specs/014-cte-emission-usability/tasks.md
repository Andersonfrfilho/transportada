# Tasks

Feature 014 — Emissão de CT-e a partir da seleção: contrato de taxa e usabilidade.
Regra do repo: teste de aceite/contrato antes da implementação; task só fecha com evidência em
`evidence.md`.

## Fase A — Contrato decimal do perfil de emissão

> 🤖 Modelo: `sonnet`

- [x] T001 Normalizar na borda de leitura toda grandeza decimal do perfil — taxa com 6 casas,
      dinheiro com 4 — para que o corpo da resposta pare de devolver `"0"` onde o contrato pede
      `"0.000000"`; a normalização é string→string com `numeric`/`Decimal`, nunca `Number` —
      `apps/api-transportada/src/cte-profiles/infrastructure/cte-emission-profile.mapper.ts` —
      teste de contrato do mapper com o registro real (`icmsRate`, `icmsBaseReductionRate`,
      `components[].amount`, `components[].rate`) antes da implementação
- [x] T002 Apertar `RATE_DECIMAL` e `MONEY_DECIMAL` da entrada para a mesma escala fixa da saída, de
      modo que ida e volta descrevam uma forma só —
      `apps/api-transportada/src/cte-profiles/presentation/cte-emission-profile-request.schema.ts` —
      teste de contrato provando 400 para a forma antiga (`"0"`) e 201/200 para a nova
- [x] T003 [P] Teste de contrato do frontend cobrindo o payload real da API: `profileListFromApi`
      devolve o perfil ativo e o `SelectMenu` de emissão lista "Automático" + o nome de cada perfil —
      `apps/frontend-transportada/test/cte-profiles/*.contract.ts` (adicionar o arquivo à lista
      explícita do `package.json`)

## Fase B — Diálogo de emissão dentro da área visível

> 🤖 Modelo: `sonnet`

- [x] T004 Renderizar o overlay via `createPortal` em `document.body`, imunizando-o contra o
      `transform` de `.application-page-transition`, com `aria-modal`, trava de scroll do body,
      focus trap e Escape no próprio diálogo —
      `apps/frontend-transportada/src/modules/nfe-workspace/components/CteEmissionDialog.component.tsx`,
      `styles/nfeWorkspace.module.css` — teste de contrato antes: o overlay não é filho da árvore da
      página e o diálogo recebe foco ao abrir
- [x] T005 [P] Smoke autenticado medindo a geometria: com `scrollY: 0` em 1440×900, o retângulo do
      diálogo cabe dentro da viewport — `apps/frontend-transportada/test/responsive.smoke.spec.ts`

## Fase C — Bloqueio conhecido no momento da seleção

> 🤖 Modelo: `sonnet` (T006 é 🧠 — a regra é compartilhada com o preview, validar o desenho antes)

- [x] T006 🧠 Extrair a regra de bloqueio para o domínio e expô-la na listagem de notas, sem segunda
      implementação ao lado do preview — `apps/api-transportada/src/nfe-documents/**` —
      teste de contrato + **tenant-safety obrigatório** (muda query)
- [x] T007 Indicar o bloqueio e o motivo na tabela de notas, impedir a seleção da linha bloqueada e
      contabilizar bloqueadas na barra de seleção —
      `apps/frontend-transportada/src/modules/nfe-workspace/**` — teste de contrato antes

## Fase D — Alcançar os parâmetros do CNPJ

> 🤖 Modelo: `sonnet`

- [x] T008 Exibir no diálogo qual perfil foi aplicado a cada projeção e oferecer caminho para
      Administração → Perfis de emissão de CT-e a quem tem `settings.manage` —
      `apps/frontend-transportada/src/modules/nfe-workspace/**` — teste de contrato antes

## Fase E — Valor manual (bloqueada)

> 🤖 Modelo: a definir

- [ ] T009 `[NEEDS CLARIFICATION]` Permitir informar o valor do frete à mão por CT-e.
      Perguntas abertas, todas com consequência fiscal: (a) o valor manual substitui o percentual ou
      entra como componente de cobrança adicional? (b) exige justificativa e fica auditável por
      usuário e data? (c) que permissão autoriza — `cte.manage` basta ou pede uma nova? (d) o valor
      manual aparece no XML em `vTPrest`/`vRec` ou apenas na cobrança?
      **Nada é implementado enquanto estas perguntas estiverem abertas.**

## Verificação

`bun run lint` · `bun run typecheck` · `bun run --cwd apps/api-transportada test` ·
`bun run --cwd apps/frontend-transportada test` · `bun run --cwd apps/frontend-transportada smoke` ·
`make check` antes de fechar a feature.
