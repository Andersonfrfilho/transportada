# Cadastro dos tipos de ocorrência do SAC: Devolução parcial e Devolução total

Este roteiro descreve como cadastrar (ou renomear) os dois tipos de ocorrência que o SAC da Spani exige: **Devolução parcial** e **Devolução total**. O cadastro é feito manualmente pela tela no painel, aba Tipos de `/ocorrencias`, sem seed ou script que altere tipos existentes.

Pré-requisito: conta com permissão `settings.manage` no painel.

## Preparação: verificar se os tipos já existem

Os tipos "Recusa parcial" e "Recusa total" podem já estar cadastrados na empresa (criados automaticamente pelo sistema em empresas novas, ou presentes em empresas antigas). O roteiro abaixo cobre duas situações:

- **Os tipos existem:** renomee "Recusa parcial" para "Devolução parcial" e "Recusa total" para "Devolução total", depois configure os campos.
- **Os tipos não existem:** crie dois tipos novos com os nomes "Devolução parcial" e "Devolução total" e configure conforme o roteiro.

Para verificar, abra o painel, navegue até **Configurações > Tipos de ocorrência** (`/company-settings/occurrence-types`). Se não vir nenhum dos dois nomes (nem "Recusa" nem "Devolução"), todos os tipos precisam ser criados do zero.

## Tipo 1: Devolução parcial

### Passo 1: Abrir ou criar o tipo

**Se o tipo "Recusa parcial" existe:**

1. Clique no nome "Recusa parcial" para abri-lo.
2. Clique no ícone de edição ou no nome para passar a editável.
3. Apague o texto e escreva **Devolução parcial**.

**Se o tipo não existe:**

1. Clique no botão "Criar tipo" (ou ícone de "+").
2. No campo de nome, escreva **Devolução parcial**.
3. Prossiga para a próxima seção.

### Passo 2: Configurar os momentos

No bloco **"Quem registra, e onde"** (ou "Em que momento pode acontecer", se ainda não foi atualizado):

1. Marque **"Motorista, numa nota"** (valor padrão, já marcado).
2. Opcionalmente marque também **"Escritório, pelo motorista"** se quiser permitir que operadores registrem em nome do motorista.

### Passo 3: Configurar as exigências de registro

No bloco **"Dados do registro"** ou **"Exigências"**, configure assim:

| Campo          | Configurar para                                      |
| -------------- | ---------------------------------------------------- |
| **Foto**       | Obrigatório (mínimo: 1)                              |
| **Observação** | Obrigatório                                          |
| **Assinatura** | Desligado                                            |
| **Produtos**   | Obrigatório, "Ao menos 1 item", múltiplos permitidos |

### Passo 4: Configurar o número do documento do cliente

No bloco **"Dados do registro"**, na linha **"Número do documento do cliente"**:

1. Clique no seletor (primeira coluna).
2. Escolha **Obrigatório**.
3. No campo de rótulo (segunda coluna), apague o texto padrão e escreva: **Número da NFD**

### Passo 5: Configurar o valor pago

No bloco **"Dados do registro"**, na linha **"Valor pago"**:

1. Clique no primeiro seletor (modo).
2. Escolha **Opcional**.
3. Clique no segundo seletor (escopo).
4. Escolha **por linha**.
5. No campo de rótulo, apague o texto padrão e escreva: **Valor pago pela loja**

### Passo 6: Ativar o e-mail à contratante

No bloco **"E-mail à contratante"**:

1. Clique no interruptor para ligar ("ligado" deve aparecer ou estar visível).
2. Prossiga para configurar o conteúdo.

### Passo 7: Configurar o assunto do e-mail

No campo **"Assunto"** do bloco de e-mail:

1. Apague qualquer texto existente.
2. Escreva exatamente:
   ```
   OCORRÊNCIA: {{contratante}} – NF {{numeroNotaSemSerie}} – DEVOLUÇÃO PARCIAL
   ```
3. Não insira quebras de linha no assunto.

### Passo 8: Configurar o corpo do e-mail

No campo **"Corpo"** do bloco de e-mail:

1. Apague qualquer texto existente.
2. Escreva exatamente:

   ```
   Por favor, verificar. A loja emitiu a NFD devido à divergência identificada no ato da entrega.

   NFD {{numeroReferencia}} – R$ {{valorDeclarado}}
   RAZÃO SOCIAL: {{razaoSocial}}
   NOTA FISCAL: {{numeroNotaSemSerie}}
   VALOR DA ENTREGA: R$ {{valorNota}}

   {{linhasItens}}
   ```

### Passo 9: Configurar a linha de item

No campo **"Linha de item"** do bloco de e-mail:

1. Apague qualquer texto existente.
2. Escreva exatamente:
   ```
   {{codigoItem}} – {{item}} – {{quantidadeItem}}{{unidadeItem}} – {{observacao}}
   ```
3. Nenhuma quebra de linha dentro deste campo.

### Passo 10: Verificar a prévia

Na coluna ao lado (ou abaixo), procure pela **seção "Prévia do e-mail"**:

1. A prévia renderiza um exemplo com dados fictícios.
2. Verifique que:
   - O assunto contém "OCORRÊNCIA: [Nome da contratante] – NF [número] – DEVOLUÇÃO PARCIAL"
   - O corpo contém "Por favor, verificar..."
   - As linhas de itens estão bem formatadas (uma linha por item, com código, descrição, quantidade e unidade, e motivo)
   - Os valores estão no formato brasileiro (ex: `7.840,64`, não `7840.6400`)
   - Não há marcadores desconhecidos (ex: `{{marcadorErrado}}` em vermelho)

### Passo 11: Guardar

1. Clique no botão "Guardar" ou "Salvar" no final da página.
2. Se houver erro de marcador desconhecido, o painel recusará e listará qual marcador está errado. Corrija e tente novamente.
3. Se guardar com sucesso, o tipo aparecerá na lista (ou será atualizado se já existia).

## Tipo 2: Devolução total

### Passo 1: Abrir ou criar o tipo

**Se o tipo "Recusa total" existe:**

1. Clique no nome "Recusa total" para abri-lo.
2. Clique no ícone de edição ou no nome para passar a editável.
3. Apague o texto e escreva **Devolução total**.

**Se o tipo não existe:**

1. Clique no botão "Criar tipo" (ou ícone de "+").
2. No campo de nome, escreva **Devolução total**.
3. Prossiga para a próxima seção.

### Passo 2: Configurar os momentos

No bloco **"Quem registra, e onde"**:

1. Marque **"Motorista, numa nota"** (valor padrão, já marcado).
2. Opcionalmente marque também **"Escritório, pelo motorista"**.

### Passo 3: Configurar as exigências de registro

No bloco **"Dados do registro"** ou **"Exigências"**, configure assim:

| Campo          | Configurar para                                 |
| -------------- | ----------------------------------------------- |
| **Foto**       | Obrigatório (mínimo: 1)                         |
| **Observação** | Obrigatório (este é o "Motivo" que o SAC pediu) |
| **Assinatura** | Desligado                                       |
| **Produtos**   | Desligado                                       |

### Passo 4: Configurar o número do documento do cliente

No bloco **"Dados do registro"**, na linha **"Número do documento do cliente"**:

1. Clique no seletor (primeira coluna).
2. Escolha **Opcional**.
3. No campo de rótulo (segunda coluna), apague o texto padrão e escreva: **Número da NFD**

### Passo 5: Configurar o valor pago

No bloco **"Dados do registro"**, na linha **"Valor pago"**:

1. Clique no seletor (primeira coluna).
2. Escolha **Desligado**.
3. Os outros campos (escopo, rótulo) ficarão desabilitados; ignore-os.

### Passo 6: Desativar o e-mail à contratante

**Nesta spec, o SAC não pediu e-mail automático para "Devolução total".** Se o bloco **"E-mail à contratante"** está ligado de uma edição anterior:

1. Clique no interruptor para desligar.
2. Os campos de assunto, corpo e linha de item ficarão desabilitados.

Se ainda não houver sido configurado, deixe desligado.

### Passo 7: Guardar

1. Clique no botão "Guardar" ou "Salvar" no final da página.
2. Se guardar com sucesso, o tipo aparecerá na lista (ou será atualizado se já existia).

## Referência: marcadores válidos

A lista abaixo mostra quais marcadores o sistema reconhece. Se escrever um marcador que não esteja aqui, o painel recusará ao guardar.

### Marcadores válidos em assunto, corpo e linha de item

- `{{numeroNota}}` — número com série (ex: 680481/1)
- `{{numeroNotaSemSerie}}` — número só (ex: 680481)
- `{{razaoSocial}}` — nome legal do cliente
- `{{valorNota}}` — valor total da nota, formatado (ex: 7.840,64)
- `{{contratante}}` — nome da transportadora (contratante cadastrada)
- `{{motorista}}` — nome do motorista
- `{{parada}}` — nome da parada
- `{{data}}` — data de hoje (ex: 07/10/2026)
- `{{item}}` — nome completo do item (descrição)
- `{{codigoItem}}` — código do item (cProd)
- `{{quantidadeItem}}` — quantidade registrada na ocorrência (ex: 1, 2,5)
- `{{observacao}}` — texto de observação digitado no registro
- `{{numeroReferencia}}` — número do documento do cliente (ex: número da NFD) — só aparece se o tipo exige/permite
- `{{somaItens}}` — soma arredondada de todas as linhas (ex: 207,19)
- `{{valorDeclarado}}` — valor total pago (o digitado, ou a soma das linhas se não foi digitado)

### Marcadores extras: só no corpo e na linha de item

- `{{linhasItens}}` — imprime uma linha por item (só no corpo, não no assunto; não vale na linha de item)

### Marcadores extras: só dentro de "Linha de item"

- `{{unidadeItem}}` — unidade de medida (ex: FD, UN)
- `{{valorUnitarioItem}}` — preço por unidade da nota (ex: 57,20)
- `{{somaItem}}` — quantidade vezes preço unitário, arredondado (ex: 57,20)
- `{{valorItem}}` — valor pago pelo item (o digitado, ou a soma se não foi digitado)

## Exemplo: resultado esperado

Com a nota de exemplo da spec (nota 680481, cliente Supermercado Trialba):

**Devolução parcial**, marca 1 item (código 2073170 02, descrição "MAC ADRIA OVOS 500G – PARAFUSO", 1 FD, valor unitário R$ 57,20), não digita valor pago:

- **Assunto do e-mail:** `OCORRÊNCIA: [Nome da Spani cadastrada] – NF 680481 – DEVOLUÇÃO PARCIAL`
- **Corpo:** começa com "Por favor, verificar..." e inclui a linha de item formatada como `2073170 02 – MAC ADRIA OVOS 500G – PARAFUSO – 1FD – Avaria identificada no momento da conferência das mercadorias`
- **Soma geral:** R$ 57,20

## Prorrogação do boleto

A prorrogação do boleto é abordada na spec 248 e ainda não foi implementada. Quando implementada, será possível cadastrar um tipo "Prorrogação do boleto" com configuração semelhante.

## Notas

- Os marcadores `{{` e `}}` são sensíveis e devem ser escritos exatamente como mostrado (sem espaços, sem variações).
- O painel mostra uma lista clicável de marcadores válidos enquanto você escreve; use-a como referência.
- A prévia é renderizada pelo servidor e é sempre um exemplo com dados fictícios, para validar o formato.
- Valores monetários (`{{valorNota}}`, `{{somaItens}}`, `{{valorDeclarado}}`, `{{valorUnitarioItem}}`, `{{somaItem}}`, `{{valorItem}}`) são formatados automaticamente no padrão brasileiro (separador de milhar: ponto; separador decimal: vírgula), sem símbolo. Se quiser exibir "R$", escreva `R$ {{marcador}}` no modelo.
