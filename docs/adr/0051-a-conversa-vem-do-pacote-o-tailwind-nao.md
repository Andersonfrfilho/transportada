# ADR-0051 — A tela de conversa vem do pacote, e o Tailwind não vem junto

- **Status:** aceito
- **Data:** 2026-08-29
- **Contexto:** spec 062, T007. Depende da ADR-0003 do `adatechnology-packages`.

## Contexto

A T007 põe o `ConversationsWorkspace` no painel. A skill `adatechnology-ui` é explícita: consome-se a
tela composta inteira, e a página do produto fica em 30–170 linhas de fiação — remontar o grid à mão é
o que fez as telas divergirem entre os produtos, e é rejeitado em code review.

Só que o `frontend-transportada` não tem Tailwind. Ele tem design system caseiro em
`src/components/ui/`, tokens em `:root`, `*.module.css` por módulo, e uma dúzia de contratos que
proíbem `<select>` nativo, `<svg>` cru, `max-width` e altura de controle fora dos tokens.

O levantamento mediu o que o pacote exige:

|                                                |                                                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `className` nos componentes                    | **822**, em 62 componentes                                                                          |
| já usando a camada `.cv-*`                     | **108 (13%)**                                                                                       |
| o resto                                        | utilitárias Tailwind — `px-6`, `flex`, `grid-cols-2`, `dark:border-gray-700`                        |
| `ConversationsTheme`                           | **6 campos, todos de cor**, mapeados para `--cv-primary`, `--cv-bg`, `--cv-bubble-*`, `--cv-text-*` |
| `getThemeClass(defaultClass, themeKey, theme)` | existe e é chamado **0 vezes**                                                                      |
| Tailwind em `peerDependencies`                 | **ausente**                                                                                         |

Três leituras saem daí. A primeira: **tema e Tailwind são independentes** — os 6 tokens entregam a cor
e nada mais, então nenhum ajuste de tema dispensa o Tailwind. A segunda: a exigência é **real e não
declarada**, o que é defeito de empacotamento do pacote, não escolha desta app. A terceira, a que
decide: o `@adatechnology/notification-ui`, irmão no mesmo monorepo, usa classes próprias em BEM
(`adn-preferences__*`), não declara relação com Tailwind, e **já roda nesta app hoje**. O padrão que
funciona aqui existe e está validado ao lado.

## Decisão

**O `frontend-transportada` não adota Tailwind.** O pacote termina a camada `.cv-*` que ele já começou
(ADR-0003 do `adatechnology-packages`), e esta app consome as telas como consome o `notification-ui`:

1. Importa `@adatechnology/conversations-ui/styles.css` uma vez, no módulo que hospeda a conversa.
2. Alimenta os seis `--cv-*` a partir dos nossos `--color-*`, para a cor da tela ser a do produto.
3. Onde o layout precisar divergir, sobrescreve a regra `.cv-*` num `*.module.css` do módulo — o
   mecanismo que todos os módulos desta app já usam.
4. Vocabulário por `labels`, montado dos nossos `*.locale.json`; regra de negócio por callback; e
   capacidade opcional **por ausência de prop**, nunca por flag `hasX`.

A T007 fica **bloqueada** até o pacote publicar a versão com a camada fechada. Implementar a tela
antes disso significaria consumir um pacote que não se estiliza aqui, e a única saída seria remontar o
grid à mão — exatamente o que a skill proíbe.

## Consequências

- A tela de conversa passa a se estilizar sozinha, sem depender do build do host. Isso vale para os
  três produtos, não só para este.
- Os `.cv-*` viram superfície de API do pacote: renomear classe quebra o host que a sobrescreve. O
  nome é contrato, como `themeKey` seria.
- Esta app ganha um `styles.css` de terceiro no bundle. Ele é CSS puro, sem `@layer` e sem preflight —
  não há reset global atingindo as telas prontas —, mas passa a valer conferir regra `*` do pacote
  contra os nossos tokens quando alguma tela existente mudar de aparência sem motivo.
- Os contratos do design system não alcançam `node_modules`: a conformidade das telas do pacote é
  responsabilidade do pacote, e é lá que ela se testa.
- Nenhuma variável de ambiente nova, nenhum deploy novo, nenhum domínio novo.

## Alternativas descartadas

**Adotar Tailwind sem preflight.** Importar só as utilitárias destravaria a T007 hoje sem o reset
global que quebraria o design system caseiro. Foi a recomendação inicial, e ela resolve o sintoma no
produto errado: a exigência não declarada continua no pacote, os outros dois produtos seguem
carregando-a, e esta app passa a ter dois vocabulários de estilo concorrentes — utilitárias nas telas
do pacote, tokens e módulos no resto. Custo baixo agora, dívida sem dono depois.

**App separada, nos moldes da ADR-0050.** Isolaria o Tailwind por completo, com precedente e risco
zero para o painel. Mas ali a separação tinha motivo de segurança — usuário externo, bundle que não
pode conter o painel. Aqui é o mesmo operador, que passaria a trocar de app no meio do trabalho, e o
preço é outro deploy, outro domínio, outra fiação de auth e outro PWA para resolver um problema de
CSS.

**Fiar o `getThemeClass`.** É a porta que o pacote já projetou para o produto substituir a classe, e
está morta. Fiá-la obrigaria esta app a fornecer uma classe para **cada uma das 822 chaves**, e toda
chave esquecida viraria elemento sem estilo nenhum — contrato com penhasco, onde 90% preenchido não dá
90% da tela. Além disso criaria 822 identificadores de API permanentes, e manteria o default em
Tailwind, deixando o defeito de empacotamento de pé.
