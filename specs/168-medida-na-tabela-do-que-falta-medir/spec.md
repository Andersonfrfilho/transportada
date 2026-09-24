# Feature 168 — Medir o produto na própria tabela do que falta medir

## Problema e resultado

O painel de carga da viagem lista o que ainda não tem cubagem — produto, nota, parada, caixas e
origem da medida — e a única saída é o botão "Ir para a fila de medição", que leva para outra tela,
em outro módulo, com outro contexto. Medido na bancada local: **49 itens de uma nota só**, todos
"sem estimativa". São 49 idas e voltas para tirar uma viagem do escuro.

Enquanto o item não tem medida, ele não entra na cubagem: a tela avisa "1 nota sem cubagem não
entrou na conta", e o desenho da carga mente por omissão — o baú parece ter espaço que não tem.

Resultado: quem está com a fita métrica na mão digita a medida **na linha do produto**, sem trocar
de tela, e a linha some da lista assim que a medida entra.

## Decisões tomadas (23/09)

1. **Campos na própria linha** — comprimento, largura e altura, salvando ao sair do campo. Não é
   diálogo por item nem grade de salvar tudo no fim: quem mede, mede um de cada vez.
2. **A medida vale para o produto**, no catálogo da empresa — a próxima nota com o mesmo item já
   nasce cubada. É como a fila de medição já funciona; medir a mesma caixa toda semana é o que esta
   spec existe para evitar.

## Fora do escopo

- A medição por câmera (spec 152) e a fila de medição do `nfe-workspace`, que continuam como estão.
- Estimativa automática por catálogo GTIN (specs 160/163).
- Medir **peso**. A tabela é de cubagem; peso tem outra origem e outra conta.

## Histórias priorizadas

### P1 — Medir sem sair da viagem

**Given** a tabela "O que falta medir" com itens sem estimativa
**When** o separador digita comprimento, largura e altura na linha e sai do campo
**Then** a medida é gravada, a linha sai da lista e a cubagem da viagem é refeita com ela.

### P2 — A medida serve para a próxima nota

**Given** um produto medido nesta viagem
**When** outra nota com o mesmo produto é importada
**Then** ela já nasce com a cubagem, sem ninguém medir de novo.

### P3 — O engano não se esconde

**Given** uma medida digitada fora de faixa (zero, negativa, ou grande demais para o baú)
**When** o campo perde o foco
**Then** a linha mostra o que está errado e **não** grava — a cubagem não muda por engano de dígito.

## Requisitos funcionais

- **RF1** Cada linha da tabela ganha três campos numéricos (comprimento, largura, altura) na mesma
  unidade que a fila de medição usa hoje, com a unidade escrita no cabeçalho, não repetida por campo.
- **RF2** Gravação ao sair do campo, com os três preenchidos. Linha incompleta não grava e não
  reclama — quem está no meio da digitação não levou erro.
- **RF3** A gravação reusa o caso de uso da fila de medição, nunca uma segunda escrita própria:
  duas implementações da mesma regra divergem caladas.
- **RF4** Gravou, a linha sai da lista e a cubagem da viagem é recalculada na mesma tela.
- **RF5** Validação de faixa igual à da fila de medição (a política pura já existe), com a mensagem
  ancorada na linha.
- **RF6** Só quem pode medir vê os campos; sem a permissão, a tabela continua como hoje.
- **RF7** A coluna "Origem da medida" passa a dizer **quem** mediu e quando, para a medida digitada
  aqui — hoje ela só distingue estimativa de medida.
- **RF8** Textos em pt-BR.

## Requisitos não funcionais

- Sem endpoint novo: a rota de medição já existe.
- `companyId` do contexto autenticado.
- A tabela já pagina; os campos não podem multiplicar requisição por linha renderizada.

## Casos extremos e falhas

- **Dois operadores medindo o mesmo produto**: a última gravação vence, e é o comportamento de hoje
  na fila. Não há trava, e não se inventa uma aqui.
- **Produto sem código** (nota mal formada): a linha aparece sem campos, com o motivo.
- **Falha de rede na gravação**: o valor digitado permanece no campo, com o aviso ao lado — nunca
  some da tela levando o trabalho junto.
- **Medida que zera a cubagem** (item que some da lista e volta): a lista se refaz pela resposta,
  não por adivinhação local.

## Critérios de aceite

- **CA01** Três campos por linha, gravando ao sair do campo com os três preenchidos.
- **CA02** Linha some da lista e a cubagem da viagem muda, sem recarregar a página.
- **CA03** Medida fora de faixa não grava e explica na linha.
- **CA04** A medida gravada aqui aparece na próxima nota com o mesmo produto.
- **CA05** Sem permissão de medir, nenhum campo é desenhado.
- **CA06** Falha de rede mantém o valor digitado e mostra o aviso.

## Dúvidas

Nenhuma. As duas decisões abertas foram respondidas em 23/09.
