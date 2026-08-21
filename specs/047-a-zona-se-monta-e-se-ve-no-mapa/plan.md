# Plano técnico — 047

## Contexto e premissas

A API está pronta e não muda. As cinco rotas de `freight-regions` da 045 já cobrem tudo o que esta
spec precisa: `GET` (`fleet.read`), `POST`/`PUT`/`DELETE`/`import` (`settings.manage`), com o valor
por classe no mesmo corpo da região e `expectedVersion` no `PUT`. Esta spec é **frontend mais uma
linha de CSP**.

Premissa que sustenta o mapa: o município do IBGE tem código estável (`codigo_ibge`), e a malha que
o IBGE publica traz esse mesmo código em `properties.codarea`. Medido em 20/08/2026:

```
/api/v3/malhas/estados/35?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=minima
  → 200, 309 590 bytes, FeatureCollection de polígonos com properties.codarea
/api/v1/localidades/municipios/3505500  → sem coordenada (só hierarquia político-administrativa)
/api/ibge/municipios/v1/SP (BrasilAPI)  → [{codigo_ibge, nome}], sem coordenada
```

É por isso que o desenho vem da malha e não de um par lat/lon guardado: **não existe fonte pública
de centroide por município nos endpoints que o produto já usa**, e polígono comunica zona melhor que
ponto — a zona aparece como mancha contígua, que é como o operador pensa nela.

## Arquitetura e arquivos afetados

**frontend-transportada — `src/modules/fleet/`**

- `shared/fleetClient.service.ts` — quatro métodos novos: `createFreightRegion`,
  `updateFreightRegion`, `deleteFreightRegion`, `importFreightRegions`. Mesmo `fetch` injetado dos
  demais.
- `shared/fleetResponse.validation.ts` — type guard do resumo de importação
  (`{created, updated, deactivated}`) e reuso do guard de região que já existe.
- `shared/regionCityName.service.ts` (novo) — a dobra de nome de município: caixa alta, sem acento,
  sem pontuação, espaço único. **Um lugar só**, porque ela é usada pela colagem em lote, pelo
  casamento com o polígono e pela deduplicação dentro da zona; três cópias divergiriam.
- `shared/municipality.service.ts` — já carrega `/api/ibge/municipios/v1/{uf}`; ganha a exportação da
  lista por UF para o mapa reusar o mesmo cache do TanStack Query.
- `shared/ibgeMesh.service.ts` (novo) — busca da malha por UF e projeção dos polígonos em caminho SVG.
  Projeção equirretangular simples com correção de latitude; não é carta náutica, é leitura de zona.
- `hooks/useFreightRegionForm.hook.ts` (novo) — estado do formulário, grade de preço, entrada de
  cidade nos dois modos, submissão e invalidação.
- `hooks/useFreightRegionMap.hook.ts` (novo) — malha por UF presente nas zonas, cor por zona, lista
  de cidades sem polígono.
- `components/FreightRegionForm.component.tsx`, `FreightRegionCityField.component.tsx`,
  `FreightRegionRateGrid.component.tsx`, `FreightRegionImportDialog.component.tsx`,
  `FreightRegionMap.component.tsx` (todos novos).
- `components/FreightRegionPanel.component.tsx` — passa a hospedar botão de criar, importar e o mapa.
- `locales/fleet.locale.json` e `fleet.en.locale.json` — verbetes novos.
- `styles/fleet.module.css` — o SVG do mapa e a legenda; cores da zona por token, nunca literal.

**Fora do módulo**

- A CSP da 046 T008 ganha `https://servicodados.ibge.gov.br` em `connect-src`. É a única mudança
  fora de `fleet/`, e é dependência de ordem: se T008 publicar antes, o mapa quebra ao subir.

## Contratos/API/eventos

Nenhum contrato novo. O que a tela passa a exercer, já publicado pela 045:

| Método   | Rota                      | Permissão         | Corpo                                         | Resposta                              |
| -------- | ------------------------- | ----------------- | --------------------------------------------- | ------------------------------------- |
| `POST`   | `/freight-regions`        | `settings.manage` | `{code, name, cities[], rates[]}` `.strict()` | 201 `{data}`                          |
| `PUT`    | `/freight-regions/{id}`   | `settings.manage` | idem + `expectedVersion`, `status`            | 200 `{data}`                          |
| `DELETE` | `/freight-regions/{id}`   | `settings.manage` | —                                             | 204                                   |
| `POST`   | `/freight-regions/import` | `settings.manage` | `{regions, rates}` texto CSV                  | 200 `{created, updated, deactivated}` |

Destinos externos que a aba passa a usar, ambos `GET` sem credencial e sem dado de pessoa:

- `https://brasilapi.com.br/api/ibge/municipios/v1/{uf}` — já em uso pelo formulário de motorista.
- `https://servicodados.ibge.gov.br/api/v3/malhas/estados/{codigo}` — **novo**.

## Dados, migration e rollback

Nenhum. Sem coluna nova, sem migration, sem `rollback.sql`. A decisão de não guardar `ibge_code`
está registrada na spec, com o custo que ela transfere para a linha importada de CSV.

## Segurança e tenant

- `companyId` continua saindo do contexto autenticado na API; a tela não o envia e não o conhece.
- Escrita guardada por `settings.manage`; sem a permissão a aba mostra tabela e mapa e nenhum botão
  de escrita — o mesmo recorte que a 041 fixou para painel de configuração.
- As duas chamadas externas levam **sigla de UF e nada mais**. Não há PII no caminho do mapa, que é
  o que separa este desenho do `iframe` que o `ADR-0037` removeu.
- `frame-src 'none'` permanece: o mapa é SVG inline, não moldura.
- Nada de `dangerouslySetInnerHTML` com o GeoJSON — o caminho do polígono vira atributo `d` de
  `<path>` montado por código, nunca marcação concatenada.

## Idempotência e concorrência

- `PUT` leva `expectedVersion`; conflito volta como mensagem na tela pedindo recarregar, não como
  erro cru. É o mesmo padrão de veículo e motorista.
- A importação já é idempotente por chave natural na API — reimportar o mesmo arquivo devolve
  `{0, 0, 0}`. A tela só mostra o resumo.
- Toda mutação de zona invalida pela via de `shared/mutationInvalidation.service.ts` quando tocar
  vínculo; zona é cadastro próprio, então basta invalidar a consulta de regiões — e a cobertura do
  motorista, que lê a mesma lista.

## Observabilidade

Nada novo no servidor. Na tela, falha da malha é estado visível ("o desenho não carregou"), não
`console.error` silencioso — e nunca derruba a listagem.

## Estratégia de testes

Contrato antes da implementação, em `apps/frontend-transportada/test/fleet/`, registrado no
`package.json` da app:

- `freight-region-form.contract.ts` — grade de seis classes, classe vazia não vira `rate`, código
  fora do padrão recusado antes do envio, conflito de versão vira mensagem.
- `freight-region-city-entry.contract.ts` — busca e colagem caem na mesma dobra; nome não
  reconhecido volta nomeado e não entra na lista; duplicata dentro da zona é recusada.
- `freight-region-import.contract.ts` — os dois arquivos viram `{regions, rates}` texto e o resumo é
  exibido.
- `freight-region-map.contract.ts` — polígono casa por `codarea`; cidade sem polígono aparece
  nomeada; clicar acrescenta e remove; **falha se `iframe`, `<img>` externo ou `src` de terceiro
  aparecer no componente do mapa**.
- `test/design-system/*` existentes continuam valendo: select, checkbox, ícone, esqueleto, largura.

## Riscos

Os da spec, mais um de ordem: **T008 da 046 e o item de CSP desta spec são a mesma linha**. Se as
duas frentes escreverem a diretiva separadamente, uma sobrescreve a outra. O acordo é T008 publicar
a lista já com `servicodados.ibge.gov.br`, e esta spec só verificar.
