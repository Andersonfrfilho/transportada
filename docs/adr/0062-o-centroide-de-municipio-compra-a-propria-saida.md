# ADR 0062 — O centroide de município compra a própria saída, uma vez por endereço

- Status: aceito
- Data: 2026-09-05
- Decisores: mantenedor do projeto e revisão Opus
- **Revoga em parte o adendo de 2026-09-01 da ADR-0044**: a escalada automática para o provedor pago
  deixa de ser recusada, dentro do recorte estreito descrito aqui
- Depende da **ADR-0061**, cuja medição é a evidência que torna esta decisão barata
- **Não revoga** `worker-transportada/test/routing/paid-provider-never-called.contract.ts`: a
  sugestão de roteiro continua fazendo zero chamadas pagas

## Contexto

A escada do adendo de 2026-09-01 tem três degraus: CEP grátis, provedor pago por marca humana, pino
manual. Ela recusou a escalada automática com um argumento que continua válido no geral — _"mede a
coisa certa e gasta sem ninguém decidir"_ — e a trancou com contrato de teste.

O que mudou é que a marca humana **não é alcançada** pelo caso que mais precisa dela.

Uma parada em precisão `city` é o centroide do município: palpite de ~8 km, marcado na tela como
"Posição aproximada — só o município é conhecido, o ponto é o centro dele", e **fora da otimização
automática** (ADR-0044 §5). Ela não estraga o roteiro; ela sai dele. E é aí que o degrau 2 nunca
chega: o botão de marcar vive no painel de sugestão, por parada, e a parada que interessa é
justamente a que o solver não ordenou. Quem confere um roteiro olha a sequência que o solver propôs;
a lista das que ficaram de fora é a que ninguém abre.

O resultado medido é uma população que só encolhe quando alguém roda um script à mão: em 2026-09-04,
149 endereços em centroide, reduzidos a 15 pelo lote da ADR-0061 — e nenhum deles tinha sido marcado
por um humano em nenhum momento.

## Decisão

**Endereço guardado em precisão `city` é escalado ao provedor pago automaticamente, uma vez.**

### 1. Uma chamada por endereço, para sempre — e é isso que torna o gasto conhecido

`geocoded_addresses` ganha `paid_refined_at`. A rotina seleciona `precision = 'city' and
paid_refined_at is null`, e **carimba a coluna qualquer que seja o resultado** — inclusive quando o
provedor não melhorou nada.

Essa é a diferença entre esta decisão e a que a 0044 recusou. A escalada por colisão que ela avaliou
não tinha teto: as mesmas paradas colidiriam de novo na sugestão seguinte, e a conta correria com o
uso. Aqui o gasto é **o tamanho da população, uma vez** — hoje 15 endereços — e decai a zero conforme
a base satura, que é exatamente o raciocínio com que a §3 justificou hospedar a matriz e **não**
hospedar o geocodificador.

Endereço que o provedor não melhorou não volta. Se for preciso tentar de novo — provedor melhorou a
cobertura, o cadastro foi corrigido — é `update geocoded_addresses set paid_refined_at = null`, uma
decisão deliberada de quem tem acesso ao banco, nunca um efeito de outro código.

### 2. A rotina é do worker, e a sugestão continua sem tocar em provedor pago

Rotina agendada `geocoding.refine`, ao lado de `geocoding.backfill`. **Não** é um degrau novo dentro
da cascata da sugestão, e o contrato que prova isso fica intacto.

O motivo é o mesmo pelo qual `geocoding.backfill` existe: adiantamento. Quando a sugestão pedir a
coordenada, ela já está boa em base — e a sugestão continua sendo uma função que não gasta, o que
mantém verdadeira a frase que o conferente precisa poder acreditar ("pedir roteiro não custa nada").

Pôr a chamada paga dentro da sugestão traria de volta o problema que a 0044 nomeou: o gasto passaria
a ser função de quantas vezes alguém aperta o botão.

⚠️ Consequência de configuração: `GOOGLE_MAPS_API_KEY` passa a existir **também no worker**. Sem ela
a rotina **não é registrada** e a janela dela pousa em `job_run_routine_missing`, como
`fuel.price.pull` faz com as agências — serviço que não existe não pode reciclar mensagem para
sempre.

### 3. O que o provedor devolve passa pelo mesmo portão de sempre

Só substitui o que é **mais fino que `city`**, e a pergunta é literalmente essa — não a ordenação
completa de precisão do degrau 2 manual. O worker não ganha cópia de `shouldReplaceStored`: a
ordenação continua morando só na API (adendo 2026-09-01 da ADR-0044), porque aqui o que está em base
é sempre `city`, e "é melhor que `city`?" já existe como `isOptimizablePrecision`.

`APPROXIMATE` do Google vira `city` e não é melhoria — é o mesmo centroide por dinheiro. Correção
manual **sempre vence**: `source = 'manual'` não é sequer selecionado, e não custa uma chamada; a
escrita repete a condição no `where`, porque entre a leitura e a compra cabe o pino de um humano.

⚠️ **Diferença declarada em relação ao lote da ADR-0061:** aquele recusa a escrita quando o provedor
devolve outro município, conferido pelo código IBGE. Esta rotina **não** faz essa conferência — o
gateway não lê `address_components` —, e o que a protege é o filtro `components=postal_code` na
consulta. É uma proteção mais fraca, e está aqui escrito para quem for endurecê-la saber que é
trabalho novo, não um descuido.

### 4. Quando o provedor também não acha, a parada fica no centroide, marcada

Nada muda no comportamento de falha: `city` continua sendo o que está guardado, a parada continua
marcada na tela e fora da otimização. O que muda é que ela deixou de ser uma pendência invisível —
`paid_refined_at` preenchido com a precisão ainda em `city` é **exatamente a lista** que precisa de
pino manual, e é dela que a tela de pendências (§5) se alimenta.

Essa distinção não existia: antes, "ninguém tentou" e "tentamos e não deu" eram o mesmo estado.

### 5. A pendência entra no relatório que já existe, e ele passa a se chamar pelo que faz

⚠️ **Esta seção foi decidida ao contrário e corrigida no mesmo dia.** A primeira versão dava tela
própria à pendência, com o argumento de que ela é trabalho interno de quem monta roteiro — "a ação é
arrastar um pino, não escrever para alguém".

O argumento estava errado sobre **este** caso. Um endereço que o provedor pago, recebendo logradouro,
número, bairro, cidade e UF, ainda assim não localizou, não é um pino que alguém esqueceu de arrastar:
é cadastro errado na origem. A ação é a mesma dos outros achados — pedir ao cliente que atualize —, o
público é o mesmo, o agrupamento é o mesmo (por quem **emitiu** a nota, ADR-0057) e a permissão é a
mesma. Duas telas respondendo à mesma pergunta divergiriam, e a segunda seria a que ninguém abre.

Então a pendência vira um `AddressFindingKind` novo — `coordinate_unresolved`, o **mais grave** da
lista, porque é o único em que a carga não sabe para onde ir; os outros cinco são cadastro feio com
entrega boa. E a tela passa a se chamar **"Clientes que precisam de atualizações"**, que é o que ela
sempre fez e não dizia.

Três consequências de detalhe que não se deduzem do código:

- **A linha não passa pelo classificador.** Ela tem `matchLevel: not_found` e rua do provedor vazia,
  que é exatamente o que `resolveAddressFinding` chamaria de `street_unknown` — e são coisas
  diferentes: ali o provedor conhece o município e não a rua; aqui ele não pôs a carga em lugar
  nenhum.
- **Ela não tem lado do provedor na tela.** A rotina guarda o carimbo, nunca o que o provedor
  respondeu; imprimir "o provedor conhece: não conhece este logradouro" afirmaria o que não foi
  medido. No lugar vai para onde a entrega aponta hoje.
- **`paid_refined_at` nulo não aparece.** "Ninguém tentou ainda" é fila nossa, e anunciá-la mandaria
  o operador cobrar cadastro que a próxima janela pode resolver sozinha.
- **O denominador soma as duas origens** — medições do lote e tentativas da rotina —, porque as duas
  custaram uma consulta ao provedor, e é isso que o número promete. Sem denominador, "24 pedidos" é
  uma acusação; com ele, é um pedido.

⚠️ `geocoded_addresses` **não tem tenant** (ADR-0044 §3). O recorte por empresa vem do mapa de
`addressKey` → nota, que sai de `nfe_addresses` já filtrado por `company_id`: chave que a empresa
nunca viu não casa, e a linha não entra. Sem isso o relatório de uma empresa listaria endereço de
outra.

## Consequências

- Gasto novo, único e limitado pela população: hoje ~15 endereços, e cada endereço custa no máximo
  uma chamada na vida.
- `geocoded_addresses` ganha uma coluna, e a semântica dela é **"já gastamos por este"**, nunca "já
  tentamos" — é o que impede alguém de zerá-la num backfill achando que é cache.
- A exceção de licença da ADR-0044 §3 continua assumida por escrito, e passa a cobrir um punhado de
  linhas a mais.
- A tela do relatório de endereços muda de nome e ganha um sexto tipo de achado; a aba fica curta
  ("Clientes a atualizar") e o título carrega o nome por extenso, porque tab longa quebra a faixa no
  celular.
- A escalada automática deixa de ser proibida **neste recorte e só nele**. Escalada por colisão,
  escalada por marca de qualidade e escalada dentro da sugestão seguem recusadas, e o contrato da
  sugestão continua provando a última.
