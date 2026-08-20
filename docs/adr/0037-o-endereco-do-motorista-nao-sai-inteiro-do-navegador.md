# ADR 0037 — O endereço do motorista não sai inteiro do navegador, e não há proxy

- Status: proposto
- Data: 2026-08-20
- Decisores: mantenedor do projeto e revisão Opus
- Fecha a decisão 1 da spec 046 (T007) e destrava a CSP (T008)

## Contexto

O achado de 2026-08-20 em `docs/SECURITY.md` diz que o endereço residencial do motorista sai do
navegador do operador para quatro provedores públicos sem contrato, na query string, e que não há CSP
em lugar nenhum do repositório. O achado apresentava o proxy na API como remédio: "resolve as três
coisas de uma vez — um destino só no CSP, `User-Agent` identificável, teto de 1 req/s compartilhado".

Lendo `fleet/shared/driverAddress.service.ts` campo por campo, **não é um trilho só, são quatro com
exposição muito diferente**:

| Chamada            | O que viaja                                     | Quem recebe                              |
| ------------------ | ----------------------------------------------- | ---------------------------------------- |
| `lookupPostalCode` | **oito dígitos de CEP**, nada mais              | BrasilAPI, ViaCEP (`Promise.any`)        |
| `searchAddress`    | o termo que o operador digitou                  | Photon, Nominatim (`Promise.allSettled`) |
| `locateAddress`    | **o endereço já resolvido**, remontado em texto | Photon, Nominatim                        |
| `buildMapEmbedUrl` | latitude e longitude da residência              | `openstreetmap.org`, em `iframe`         |

A consulta de CEP não manda endereço de ninguém: manda um CEP. O provedor aprende que alguém
consultou um logradouro público, e não tem a quem ligar isso — nome, CPF e telefone ficam na tela.
Tratar essa chamada como transferência de dado pessoal é inflar o achado.

O que infla de verdade é `locateAddress`, e ela existe **por causa do mapa**: o ViaCEP não devolve
coordenada e ganha a corrida metade das vezes, então, para o mapa não aparecer conforme o sorteio, o
código remonta `rua, bairro, cidade, UF` e manda de volta ao geocodificador. É esse passo que
transforma "consultei um CEP" em "publiquei o endereço residencial de uma pessoa física" — e ele não
preenche campo nenhum do formulário. O formulário já estava preenchido quando ele roda.

E o `iframe` do OpenStreetMap é a única coisa aqui que carrega **coordenada de residência** mais
`Referer` da instalação do cliente, num contexto de terceiro com script e cookie próprios.

Sobre o Nominatim há um fato que não é ponderável: a política de uso pede `User-Agent` identificável,
e `User-Agent` é cabeçalho proibido ao `fetch` do navegador. Não é risco a medir, é termo que não
temos como cumprir de dentro da página. Debounce não é teto de taxa.

## Decisão

### 1. O mapa sai, e com ele a geocodificação de confirmação

Saem `buildMapEmbedUrl`, `locateAddress`, `GeoPoint`, o campo `point` de `AddressSuggestion`,
`toPoint`, `toCoordinate`, `MAP_SPAN_DEGREES`, `LOCATE_DEBOUNCE_MS` e o `iframe` de
`DriverAddressFields.component.tsx`.

O mapa custava o pior do achado — frame de terceiro, coordenada de residência, `Referer` da
instalação, e uma segunda ida ao geocodificador com o endereço inteiro — para entregar conferência
visual num formulário onde ninguém entrega nada. Endereço de motorista serve a contrato de agregado e
a MDF-e, não a rota de entrega.

### 2. O Nominatim sai; o Photon fica como único provedor de busca textual

Não por risco, por termo de uso: a política pede o que o navegador não deixa mandar. Serviço usado
contra os termos dele não é trade-off, é coisa que não se faz. O Photon continua respondendo prefixo
de rua, que é o que a busca textual precisa; o número da casa, que era o que o Nominatim acrescentava,
o operador digita — ele tem o documento na mão.

`searchAddress` continua com `Promise.allSettled` e uma lista só: provedor fora do ar entrega menos
resultado, nunca erro de tela.

### 3. A consulta de CEP fica no navegador, com os dois provedores

Oito dígitos, sem identificador, contra dois endpoints publicados exatamente para isso. `Promise.any`
fica: é o que faz a tela funcionar com um dos dois fora do ar.

### 4. A lista de municípios do IBGE fica

Manda a sigla do estado. Não é dado pessoal, e é o que impede "Sao Paulo", "S. Paulo" e "SÃO PAULO"
de virarem três cidades no relatório.

### 5. Não há proxy na API

Rejeitado, e é a parte desta ADR que contraria o remédio sugerido no achado. Hoje o endereço **não
passa pela nossa infraestrutura** a caminho do terceiro: a requisição parte do navegador do operador.
O proxy inverte isso — passamos a receber, encaminhar e ter a chance de logar endereço residencial,
ganhando uma superfície de PII onde não existe nenhuma. Ele também pediria um limitador de taxa que
esta API não tem (dois achados abertos em `docs/SECURITY.md` são exatamente a falta dele) e um cache
de CEP que ninguém pediu.

Depois dos itens 1 e 2, as três coisas que o proxy resolveria de uma vez não existem mais: o CSP tem
três destinos estáveis, o `User-Agent` só era exigido pelo provedor que saiu, e o teto de 1 req/s era
a política dele.

### 6. A CSP publicável fica curta, e sem `frame-src`

Esta ADR destrava a T008 com a lista fechada:

```
connect-src 'self' https://brasilapi.com.br https://viacep.com.br https://photon.komoot.io
frame-src 'none'
```

`frame-src 'none'` é consequência do item 1 — a diretiva mais forte que existe, e ela só é possível
porque o mapa saiu: **o `iframe` do mapa é o único do bundle**. O `KeycloakAuthProvider` sobe com
`checkLoginIframe: false`, então a checagem silenciosa de sessão não usa frame nenhum; o que sobra
dele é `connect-src` para a origem do Keycloak da instalação (`VITE_KEYCLOAK_URL`, troca de token),
que a T008 acrescenta onde a CSP for montada.

## Consequências

- **O operador perde a conferência visual do endereço.** É a perda real desta decisão, e é o item que
  o mantenedor pode rejeitar isoladamente: manter o mapa exige aceitar o `iframe` de terceiro e o
  `frame-src` que o acompanha, e devolver `locateAddress` junto — sem ela o mapa volta a aparecer por
  sorteio de provedor.
- **A busca por nome fica um pouco mais fraca** (sem o número da casa do Nominatim), e o campo de
  número passa a ser sempre digitado. O CEP continua sendo o caminho rápido.
- **O achado de `docs/SECURITY.md` encolhe em vez de fechar.** Depois desta ADR e da T008 sobra a
  transferência do termo digitado a um provedor sem contrato — que continua precisando de inventário
  de tratamento. Sobra menos, e com CSP.
- **Menos código:** três exports, um tipo, quatro funções auxiliares, um debounce e um `iframe`. O
  contrato que a T008 pedir passa a poder afirmar `frame-src 'none'`, que é verificável.
- Se um dia o produto quiser mapa de verdade — rota, geocerca, rastreamento —, a decisão a tomar é
  provedor contratado com chave e DPA, não `iframe` público. Voltar atrás é ADR nova.
