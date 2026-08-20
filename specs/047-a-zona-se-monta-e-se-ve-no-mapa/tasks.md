# 047 — Tarefas

## Fase 1 — Escrita da zona

> 🤖 Modelo: `sonnet`

- [x] **T001** — Contrato do formulário de zona.
      `test/fleet/freight-region-form.contract.ts`: grade das seis classes; classe sem valor **não**
      vira entrada em `rates`; código fora de `^[0-9]\.00[0-3]$` é recusado antes do envio; cidade
      repetida dentro da zona é recusada; `expectedVersion` em conflito vira mensagem.
      **Aceite:** vermelho registrado.

- [x] **T002** — Cliente HTTP.
      `createFreightRegion`, `updateFreightRegion`, `deleteFreightRegion` e `importFreightRegions`
      em `shared/fleetClient.service.ts`, com o `fetch` injetado dos demais; guard do resumo de
      importação em `fleetResponse.validation.ts`.
      **Aceite:** contrato de resposta verde, incluindo corpo inesperado recusado.

- [x] **T003** — `useFreightRegionForm.hook.ts` e `FreightRegionForm.component.tsx`.
      Campos, grade de preço, submissão e invalidação. Componente declarativo; toda a lógica no hook.
      **Aceite:** T001 verde.

---

## Fase 2 — Entrada de cidade

> 🤖 Modelo: `sonnet`

- [x] **T004** — Contrato da entrada de cidade.
      `test/fleet/freight-region-city-entry.contract.ts`: busca e colagem produzem o mesmo nome
      canônico; `MOGI-MIRIM`, `mogi mirim` e `Mogi Mirim` casam com a mesma linha do IBGE; nome sem
      correspondência volta **nomeado** e não é gravado.
      **Aceite:** vermelho registrado.

- [x] **T005** — `shared/regionCityName.service.ts`.
      A dobra num lugar só: caixa alta, sem acento, sem pontuação, espaço único. Sem I/O.
      **Aceite:** T004 verde na parte da dobra.

- [x] **T006** — `FreightRegionCityField.component.tsx`.
      Busca na lista do IBGE (`municipality.service.ts`, cache compartilhado) e área de colagem;
      cidades como pílulas removíveis de `@/components/ui/filter-pills`; bloco de não reconhecidas.
      **Aceite:** T004 verde.

---

## Fase 3 — Importação por arquivo

> 🤖 Modelo: `sonnet`

- [ ] **T007** — Contrato da importação.
      `test/fleet/freight-region-import.contract.ts`: os dois arquivos viram `{regions, rates}` como
      texto; o resumo `{created, updated, deactivated}` é exibido; arquivo faltando bloqueia o envio
      antes do 400.
      **Aceite:** vermelho registrado.

- [ ] **T008** — `FreightRegionImportDialog.component.tsx`.
      Seletor dos dois arquivos, envio e resumo. Diálogo, não página.
      **Aceite:** T007 verde.

---

## Fase 4 — Mapa

> 🤖 Modelo: `sonnet` (T010 é 🧠 — a projeção e o corte de viewBox merecem `opus` se o desenho sair torto)

- [ ] **T009** — Contrato do mapa.
      `test/fleet/freight-region-map.contract.ts`: polígono casa com a cidade por `codarea`; cidade
      sem polígono aparece nomeada como "fora do mapa"; clicar num município com zona em edição
      acrescenta e remove; falha da malha não derruba a listagem. **E falha se o componente
      contiver `iframe`, `<img>` de origem externa ou `dangerouslySetInnerHTML`.**
      **Aceite:** vermelho registrado.

- [ ] **T010** — 🧠 `shared/ibgeMesh.service.ts`.
      Busca da malha por UF (`qualidade=minima`, `intrarregiao=municipio`), guard do GeoJSON e
      projeção dos anéis em atributo `d`. Uma UF por vez, sob demanda, cacheada pelo TanStack Query.
      **Aceite:** T009 verde na parte de casamento e projeção.

- [ ] **T011** — `useFreightRegionMap.hook.ts` e `FreightRegionMap.component.tsx`.
      Cor por zona vinda dos tokens de `styles/index.css`, legenda, estado de carregamento com
      esqueleto (`docs/frontend/loading.md`), estado de falha visível.
      **Aceite:** T009 verde.

- [ ] **T012** — CSP.
      Conferir que `https://servicodados.ibge.gov.br` está no `connect-src` publicado pela T008 da 046. Se a 046 já tiver publicado sem ele, acrescentar ali — **nunca** escrever uma segunda
      diretiva.
      **Aceite:** o contrato de CSP da 046 verde com o destino novo.

---

## Fase 5 — Fechamento

> 🤖 Modelo: `sonnet`

- [ ] **T013** — Painel e permissão.
      `FreightRegionPanel` hospeda criar, importar e o mapa; sem `settings.manage` a aba mostra
      tabela e mapa e nenhum botão de escrita.
      **Aceite:** `company-settings/tabs` verde e contrato de permissão da aba verde.

- [ ] **T014** — Locales.
      Verbetes nos dois idiomas, pt-BR acentuado.
      **Aceite:** `locale-accents` verde.

- [ ] **T015** — Gates.
      `make check`, evidência em `evidence.md` com a prova de que a tabela do cliente sobe pela tela
      (não pelo script) e o desenho fecha.
      **Aceite:** tudo verde, evidência escrita.
