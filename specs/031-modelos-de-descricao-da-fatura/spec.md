# 031 — Modelos de descrição da fatura

## Problema

A descrição que sai impressa na fatura é sempre o mesmo bloco de texto: o campo **Observações padrão
da fatura**, um único valor em `company_fiscal_profiles.billing_observations`, herdado por toda
fatura que não tem observação própria. Na prática o texto muda de fatura para fatura em dois eixos:

- **o que varia sozinho** — número da fatura, cliente, vencimento, dados bancários da empresa;
- **o que o cliente manda** — o período de prestação do serviço, que hoje é redigitado à mão.

O resultado é copiar e colar o bloco inteiro a cada fatura e trocar os números no meio do texto, que
é onde nascem faturas com o período do mês anterior e referência trocada.

Texto de referência, como o operador escreve hoje:

```
SERVIÇOS DE TRANSPORTES PRESTADOS DATA: 27-07 a 31-07-2026. DADOS BANCÁRIOS:
BANCO: 208 - BTG-PACTUAL AGÊNCIA: 50 CONTA: 017774316 PIX CNPJ: <chave>
Referência: 67
```

Tudo nesse bloco, menos o período, já existe estruturado no sistema.

## Objetivo

1. Um **catálogo de modelos nomeados** por empresa, em Configurações — não mais um texto único.
2. O modelo aceita **variáveis**; o que o sistema já sabe entra sozinho.
3. O que só o cliente sabe — o período — é **campo digitado na criação da fatura**, uma vez, no lugar
   certo, e não no meio do parágrafo.
4. A fatura escolhe o modelo na criação e mostra a **prévia** do texto final antes de gravar.

## Decisões

**O modelo gera texto; ele não fica ligado à fatura.** Na criação, o modelo escolhido é resolvido e o
resultado é gravado em `billing_invoices.observations`, o campo que a fatura já tem e que o operador
já pode editar à mão. Consequências, todas desejáveis: o caminho de render do PDF não muda; editar um
modelo **não** reescreve fatura antiga; e o texto impresso continua tendo uma fonte só.

**O período é digitado.** Decisão do usuário em 11/08/2026: _"isso é o cliente que envia"_. Não é
derivado da emissão dos CT-es da fatura — os dois podem divergir legitimamente, e um período inferido
que discorda do que o cliente mandou é pior do que campo em branco.

**O campo único vira o modelo padrão.** A migration copia o `billing_observations` de cada empresa
para um modelo chamado `Padrão`, marcado como padrão. O campo continua na tabela como texto de
fallback das faturas antigas; a tela de Configurações deixa de mostrá-lo, porque o catálogo o
substitui.

## Comportamento

### Catálogo

`billing_description_templates`: `id`, `company_id`, `name`, `body`, `is_default`, timestamps.
`name` é único por empresa. No máximo um `is_default = true` por empresa (índice único parcial), e
marcar um novo como padrão desmarca o anterior na mesma transação. Excluir o modelo padrão só é
permitido quando ele é o último — a empresa pode ficar sem catálogo, mas nunca com catálogo sem
padrão.

Permissão `settings.manage`, escopo `company`, como o resto de Configurações. Escrita deixa trilha de
auditoria.

### Variáveis

Catálogo fechado, resolvido no domínio. Variável fora da lista é erro de validação na gravação do
modelo — descobrir o erro de digitação ao salvar o modelo, e não na fatura impressa.

| Variável                 | Origem                                  | Exemplo              |
| ------------------------ | --------------------------------------- | -------------------- |
| `{{periodo}}`            | **digitada na fatura**                  | `27-07 a 31-07-2026` |
| `{{referencia}}`         | número da fatura                        | `67`                 |
| `{{cliente}}`            | razão social do tomador                 | `ACME LTDA`          |
| `{{documentoCliente}}`   | CNPJ/CPF do tomador, formatado          | `12.345.678/0001-90` |
| `{{emissao}}`            | data de emissão da fatura               | `05-08-2026`         |
| `{{vencimento}}`         | vencimento da fatura                    | `15-08-2026`         |
| `{{total}}`              | total da fatura                         | `12.345,67`          |
| `{{transportadora}}`     | nome fantasia, ou razão social se vazio | `TRANSPORTES XPTO`   |
| `{{cnpjTransportadora}}` | CNPJ do emitente, formatado             | `98.765.432/0001-10` |
| `{{banco}}`              | `código - nome` do perfil fiscal        | `208 - BTG PACTUAL`  |
| `{{agencia}}`            | agência do perfil fiscal                | `50`                 |
| `{{conta}}`              | conta do perfil fiscal                  | `017774316`          |
| `{{pix}}`                | chave PIX do perfil fiscal              | —                    |

Variável automática cuja origem está vazia resolve para string vazia, e a linha inteira que só a
continha some — bloco bancário incompleto não imprime `AGÊNCIA:` seguido de nada.

`{{periodo}}` é a única **manual**: a tela pede um campo por variável manual presente no modelo. Sem
valor, a criação responde 422 — fatura com `DATA:` em branco é retrabalho garantido.

### Criação da fatura

`POST /billing/invoices` aceita, em lugar de `observations`, o par `descriptionTemplateId` +
`descriptionVariables` (só as manuais). Os dois caminhos são mutuamente exclusivos: mandar texto
pronto e modelo na mesma requisição é 422, porque não há regra boa para decidir qual vence.

`POST /billing/invoices/preview` resolve o mesmo par e devolve o texto sem gravar nada — é a prévia
da tela.

Sem `descriptionTemplateId`, o comportamento é o de hoje: `observations` própria, ou o fallback do
perfil fiscal.

## Fora de escopo

- Formatação rica (negrito, tabela) na descrição: o bloco é texto puro no PDF e continua sendo.
- Modelo por cliente, escolhido automaticamente pelo tomador. O catálogo já permite manter um modelo
  por cliente e escolher na criação; a automação vem depois, se a escolha manual incomodar.
- Reescrever fatura já emitida quando o modelo muda. É proposital: documento emitido não se altera
  por edição de cadastro.
- Variável nova de origem calculada (peso total, quantidade de CT-es). Entra quando for pedida.

## Critérios de aceite

- Modelo com variável desconhecida (`{{foo}}`) responde 422 na gravação, citando o nome.
- Dois modelos com o mesmo nome na mesma empresa: 409.
- Marcar um modelo como padrão desmarca o anterior; nunca existem dois padrões.
- Excluir o modelo padrão com outros modelos no catálogo: 422.
- Modelo de outra empresa é invisível, ineditável e inexcluível pela rota (contrato de isolamento).
- Criação com `descriptionTemplateId` grava em `observations` o texto **já resolvido**.
- Criação com `descriptionTemplateId` e `observations` juntos: 422.
- Modelo com `{{periodo}}` sem o valor correspondente: 422.
- Prévia devolve exatamente o texto que a criação gravaria, sem gravar.
- Variável automática vazia não deixa rótulo órfão na linha.
