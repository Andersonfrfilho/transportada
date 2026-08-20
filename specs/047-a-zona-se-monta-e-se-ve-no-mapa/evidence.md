# 047 — Evidências

## T001 — Contrato do formulário de zona

Vermelho registrado antes da implementação:

```
error: Cannot find module '../../src/modules/fleet/shared/freightRegionForm.service'
 0 pass · 1 fail · 1 error
```

Verde depois de `shared/freightRegionForm.service.ts` e `shared/regionCityName.service.ts`:

```
bun test ./test/fleet/freight-region-form.contract.ts
 11 pass · 0 fail · 17 expect() calls
```

Suíte da frota inteira e typecheck da app:

```
bun run typecheck                      → tsc --noEmit, sem saída
bun test ./test/fleet.contract.test.ts → 220 pass · 0 fail · 3339 expect() calls
```

O contrato fixa o que a tela **não** manda para a API: célula vazia e célula zerada não viram linha
de preço — a mesma regra do parser de importação (`if (Number(value) === 0) continue`), que é o que
faz a coluna UTILITÁRIO da tabela real do cliente ficar fora do banco em vez de entrar como viagem
de graça. E fixa que o corpo tem exatamente `cities`, `code`, `name`, `rates`: o `strict()` de
`createRegionSchema` recusa qualquer chave a mais, e `status`/`expectedVersion` só existem no `PUT`.

## T002 — Cliente HTTP

**Vermelho** — `bun test ./test/fleet/freight-region-write.contract.ts`

```
TypeError: client.importFreightRegions is not a function.
 0 pass
 6 fail
```

**Verde** — mesmo comando

```
 6 pass
 0 fail
 16 expect() calls
```

**Suíte da frota** — `bun test ./test/fleet.contract.test.ts`

```
 226 pass
 0 fail
 3355 expect() calls
```

**Typecheck** — `bun run typecheck` (`tsc --noEmit`) sem saída.
**Lint** — `bun run lint` (`eslint .`) sem achado.
**Formato** — `bun run format:check` na raiz: _All matched files use Prettier code style!_

### O que a implementação obrigou a mexer

- `authorizedRequest` passou a aceitar `DELETE`, e `requestJson` ganhou o caminho de **corpo
  vazio**: `DELETE /freight-regions/{id}` responde `204` com `new Response(null, …)`, e o
  `JSON.parse` incondicional derrubava o apagar que tinha dado certo. Corpo vazio com resposta
  não-ok continua sendo `FLEET_REQUEST_FAILED`.
- `freightRegionFromApi` e `freightRegionImportSummaryFromApi` entraram em
  `fleetResponse.validation.ts`; o resumo é guardado por `hasOnlyKeys`/`hasEveryKey` mais
  `isUnsignedIntegerNumber`, então `{created: '29'}` é recusado como `FLEET_RESPONSE_INVALID`.
- `expectedVersion` e `status` só saem no `PUT`. O `POST` manda exatamente
  `['cities','code','name','rates']` — o `strict()` da rota recusaria o resto.

## T015 — Fechamento

### A tabela do cliente sobe pela tela, não pelo script

Antes da 047 o único caminho para a planilha do cliente entrar era
`scripts/freight-region-import.py` — terminal, `--dry-run` por padrão, token na mão de quem roda.
Agora o operador com `settings.manage` escolhe os dois arquivos no diálogo da aba **Regiões** e o
mesmo `POST /freight-regions/import` recebe `{regions, rates}` como texto. O script continua
existindo e continua servindo (carga inicial de ambiente, repetição em CI), mas deixou de ser o
único caminho.

O que os contratos fixam desse caminho (`test/fleet/freight-region-import.contract.ts`, 9 testes):

```
os dois arquivos viram {regions, rates} como texto
o texto do arquivo não é reescrito no caminho
arquivo de rotas faltando bloqueia o envio antes do 400
arquivo de valores faltando bloqueia o envio antes do 400
arquivo escolhido mas em branco conta como faltando
o rascunho vazio nasce sem arquivo e sem nome
a importação abre em diálogo e a lógica mora no hook
o resumo mostra criadas, atualizadas e inativadas
os verbetes existem nos dois idiomas
```

"O texto do arquivo não é reescrito no caminho" é o que importa aqui: a tela entrega o CSV **byte a
byte** como o cliente exportou, então quem decide o que é linha válida continua sendo o parser da
API — o mesmo que o script aciona. Duas telas não podem discordar de qual célula zerada vira preço.
E o resumo `{created, updated, deactivated}` é o que devolve ao operador o que o `--dry-run` do
script mostrava no terminal: reimportar o mesmo arquivo dá `{0, 0, 0}`.

### O desenho fecha

O mapa é SVG nosso, sem `iframe`, sem imagem remota e sem HTML cru — ao contrário do endereço do
motorista, que é `iframe` do OpenStreetMap. A malha vem da API de malhas do IBGE por UF, na
qualidade mínima, recortada por município, e o destino está no `connect-src` publicado
(`test/shared/content-security-policy.contract.ts` varreria a origem nova e falharia sem isso).

`test/fleet/freight-region-map.contract.ts` — 27 testes. Os que provam que o desenho fecha:

```
cada município vira um caminho fechado, com o código da malha
o município com mais de um anel continua sendo um só
o polígono casa com a cidade da zona pelo codarea
município sem zona é desenhado em branco, não escondido
a cidade casa pela dobra, não pela grafia
cidade sem polígono aparece nomeada fora do mapa
cidade em duas rotas é desenhada uma vez, com as duas rotas nomeadas
rota inativa não pinta e não vira aviso
clicar num município com zona em edição acrescenta e remove
a grafia gravada manda: clicar de novo remove mesmo com a dobra diferente
a cor da zona vem dos tokens do tema, nunca de literal
o mapa é desenho nosso, sem iframe, imagem remota ou html cru
```

Fecha em dois sentidos. **Geométrico:** a malha do IBGE traz município com ilha e com enclave, e
`MultiPolygon` de vários anéis vira **um** caminho — desenhar anel por anel deixaria a mesma cidade
pintada em duas cores quando a zona mudasse. **De cobertura:** cidade gravada na zona que não tem
polígono na malha (grafia que o IBGE não reconhece, cidade de outra UF) **não desaparece** — ela é
nomeada fora do mapa, porque zona que se vê pela metade é pior que zona que se vê inteira com um
aviso ao lado. E o casamento é pela dobra (`normalizeVehicleCatalogName` da frota), não pela grafia:
`BARRINHA/SP` da planilha do cliente casa com `Barrinha` do IBGE.

O clique fecha o ciclo da 047: com uma zona aberta no formulário, clicar no município acrescenta a
cidade à zona e clicar de novo a retira — e retira **pela grafia gravada**, não pela do IBGE, senão
a cidade importada seria impossível de desmarcar.

### Permissão

Aqui a 047 desfez uma escolha da 045. A 045 escondia a aba inteira sem `settings.manage`; a aba
escondida não podia mostrar tabela nem mapa a quem só lê a frota. O contrato foi corrigido antes do
código (`test/fleet/regions-tab.contract.ts`), e a API já dizia o mesmo — ler região é `fleet.read`,
porque a cobertura é o que o formulário de motorista consulta:

```
a aba de regiões abre para quem lê a frota, e a escrita é que pede settings.manage
a consulta da tabela sobe pela aba aberta, sem pedir permissão de escrita
o painel hospeda criar, importar e o mapa
sem settings.manage o painel não desenha ação de escrita
com uma zona em edição o mapa recebe as cidades do formulário
```

Sem a permissão sobram tabela e mapa: `onEdit` ausente e `FreightRegionList` não desenha nem o `th`
nem o `td` da ação, e `FreightRegionWriteActions` devolve `null` antes dos dois botões.

### Locales

430 chaves, e as duas línguas com **exatamente** o mesmo conjunto — nenhuma só em pt-BR, nenhuma só
em en. Toda chave literal `t('…')` dos 32 arquivos do módulo resolve nos dois idiomas.
`test/shared/locale-accents.contract.ts` verde: o pt-BR vai acentuado.

O `regions.emptyHint` foi reescrito. Ele prometia que "a tabela de frete entra pela importação de
regiões, não pelo cadastro linha a linha" — deixou de ser verdade quando o formulário nasceu na
T003, e vazio que ensina o caminho errado é pior que vazio que não ensina nada.

### Gates

Recorte do módulo:

```
bun test ./test/fleet.contract.test.ts                → 281 pass · 0 fail · 3886 expect()
bun test design-system + shared + company-settings    → 414 pass · 0 fail · 1195 expect()
bun test os quatro contratos da 047                   →  62 pass · 0 fail ·  251 expect()
```

`make check` na raiz — `exited with code 0`:

```
format:check                        All matched files use Prettier code style!
lint · typecheck                    sem achado, sem saída
api-transportada                     490 pass · 0 fail ·  1151 expect() · 59 arquivos
worker + cron                        196 pass · 0 fail ·   358 expect() ·  8 arquivos
frontend-transportada               1560 pass · 0 fail ·  9657 expect() · 18 arquivos
build (api · worker · cron · front)  4/4, PWA com 12 entradas de precache
```

O aviso de chunk acima de 500 kB no `vite build` é anterior à 047 e não mudou de natureza: o mapa
não trouxe dependência nova — a malha do IBGE é `fetch` e o desenho é SVG nosso.
