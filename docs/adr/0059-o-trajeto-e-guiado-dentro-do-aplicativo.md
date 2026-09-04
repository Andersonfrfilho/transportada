# ADR-0059 — O trajeto é guiado dentro do aplicativo

- **Data:** 2026-09-03
- **Estado:** aceita
- **Contexto:** **reverte a ADR-0045 §8**, que decidiu delegar a navegação ao mapa do aparelho.
  Depende da **ADR-0058** (é o "iniciar trajeto" que abre o guia) e da **ADR-0056** (o app nativo).

## Contexto

A ADR-0045 §8 dizia: _"construir navegação própria é competir com o Google Maps para entregar uma seta
pior"_. O argumento continua verdadeiro sobre a **seta**, e é falso sobre a **viagem**.

Delegar significa sair do produto a cada parada. O motorista toca "abrir no mapa", troca de
aplicativo, navega, chega, volta, procura a parada de novo, confirma. Numa viagem de dez paradas são
vinte trocas de contexto, e cada volta é uma chance de ele confirmar a entrega na parada errada — o
app que ele reabre não sabe onde ele esteve.

E há o que o mapa de terceiro não tem: a **ordem do roteiro**, a **janela de entrega**, o
**agendamento com protocolo** e as notas de cada parada. O Google Maps leva a um endereço; ele não
sabe que aquela é a parada 2 de 4, que a janela fecha às 12h, nem que ali descem três notas.

O usuário decidiu construir o guia interno com esse argumento, depois de a alternativa da §8 ter sido
apresentada e recusada. Esta ADR registra a decisão e o preço dela, para a próxima pessoa não
redescobrir os dois.

## Decisão

### 1. O guia é nosso, e a curva a curva também

"Iniciar trajeto" (ADR-0058) abre a tela de guia dentro do app: a instrução da próxima manobra, o
traçado no mapa, a posição com direção, e — na mesma tela — a parada, a janela e **"Cheguei na
parada"**. O motorista não sai do produto entre sair do galpão e confirmar a entrega.

O mapa continua **desenho nosso**, sem tile de terceiro: a decisão da ADR-0037 não é revertida aqui.

### 2. O que isto custa, escrito antes de doer

Três coisas que o produto não tem e passa a precisar:

1. **Malha viária roteável e trânsito ao vivo.** Nenhum dos dois é nosso, e todo provedor cobra por
   rota calculada — a conta cresce com a frota, não com a receita.
2. **Voz.** Guia sem voz obriga a olhar a tela dirigindo, o que é pior que delegar.
3. **Recálculo sem rede.** O app inteiro foi desenhado para funcionar sem sinal (ADR-0045 §5), e um
   guia que emudece na sombra é o guia falhando exatamente onde o motorista está sozinho.

### 3. A delegação continua existindo, e é a saída

**"Abrir no mapa do aparelho" não sai do produto.** Ela é a resposta a todos os casos em que o guia
interno não serve: provedor fora do ar, rota que ele não calcula, sem rede para recalcular, e o
motorista que simplesmente prefere o Waze. Um guia próprio sem essa saída transforma cada falha nossa
em caminhão parado.

### 4. O guia não decide a ordem das paradas

Ele guia até a **próxima parada do roteiro**, e o roteiro é o que o escritório despachou. Reordenar
continua bloqueado depois de `dispatched` (ADR-0043), e recalcular continua sendo `trip.manage`.
Guiar não é replanejar, e misturar as duas coisas daria ao guia uma permissão que o motorista não tem.

## Consequências

- O motorista deixa de sair do produto a cada parada, e a confirmação de entrega acontece no mesmo
  lugar em que ele acabou de chegar.
- O guia passa a mostrar o que o mapa de terceiro nunca soube: ordem, janela, agendamento e notas.
- **O custo recorrente entra no produto**: um provedor de roteirização por chamada, para sempre.
- **O que não muda:** o mapa continua nosso, a ordem do roteiro continua do escritório, e a delegação
  ao mapa do aparelho continua na tela.
- **O risco assumido:** um guia pior que o Google Maps usado por obrigação é pior que a delegação. A
  saída da §3 é o que impede isso de virar caminhão parado — ela não é opcional.

## Alternativas descartadas

| Alternativa                              | Por que não                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Manter a delegação da ADR-0045 §8        | Vinte trocas de contexto por viagem, e o app que ele reabre não sabe onde ele esteve.                 |
| Guia interno **sem** a saída para o mapa | Toda falha de provedor vira caminhão parado. A saída é o que torna a decisão reversível na prática.   |
| `WebView` com um mapa de terceiro dentro | Traz tile de terceiro de volta, que a ADR-0037 tirou, e não resolve o recálculo sem rede.             |
| Embarcar a malha viária no aplicativo    | Resolve o offline e cria um problema maior: malha desatualizada guiando por rua que mudou de sentido. |
| Deixar o guia reordenar paradas          | Dá ao campo uma permissão de escritório, e desfaz o congelamento do roteiro da ADR-0043.              |
