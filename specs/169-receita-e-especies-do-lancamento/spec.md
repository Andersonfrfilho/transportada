# Feature 169 — Receita lançada na viagem e espécies cadastráveis

## Decisão registrada (resolve a dúvida aberta)

Receita lançada entra em **linha separada**, identificada como "Receita lançada", somando no total
de entradas da viagem mas visualmente distinta do frete previsto. Opção conservadora: não mistura o
valor lançado manualmente com o cálculo de frete previsto, que continua vindo só da regra de frete.

## Problema e resultado

A viagem sabe lançar **gasto** avulso (pedágio, chaveiro, lavagem) e não sabe lançar **receita**. O
que entra fora do frete — ajuda de carga, taxa de reentrega, diária cobrada do embarcador — não tem
onde ser registrado, e a conta da viagem fica contando só um lado.

E a **espécie** do lançamento é uma lista fixa em código: hoje só `Pedágio` e `Avulso`. Quem opera
precisa de espécie nova (estacionamento, balsa, carreto, ajudante) e não tem como cadastrar — o
pedido vira ticket, o ticket vira deploy.

Resultado: a viagem lança receita como já lança gasto, e as espécies dos dois lados são **cadastro
da empresa**, não constante de código.

## Fora do escopo

- Faturamento e emissão fiscal da receita. O que esta spec registra é o **fato**, na conta da
  viagem — cobrar é outro módulo.
- Rateio de receita entre notas ou paradas.
- Mudar o cálculo do frete previsto, que continua vindo da regra de frete.

## Histórias priorizadas

### P1 — Lançar o que entrou

**Given** uma viagem aberta
**When** o operador lança uma receita com valor, espécie e descrição
**Then** ela aparece na lista da viagem, entra na conta como entrada e fica com autor e hora.

### P2 — Cadastrar a espécie que a operação usa

**Given** a página de configuração
**When** alguém com permissão cadastra uma espécie nova de gasto ou de receita
**Then** ela passa a aparecer no seletor do lançamento, sem deploy.

### P3 — Não misturar os dois lados

**Given** espécies cadastradas
**When** o operador lança um gasto
**Then** o seletor mostra só as espécies de gasto — receita e gasto não compartilham lista.

## Requisitos funcionais

- **RF1** Tabela nova de espécies por empresa: nome, lado (`expense` | `revenue`), ativa, e a
  ordem de exibição. Nome é único por empresa e por lado.
- **RF2** As duas espécies de hoje (`Pedágio`, `Avulso`) viram linhas semeadas na migration, do lado
  `expense` — nenhuma instalação perde o que já usa.
- **RF3** Lançamento de receita: valor, espécie, descrição, com as mesmas regras do gasto (valor
  maior que zero, descrição opcional, autor e hora na trilha).
- **RF4** A conta da viagem soma receita lançada como **entrada**, ao lado da receita de frete, e
  não a mistura com gasto.
- **RF5** O seletor de espécie lista só as ativas do lado certo, na ordem cadastrada.
- **RF6** Espécie em uso não é apagada — é desativada. Lançamento antigo continua mostrando a
  espécie dele.
- **RF7** O cadastro mora na aba de configuração do módulo financeiro, perto do efeito
  (`companySettingsTabs.service.ts`), e exige `settings.manage`.
- **RF8** Lançar receita exige a mesma permissão de lançar gasto.
- **RF9** Textos em pt-BR; en onde a seção já existir.
- **RF11** O bloco dos lançamentos fica **antes do total** da viagem: o total é a conclusão, e
  conclusão não vem antes do que a compõe. Hoje ele aparece depois, e quem confere lê o resultado
  antes de ver de onde ele veio.
- **RF12** Cada lançamento — gasto ou receita — tem ação de **remover**, com a mesma permissão de
  lançar. Remover não apaga do banco: marca quem removeu e quando, e o lançamento sai das contas.
  Erro de digitação é o caso comum, e obrigar o operador a conviver com ele suja a conta da viagem;
  apagar de verdade tiraria da trilha o que alguém precisou explicar depois.
- **RF13** Lançamento removido não aparece na lista por padrão, e a conta não o soma.
- **RF10** O campo de valor digita com **duas casas** (o defeito de 23/09 já corrigido vale para o
  formulário novo desde o começo).

## Requisitos não funcionais

- Migration aditiva, com semeadura das duas espécies existentes.
- `companyId` do contexto autenticado em tudo.
- Dinheiro em `numeric`, nunca float.

## Casos extremos e falhas

- **Espécie desativada com lançamento vivo**: o lançamento mantém o nome; o seletor não a oferece.
- **Nome repetido no mesmo lado**: `409`, com a mensagem ancorada no campo.
- **Receita maior que a viagem inteira**: não é erro — a conta mostra o que foi lançado.
- **Viagem fechada**: lançar é recusado nos dois lados, como já acontece com gasto.

## Critérios de aceite

- **CA01** Migration cria a tabela e semeia `Pedágio` e `Avulso` como gasto.
- **CA02** Receita lançada aparece na lista e na conta, como entrada.
- **CA03** Gasto e receita não compartilham a lista de espécies.
- **CA04** Espécie nova cadastrada aparece no seletor sem deploy.
- **CA05** Espécie em uso desativada some do seletor e permanece no lançamento antigo.
- **CA06** Nome repetido no mesmo lado é recusado com código estável.
- **CA07** O campo de valor mostra `100,00` ao digitar `10000`.
- **CA08** Os lançamentos aparecem antes do total na tela.
- **CA09** Remover um lançamento tira-o da conta e guarda quem removeu e quando.
- **CA10** Lançamento removido não volta a aparecer na lista nem na soma.

## Dúvidas

- `[NEEDS CLARIFICATION: receita lançada entra no resultado da viagem junto com o frete previsto,
ou fica numa linha separada até a viagem fechar?]`
