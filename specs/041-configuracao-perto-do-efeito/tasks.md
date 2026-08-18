# 041 — Tasks

Uma task por vez. Teste de contrato **antes** da implementação. Evidência em `evidence.md`.
Arquivo de teste novo entra na lista literal do `package.json` da app, ou não roda.

✅ **Liberado para implementar.** Nenhum `[NEEDS CLARIFICATION]` aberto — as três decisões que
faltavam estão em `spec.md`: o controle da busca automática some de Empresa, cada painel vira aba do
destino, e aba sem `settings.manage` **não é renderizada**.

Feature de frontend só. Task que pedir migration, rota nova ou mudança de envelope está fora do
recorte — pare e reveja.

## Fase 0 — o endereço vira dado

> 🤖 Modelo: `sonnet`

- [x] **T001** — Contrato (escrito antes): `companySettingsTabs.service.ts` passa a declarar, por
      painel, **o módulo dono** além da aba; o contrato existente
      (`test/company-settings/tabs.contract.ts`) ganha as asserções de que todo painel tem exatamente
      um módulo, de que módulo e aba são consistentes, e de que a consulta do painel é ligada pela aba
      dele em qualquer módulo.
      Verificação: `bun test test/company-settings.contract.test.ts` vermelho pelos motivos certos.
- [x] **T002** — Implementar o serviço com o campo de módulo, sem mover painel nenhum: Empresa
      continua hospedando os quatro. É a task que separa "descrever o endereço" de "mudar o endereço",
      para o passo seguinte ser diff de tela e não de conceito.
      Verificação: T001 verde; `bun run typecheck` e `bun run test` na app.

## Fase A — combustível vai para a frota

> 🤖 Modelo: `sonnet`

- [x] **T003** — Contrato: `test/fleet/fuel-tab.contract.ts` exige a aba Combustível na lista de abas
      de Frota **apenas** com `settings.manage`, exige que o hook receba `enabled` composto de
      permissão e aba aberta, e exige que a lista de preços chegue ao painel já preenchida quando a
      consulta responde. Registrar o arquivo no `package.json` e no `test/fleet.contract.test.ts`.
      Verificação: vermelho.
- [x] **T004** — Mover `FuelPricePanel` e `useFuelPrices` para `fleet`, com a aba montada em
      `FleetWorkspace.page.tsx` e os rótulos nos dois pacotes de tradução de `fleet` (pt-BR
      **acentuado** — `test/shared/locale-accents.contract.ts` varre por glob).
      Verificação: T003 verde; suíte da app verde; `bun run build`.
- [x] **T005** — Tirar o painel, o hook e a aba de `company-settings`; atualizar o serviço de abas e o
      contrato da Fase 0 para o novo dono.
      Verificação: `bun run test` da app inteira verde; nenhum import órfão (`bun run lint`).

## Fase B — configuração de NFS-e vai para o módulo de NFS-e

> 🤖 Modelo: `sonnet` (T006 é 🧠 — é onde o prefill morde)

- [x] **T006** 🧠 — Contrato: `test/nfse-invoice/settings-tab.contract.ts` exige a aba Configuração só
      com `settings.manage`, e **exige o prefill**: credencial gravada e perfis existentes chegam aos
      campos quando a consulta responde depois da montagem da aba. É a asserção que o `key` do
      `NfseCredentialPanel` sustenta hoje por acidente de posição — no destino ela passa a ser
      explícita.
      Verificação: vermelho pelos dois motivos, separadamente.
- [x] **T007** — `NfseInvoiceWorkspacePage` ganha `Tabs` (`invoices`, `settings`), recebe os dois
      painéis e o `useNfseSettings`, com rótulos nos dois pacotes de tradução.
      Verificação: T006 verde; suíte verde; `bun run build`.
- [x] **T008** — Remover de `company-settings` os dois painéis, o hook e a aba; atualizar serviço e
      contrato de abas.
      Verificação: app verde; lint sem import órfão.

## Fase C — cursor e busca automática vão para a aba Remota

> 🤖 Modelo: `sonnet` (T009 é 🧠 — duas permissões na mesma aba)

- [x] **T009** 🧠 — Contrato: `test/nfe-workspace/distribution-settings.contract.ts` exige que a aba
      Remota siga visível com `nfe.read` sozinho, que o bloco de configuração dentro dela apareça
      **só** com `settings.manage`, e que nenhuma consulta de configuração suba sem a permissão.
      Verificação: vermelho nos três pontos.
- [x] **T010** — Mover `ScheduledDistributionPanel`, `DistributionCursorPanel` e os dois hooks para
      `nfe-workspace`, dentro da aba Remota, com rótulos traduzidos.
      Verificação: T009 verde; suíte verde.
- [x] **T011** — Remover os dois painéis, os dois hooks e a aba de `company-settings`. O opt-in **não**
      volta como espelho somente-leitura: Empresa deixa de falar de busca automática.
      Verificação: nenhuma ocorrência dos painéis em `company-settings`; app verde.
- [x] **T012** — Conferir que `test/companies/scheduled-distribution-parity.contract.ts` (API) segue
      verde sem edição. Se ele precisar mudar, a mudança saiu do recorte — a paridade é de **leitura**,
      e nenhuma leitura mudou.
      Verificação: `bun run --cwd apps/api-transportada test`.

## Fase D — Empresa com duas abas

> 🤖 Modelo: `haiku`

- [x] **T013** — `CompanySettings.page.tsx` fica com Empresa e Certificados; remover do serviço de
      abas o que sobrou, e as chaves de tradução órfãs dos quatro painéis movidos.
      Verificação: app verde; `bun run build`; contagem de painéis do módulo bate com o serviço.

## Fase E — gates e documentação

> 🤖 Modelo: `sonnet`

- [x] **T014** — `make check` na raiz e smoke responsivo (375px, 768px, 1280px) nas quatro telas
      tocadas — aba nova não pode criar scroll horizontal nem barra de abas quebrada em mobile.
      Verificação: saída colada em `evidence.md`.
- [x] **T015** — Atualizar `CLAUDE.md`: o parágrafo de `company-settings` deixa de listar os quatro
      painéis, e frota, NF-e e NFS-e ganham a menção da aba de configuração e da permissão que a
      guarda. Regra do repo: contexto da I.A. atualizado ao fim de mudança de tela ou de regra.
      Verificação: diff do `CLAUDE.md` na evidência.
