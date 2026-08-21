# ADR 0040 — O CEP vem de casa, e o proxy chega por outro motivo

- Status: aceito
- Data: 2026-08-21
- Decisores: mantenedor do projeto e revisão Opus
- Substitui o item 3 e a parte do item 5 da **ADR-0037** que trata do CEP; os itens 1, 2, 4 e o resto
  do 5 continuam valendo
- Fecha a decisão da spec 050

## Contexto

A ADR-0037 decidiu, há um dia, que a consulta de CEP **fica no navegador** (item 3) e que **não há
proxy na API** (item 5). A leitura era correta e continua sendo: oito dígitos de CEP não são
transferência de endereço residencial, e inverter o fluxo criaria superfície de PII onde não havia
nenhuma.

O que mudou não é o risco — é o pedido. O mantenedor pediu que **toda** busca de CEP consulte primeiro
as nossas tabelas e só depois o provedor externo. Isso não é uma decisão de privacidade com um efeito
funcional; é uma decisão funcional que arrasta o fluxo para dentro. A razão é operacional e não tem
outro lugar onde caber:

- **O dado já está aqui.** Uma transportadora reimporta a mesma praça mês após mês. `nfe_addresses`
  guarda o logradouro de cada participante de NF-e importada, `fleet_drivers` o do motorista,
  `company_fiscal_profiles` o do emitente e `mdfe_manifests` os dois CEPs da lotação. O provedor
  público responde o que a nossa base já sabe.
- **A nossa base sabe mais.** Ela conhece o CEP de rua sem logradouro que o provedor devolve pela
  metade, porque alguém já digitou o resto uma vez, naquela empresa.
- **Consulta local não é consulta a terceiro.** Todo acerto local é uma ida ao provedor que não
  acontece — e é a única forma de reduzir a transferência que a ADR-0037 mediu, em vez de apenas
  declará-la na CSP.

E o navegador não tem como fazer isso: as quatro tabelas são por empresa, o `company_id` vem do
contexto autenticado, e o `fetch` do bundle não fala com o Postgres.

## Decisão

### 1. O CEP passa a ser servido pela nossa API

`GET /postal-codes/{cep}`, `policy: { permission: 'addresses.read', scope: 'company' }`. Resposta
`200 {data: {city, district, state, street}}` com `cache-control: no-store`; ausência é
`404 POSTAL_CODE_NOT_FOUND`; CEP malformado é `400 POSTAL_CODE_INVALID`.

Isto **reverte o item 5 da ADR-0037 para o CEP, e só para ele**. A ADR-0037 rejeitou o proxy como
remédio de privacidade, e continuava certa nesse enquadramento: nenhuma das três coisas que o proxy
prometia resolver existia mais. Ele volta como consequência de precisar ler as nossas tabelas — o que
o navegador não pode fazer —, não como remédio.

### 2. A sugestão tem quatro campos, e nunca `number` nem `complement`

O que a rota devolve é logradouro, bairro, cidade e UF: o que se sabe de um CEP. Número e complemento
são o que localiza **uma pessoa**, e estão nas mesmas tabelas. Projetá-los transformaria uma consulta
de CEP autenticada em consulta de "quem mora aqui" — um usuário com `addresses.read` varreria a base
de motoristas oito dígitos por vez. A ausência é a decisão, não um recorte de conveniência.

### 3. A corrida é entre as nossas tabelas, e completa vence parcial

Cinco consultas em paralelo (as duas colunas do MDF-e contam separado), `company_id` no `where` de
**cada** uma. `Promise.race` cru é o erro a evitar: ele resolve com a primeira a terminar, que
costuma ser a origem que não achou nada. Quem ganha é a primeira sugestão **completa**; as parciais
(só UF, o que o CEP de município devolve) ficam guardadas e só respondem se o provedor externo também
falhar.

Depois da base, BrasilAPI e ViaCEP em sequência. Se ninguém souber, **o operador digita**: `404` não
desabilita campo, não limpa o que já está lá e não bloqueia envio. Não achar CEP nunca foi motivo
para não cadastrar motorista.

### 4. O que continua saindo do navegador

Encolhe, não zera:

| Destino                    | O que viaja                    | Por quê fica                                            |
| -------------------------- | ------------------------------ | ------------------------------------------------------- |
| `photon.komoot.io`         | o termo que o operador digitou | busca textual de rua; ADR-0037, item 2                  |
| `servicodados.ibge.gov.br` | a sigla da UF                  | malha de município do mapa da zona; geometria pública   |
| `brasilapi.com.br`         | CNPJ consultado, sigla da UF   | cadastro por CNPJ e lista de municípios — **não o CEP** |

`viacep.com.br` **sai** do `connect-src`: era destino só de CEP. `brasilapi.com.br` fica pelo que
ainda busca do navegador, e é por isso que a task da spec pedia as duas fora e só uma saiu.

### 5. A rota externa sobe sem limitador, e isto é achado, não detalhe

A ADR-0037 avisou: o proxy "pediria um limitador de taxa que esta API não tem". O aviso valia e
continua valendo — a rota é autenticada e por empresa, mas um cliente em laço dispara uma chamada
externa por requisição, com a nossa infraestrutura como origem. Não há limitador nesta API (dois
achados abertos em `docs/SECURITY.md` são a falta dele). Isto entra em `docs/SECURITY.md` como achado
datado, com o que já limita o estrago: só chega ao provedor o que a base não sabe, o debounce da tela
continua, e a rota exige token com `addresses.read`.

### 6. A colisão com a ADR-0039 fica registrada, e não se resolve aqui

A ADR-0039 decidiu criptografar o endereço do motorista **porque ninguém o lê**. Agora alguém lê:
`fleet_drivers` é uma das cinco origens da corrida, pelo índice `(company_id, postal_code)` que a
spec 050 acrescentou. As duas decisões não se contradizem, mas a ordem de execução passou a importar,
e quem executar a 0039 tem três saídas — nenhuma escolhida aqui, porque a 0039 não foi executada:

1. **Índice cego para o CEP**, como a 0039 já decidiu para a CNH: HMAC do CEP com a chave da
   aplicação, e a busca por igualdade continua possível dentro do envelope. É a saída coerente com o
   resto da ADR; custa uma coluna e a nova origem passa a devolver `street` e `district` só depois de
   abrir envelope.
2. **`postal_code` fora do envelope**, com logradouro e bairro dentro. O CEP sozinho é a informação
   pública; o que localiza a pessoa é o resto.
3. **Sair da corrida.** `fleet_drivers` deixa de ser origem local e as outras quatro respondem. É a
   saída mais barata e a que perde justamente a tabela onde o formulário de motorista mais acertaria.

## Consequências

- **A transferência ao provedor de CEP encolhe de verdade.** Toda praça já importada responde de
  casa. É o primeiro item do achado da ADR-0037 que diminui por medida, e não por declaração.
- **Nasce uma rota nossa que chama terceiro sem teto.** Achado novo, aberto no mesmo commit em que a
  metade do achado antigo fecha. O saldo é positivo e não é gratuito.
- **A CSP fica com um destino menos**, e o contrato ganhou a direção que faltava: origem que o bundle
  deixou de buscar agora reprova a diretiva, no caso novo de
  `test/shared/content-security-policy.contract.ts`. Antes ele só cobrava o inverso, então origem
  órfã ficava para sempre.
- **Três formulários passam a consultar com o mesmo hook** — motorista, empresa e lotação do MDF-e —,
  e o de carregamento do MDF-e consulta **sem ter onde escrever**: o status diz se o CEP existe, e é
  isso que ele entrega. Campo que ninguém soube preencher fica como está.
- **A ADR-0039 ficou mais caro de executar**, e o preço está no item 6 em vez de ser descoberto por
  quem for executá-la.
- Se um dia a base local passar a ser a única fonte — provedor externo fora, cache nosso —, a decisão
  a tomar é sobre atualização de logradouro, que é dado que muda. ADR nova.
