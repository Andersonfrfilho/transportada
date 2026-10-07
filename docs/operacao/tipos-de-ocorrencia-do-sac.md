# Cadastro dos tipos de ocorrência do SAC: Devolução parcial e Devolução total

Este roteiro descreve como configurar, pela tela do painel, os dois tipos de ocorrência que o SAC exige: **Devolução parcial** e **Devolução total**. Tudo é digitado na aba **Tipos** da tela **Ocorrências**. Não há seed, migration nem script: os textos abaixo são dado que o operador digita.

Pré-requisito: conta com a permissão `companies.settings`. Sem ela a aba **Tipos** não aparece.

## Onde fica e como a tela salva

1. No menu, abra **Ocorrências** (`/ocorrencias`).
2. Clique na aba **Tipos**.
3. Os tipos aparecem agrupados em **No galpão** e **Na rua**. Cada tipo é uma linha com o nome; clicar na linha abre o tipo (seta ▸ vira ▾). Um tipo aberto tem os blocos, nesta ordem: **Identificação**, **Quem registra, e onde**, **O que exige**, **E-mail à contratante**, **Aviso interno** e **Exceções por cliente**.
4. O tipo novo se cadastra no bloco **Novo tipo**, no fim da lista da aba.

Cada controle salva de um jeito, e o roteiro diz qual em cada passo:

- Caixas de marcar e listas (Desligado, Opcional, Obrigatório e semelhantes) gravam na hora, ao escolher.
- Campos de texto curtos (**Nome**, os dois rótulos) gravam ao apertar Enter ou ao sair do campo.
- **Quem registra, e onde** só grava ao clicar em **Aplicar momentos**.
- Os três textos do e-mail só gravam ao clicar em **Salvar e-mail**.

## Passo 0: ver quais tipos a empresa já tem

Na aba **Tipos**, procure por **Recusa parcial** e **Recusa total** (o catálogo de bootstrap cria os dois em empresa sem nenhum tipo). A spec 247 decide: a empresa **configura os tipos que já tem**, e pode renomear **Recusa parcial** para **Devolução parcial** e **Recusa total** para **Devolução total**. O identificador do tipo não muda, então o histórico e os relatórios continuam somando juntos. Criar um tipo novo ao lado parte o relatório em dois, por isso só se cria quando o tipo não existe.

- Se **Recusa parcial** existe, siga a opção "Renomear" do Passo 1 do Tipo 1. Se não existe, siga "Criar".
- Mesma regra para **Recusa total** no Tipo 2.

## Tipo 1: Devolução parcial

### Passo 1: Renomear ou criar

**Renomear** (o tipo **Recusa parcial** existe):

1. Clique na linha **Recusa parcial** para abri-lo.
2. No bloco **Identificação**, no campo **Nome**, apague o texto e escreva `Devolução parcial`.
3. Aperte Enter. O nome grava ao sair do campo e a linha passa a mostrar **Devolução parcial**.

**Criar** (o tipo não existe), no bloco **Novo tipo**:

1. No campo **Nome do tipo**, escreva `Devolução parcial`.
2. No seletor de momentos (**Quem registra, e onde**), clique em **Tirar momento Separador, no galpão** (o tipo novo nasce com esse momento) e escolha **Motorista, numa nota**.
3. Em **Foto**, escolha **Obrigatório**. Em **Observação**, escolha **Obrigatório**. Em **Assinatura**, deixe **Desligado**. Em **Produtos**, escolha **Obrigatório**.
4. Deixe **Aceita vários itens** marcada. Deixe **Avisar quando acontecer** desmarcada (é o aviso interno, não o e-mail à contratante).
5. Em **Modelo de e-mail**, deixe **Sem e-mail**.
6. Clique em **Cadastrar tipo**. O tipo aparece em **Na rua**; clique na linha **Devolução parcial** para abri-lo e continue no Passo 2.

### Passo 2: Identificação

No bloco **Identificação** do tipo aberto, confira que **Aceita vários itens** está marcada (grava na hora). Deixe **Devolução** (reentrega) como está: a política de reentrega é a que a operação já usa para recusa parcial e esta spec não a muda.

### Passo 3: Momentos

No bloco **Quem registra, e onde**:

1. O seletor deve mostrar **Motorista, numa nota**. Se mostrar outro momento, abra o seletor, marque **Motorista, numa nota** e tire os outros que não forem os desejados.
2. Se o SAC quiser que o escritório registre em nome do motorista, marque também **Escritório, pelo motorista**. É opcional.
3. Se houve qualquer mudança, clique em **Aplicar momentos**. O botão só aparece enquanto há mudança pendente; **Desfazer** descarta a mudança.

### Passo 4: O que exige

No bloco **O que exige** (a etiqueta ao lado do título diz **regra geral**), configure nesta ordem. Cada escolha grava na hora.

| Campo                              | Escolher                                                                |
| ---------------------------------- | ----------------------------------------------------------------------- |
| **Foto**                           | **Obrigatório**; em **Quantidade mínima de fotos**, escolha `1`         |
| **Observação**                     | **Obrigatório**                                                         |
| **Assinatura**                     | **Desligado**                                                           |
| **Produtos**                       | **Obrigatório**; em **Produtos exigidos**, escolha **Ao menos N itens** |
| **Número do documento do cliente** | **Obrigatório**                                                         |
| **Valor pago**                     | **Opcional**; em **Digitado**, escolha **Por linha de produto**         |

Detalhes:

1. **Produtos exigidos**: depois de escolher **Ao menos N itens**, o campo **Quantidade mínima de produtos** aparece; escreva `1` e aperte Enter. Com **Produtos** em **Obrigatório** e **Aceita vários itens** marcada, o motorista aponta vários produtos e a ocorrência só sai com pelo menos um.
2. **Número do documento do cliente**: no campo **Rótulo do número na tela de registro**, apague o texto e escreva `Número da NFD`. Aperte Enter.
3. **Valor pago**: no campo **Rótulo do valor na tela de registro**, apague o texto e escreva `Valor pago pela loja`. Aperte Enter.
4. Ordem importa para o **Valor pago**: **Por linha de produto** exige **Produtos** ligado. Com **Produtos** em **Desligado** a tela recusa a escolha, não grava nada e mostra o aviso "Valor pago por linha precisa de produtos".

### Passo 5: E-mail à contratante

No bloco **E-mail à contratante**, preencha antes de ligar: a tela avisa que, sem assunto, o e-mail automático não sai.

1. No campo **Assunto**, escreva exatamente:

   ```text
   OCORRÊNCIA: {{contratante}} – NF {{numeroNotaSemSerie}} – DEVOLUÇÃO PARCIAL
   ```

2. No campo **Corpo**, escreva exatamente:

   ```text
   Por favor, verificar. A loja emitiu a NFD devido à divergência identificada no ato da entrega.

   NFD {{numeroReferencia}} – R$ {{valorDeclarado}}
   RAZÃO SOCIAL: {{razaoSocial}}
   NOTA FISCAL: {{numeroNotaSemSerie}}
   VALOR DA ENTREGA: R$ {{valorNota}}

   {{linhasItens}}
   ```

3. No campo **Linha de cada produto**, escreva exatamente:

   ```text
   {{codigoItem}} – {{item}} – {{quantidadeItem}}{{unidadeItem}} – {{observacao}}
   ```

4. Se a tela mostrar "Este marcador não existe neste campo", o texto tem um marcador fora da lista daquele campo (a lista clicável logo abaixo do campo mostra os válidos); corrija e nada será gravado até lá.
5. Clique em **Salvar e-mail**. **Desfazer** descarta o que foi digitado desde o último salvamento.
6. Marque a caixa **Mandar e-mail à contratante da nota ao registrar**. Grava na hora.

### Passo 6: Conferir a prévia

A **Prévia · dados de exemplo** fica ao lado dos campos e usa dados **fixos de exemplo** (não os de uma nota real). Com os textos acima ela deve mostrar exatamente:

```text
OCORRÊNCIA: Contratante Exemplo – NF 123456 – DEVOLUÇÃO PARCIAL

Por favor, verificar. A loja emitiu a NFD devido à divergência identificada no ato da entrega.

NFD 45029 – R$ 117,19
RAZÃO SOCIAL: Supermercado Exemplo Ltda
NOTA FISCAL: 123456
VALOR DA ENTREGA: R$ 7.840,64

7000001 01 – PRODUTO EXEMPLO A 500G – 1FD – Avaria identificada no momento da conferência das mercadorias
7000002 02 – PRODUTO EXEMPLO B 1KG – 3CX – Avaria identificada no momento da conferência das mercadorias
```

Embaixo da prévia deve constar "Sai automaticamente quando o tipo é registrado." Se constar "Desligado: o operador manda pela conversa da ocorrência", a caixa do Passo 5, item 6, não foi marcada.

## Tipo 2: Devolução total

### Passo 1: Renomear ou criar

**Renomear** (o tipo **Recusa total** existe):

1. Clique na linha **Recusa total** para abri-lo.
2. No bloco **Identificação**, no campo **Nome**, escreva `Devolução total` e aperte Enter.

**Criar** (o tipo não existe), no bloco **Novo tipo**:

1. No campo **Nome do tipo**, escreva `Devolução total`.
2. Troque o momento: **Tirar momento Separador, no galpão** e escolha **Motorista, numa nota**.
3. Em **Foto**, escolha **Obrigatório**. Em **Observação**, escolha **Obrigatório**. Em **Assinatura**, deixe **Desligado**. Em **Produtos**, escolha **Desligado**.
4. Deixe **Avisar quando acontecer** desmarcada e **Modelo de e-mail** em **Sem e-mail**.
5. Clique em **Cadastrar tipo**, depois abra a linha **Devolução total** (em **Na rua**).

### Passo 2: Momentos

Mesmos momentos da Devolução parcial: no bloco **Quem registra, e onde**, deixe **Motorista, numa nota** e, opcionalmente, **Escritório, pelo motorista**. Clique em **Aplicar momentos** se houve mudança.

### Passo 3: O que exige

No bloco **O que exige**:

| Campo                              | Escolher                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| **Foto**                           | **Obrigatório**; em **Quantidade mínima de fotos**, escolha `1`                    |
| **Observação**                     | **Obrigatório** (é o "Motivo" do e-mail)                                           |
| **Assinatura**                     | **Desligado**                                                                      |
| **Produtos**                       | **Desligado**                                                                      |
| **Número do documento do cliente** | **Opcional**; em **Rótulo do número na tela de registro**, escreva `Número da NFD` |
| **Valor pago**                     | **Desligado**                                                                      |

A Devolução total **não usa linha de item**: com **Produtos** em **Desligado** o registro não mostra o seletor de produtos e o campo **Linha de cada produto** do e-mail não é usado. Com **Valor pago** em **Desligado** a tela de registro não mostra o campo.

### Passo 4: E-mail à contratante (ligado)

A Devolução total **também manda e-mail à contratante ao registrar**. No bloco **E-mail à contratante**:

1. No campo **Assunto**, escreva exatamente:

   ```text
   DEVOLUÇÃO TOTAL – NF {{numeroNotaSemSerie}}
   ```

2. No campo **Corpo**, escreva exatamente:

   ```text
   Cliente devolveu a nota.
   Motivo: {{observacao}}

   RAZÃO SOCIAL: {{razaoSocial}}
   NOTA FISCAL: {{numeroNotaSemSerie}}
   VALOR DA ENTREGA: R$ {{valorNota}}
   ```

3. Deixe **Linha de cada produto** como está: este tipo não imprime linhas de item.
4. Clique em **Salvar e-mail**.
5. Marque a caixa **Mandar e-mail à contratante da nota ao registrar**. Grava na hora.

### Passo 5: Conferir a prévia

Com os textos acima, a **Prévia · dados de exemplo** deve mostrar exatamente:

```text
DEVOLUÇÃO TOTAL – NF 123456

Cliente devolveu a nota.
Motivo: Avaria identificada no momento da conferência das mercadorias

RAZÃO SOCIAL: Supermercado Exemplo Ltda
NOTA FISCAL: 123456
VALOR DA ENTREGA: R$ 7.840,64
```

Embaixo da prévia deve constar "Sai automaticamente quando o tipo é registrado."

### Resultado esperado numa nota real (exemplo do SAC)

Os valores abaixo são de exemplo (fixture do SAC), não de uma nota de produção. Registrando **Devolução total** na nota 677002, de FARMA LÍDER SANTA ISABEL LTDA, valor R$ 2.612,88, com a **Observação** "o cliente já havia recebido" (o SAC escreveu "Observação: o cliente já havia recebido…" como exemplo de motivo; o texto digitado no campo **Observação** é o que entra depois de "Motivo:"), a contratante da nota recebe:

```text
DEVOLUÇÃO TOTAL – NF 677002

Cliente devolveu a nota.
Motivo: o cliente já havia recebido

RAZÃO SOCIAL: FARMA LÍDER SANTA ISABEL LTDA
NOTA FISCAL: 677002
VALOR DA ENTREGA: R$ 2.612,88
```

O assunto e o corpo da Devolução parcial seguem a mesma regra: `{{contratante}}` vira o nome da contratante **da nota** (no exemplo do SAC, a Spani). O nome da contratante nunca é digitado no modelo.

## Marcadores usados e onde cada um vale

A lista é fechada (`apps/api-transportada/src/shared/occurrence-template.constant.ts`). Marcador fora dela é recusado ao salvar, com a mensagem listando qual.

| Contexto                  | Marcadores deste roteiro                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Assunto**               | `{{contratante}}`, `{{numeroNotaSemSerie}}`                                                                                                     |
| **Corpo**                 | `{{numeroReferencia}}`, `{{valorDeclarado}}`, `{{razaoSocial}}`, `{{numeroNotaSemSerie}}`, `{{valorNota}}`, `{{observacao}}`, `{{linhasItens}}` |
| **Linha de cada produto** | `{{codigoItem}}`, `{{item}}`, `{{quantidadeItem}}`, `{{unidadeItem}}`, `{{observacao}}`                                                         |

- `{{linhasItens}}` só vale no **Corpo**. `{{unidadeItem}}` só vale em **Linha de cada produto**.
- Valores em reais saem no padrão brasileiro, sem símbolo (`7.840,64`); o `R$ ` é texto do modelo.

## Duas notas que evitam erro

- **`{{numeroNotaSemSerie}}` e `{{numeroNota}}` não são o mesmo marcador.** `{{numeroNota}}` imprime número e série quando há série (`680481/1`) e já tinha modelos gravados que dependem dele, por isso não mudou. O SAC escreve só o número, então o roteiro usa `{{numeroNotaSemSerie}}` (`680481`).
- **Zero à esquerda do "01FD".** O SAC escreveu `01FD` no exemplo; zero à esquerda não é exigência do formato e não se imita. O modelo imprime a quantidade como ela foi registrada (`1FD`).

## Prorrogação do boleto

A prorrogação do boleto é assunto da spec 248 e este roteiro não traz instruções para ela.
