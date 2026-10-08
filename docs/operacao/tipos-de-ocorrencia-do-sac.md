# Cadastro dos tipos de ocorrência do SAC: Devolução parcial e Devolução total

Este roteiro descreve como configurar, pela tela do painel, os dois tipos de ocorrência que o SAC exige: **Devolução parcial** e **Devolução total**. Tudo é digitado na aba **Tipos** da tela **Ocorrências**. Não há seed, migration nem script: os textos abaixo são dado que o operador digita.

Pré-requisito: conta com a permissão `settings.manage`. Sem ela a aba **Tipos** não aparece.

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
- **Tipo que já existe é configurado e renomeado, não recriado.** Antes de mudar qualquer campo de um tipo existente, **anote a configuração que ele tem hoje** (momentos, **Foto**, **Observação**, **Assinatura**, **Produtos**, e-mail): a tela salva cada controle na hora e não guarda histórico para voltar atrás.

## Tipo 1: Devolução parcial

### Passo 1: Renomear ou criar

**Renomear** (o tipo **Recusa parcial** existe):

1. Clique na linha **Recusa parcial** para abri-lo.
2. No bloco **Identificação**, no campo **Nome**, apague o texto e escreva `Devolução parcial`.
3. Aperte Enter. O nome grava ao sair do campo e a linha passa a mostrar **Devolução parcial**.

**Criar** (o tipo não existe), no bloco **Novo tipo**. O formulário de cadastro é mínimo de propósito: tem **Nome do tipo**, o seletor de momentos, **Foto**, **Observação**, **Assinatura** e **Produtos**, **Avisar quando acontecer**, **Aceita vários itens**, a reentrega e **Modelo de e-mail**. Não tem os rótulos, as quantidades mínimas nem o texto do e-mail: eles se configuram no tipo aberto, nos passos seguintes.

1. No campo **Nome do tipo**, escreva `Devolução parcial`.
2. No seletor de momentos (**Quem registra, e onde**), clique em **Tirar momento Separador, no galpão** (o tipo novo nasce com esse momento) e escolha **Motorista, numa nota**.
3. Em **Produtos**, escolha **Obrigatório**; as demais exigências (**Foto**, **Observação**, **Assinatura**) ficam para o Passo 4, no tipo aberto. Deixe **Aceita vários itens** marcada e **Avisar quando acontecer** desmarcada (é o aviso interno, não o e-mail à contratante).
4. Deixe **Modelo de e-mail** em **Sem e-mail** e clique em **Cadastrar tipo**.
5. A tela abre sozinha a linha do tipo novo, leva o foco até ela e confirma com "Tipo criado. Configure o que ele exige e o e-mail abaixo." Siga no Passo 2 nesse mesmo tipo aberto.

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

**Criar** (o tipo não existe), no bloco **Novo tipo** (formulário mínimo: veja o Tipo 1; o que falta se configura no tipo aberto):

1. No campo **Nome do tipo**, escreva `Devolução total`.
2. Troque o momento: **Tirar momento Separador, no galpão** e escolha **Motorista, numa nota**.
3. Em **Produtos**, escolha **Desligado**. Deixe **Avisar quando acontecer** desmarcada e **Modelo de e-mail** em **Sem e-mail**.
4. Clique em **Cadastrar tipo**. A tela abre sozinha a linha **Devolução total** (em **Na rua**) e confirma com "Tipo criado."; **Foto**, **Observação**, **Assinatura** e o resto vêm no Passo 3, nesse tipo aberto.

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

## Envio automático ou manual

No bloco **E-mail à contratante** de cada tipo, a caixa **Mandar e-mail à contratante da nota ao registrar** decide quem manda:

- **Marcada**: o e-mail sai sozinho quando a ocorrência é registrada. A prévia mostra "Sai automaticamente quando o tipo é registrado."
- **Desmarcada**: o modelo fica salvo, mas nada sai sozinho. A prévia mostra "Desligado: o operador manda pela conversa da ocorrência." O operador envia o e-mail pela conversa da ocorrência, depois de tratar o caso.

Qual tipo usa cada modo:

| Tipo                      | Modo                                    |
| ------------------------- | --------------------------------------- |
| **Devolução parcial**     | automático                              |
| **Devolução total**       | automático                              |
| **Prorrogação do boleto** | automático                              |
| **Item avariado**         | manual (modelo salvo, caixa desmarcada) |
| **Item faltante**         | manual (modelo salvo, caixa desmarcada) |

## Prorrogação do boleto

Tipo da rua (a spec 248 trata o retorno do boleto atualizado; aqui só o cadastro). O formulário **Novo tipo** cria o mínimo; o resto se configura no tipo aberto.

1. **Momentos**: somente **Motorista, numa nota**. Clique em **Aplicar momentos** se houve mudança.
2. **O que exige**: **Foto** **Desligado**, **Observação** **Opcional**, **Assinatura** **Desligado**, **Produtos** **Desligado**, **Número do documento do cliente** **Desligado**, **Valor pago** **Desligado**.
3. **E-mail à contratante**, **Assunto** (hífens comuns, com espaço dos dois lados):

   ```text
   OCORRÊNCIA - {{contratante}} - NF - {{numeroNotaSemSerie}} - MOT - {{motorista}} - MOTIVO - PRORROGAÇÃO
   ```

4. **Corpo** (as linhas em branco contam):

   ```text
   Bom dia,

   O cliente está solicitando a prorrogação do boleto.

   MOTORISTA: {{motorista}}
   RAZÃO SOCIAL: {{razaoSocial}}
   NOTA FISCAL: {{numeroNotaSemSerie}}
   VALOR DA NOTA: R$ {{valorNota}}
   ```

   O **VALOR DA NOTA** não pode ficar vazio: o exemplo original do SAC deixava o valor em branco, e o modelo preenche com `{{valorNota}}`.

5. Clique em **Salvar e-mail** e marque **Mandar e-mail à contratante da nota ao registrar** (envio automático).

⚠️ **Reentrega, "Aceita vários itens" e "A viagem segue sem a nota" não aparecem neste tipo, e é a regra, não perda de campo.** Reentrega e vários itens só existem com **Produtos** em **Opcional** ou **Obrigatório**; "A viagem segue sem a nota" só existe em tipo do galpão (momento **Separador, no galpão**). A tela mostra uma dica no lugar dizendo isso.

## Item avariado e Item faltante

Dois tipos com o mesmo desenho. ⚠️ **Os textos de e-mail abaixo são SUGESTÃO, a ajustar pelo SAC; não são modelo do SAC.** Por isso o envio é **manual** (caixa **Mandar e-mail à contratante da nota ao registrar** desmarcada): o operador revisa e manda pela conversa da ocorrência depois de tratar o caso.

Configuração comum:

- **Momentos**: **Separador, no galpão** e **Motorista, numa nota**.
- **Observação** **Opcional**, **Assinatura** **Desligado**, **Número do documento do cliente** **Desligado**, **Valor pago** **Desligado**.
- **Produtos** **Obrigatório**, em **Produtos exigidos** **Ao menos N itens** com **Quantidade mínima de produtos** `1`; **Aceita vários itens** marcada.
- **E-mail**: assunto, corpo e linha salvos com **Salvar e-mail**; caixa de envio automático **desmarcada**.

| Campo    | Item avariado               | Item faltante |
| -------- | --------------------------- | ------------- |
| **Foto** | **Obrigatório**, mínimo `1` | **Opcional**  |

**Assunto** do Item avariado:

```text
OCORRÊNCIA: {{contratante}} – NF {{numeroNotaSemSerie}} – ITEM AVARIADO
```

**Assunto** do Item faltante: o mesmo, terminando em `– ITEM FALTANTE`.

**Corpo** do Item avariado:

```text
Por favor, verificar. Foi identificada avaria no ato da entrega.

RAZÃO SOCIAL: {{razaoSocial}}
NOTA FISCAL: {{numeroNotaSemSerie}}
VALOR DA ENTREGA: R$ {{valorNota}}

{{linhasItens}}
```

**Corpo** do Item faltante: o mesmo, com a primeira linha `Por favor, verificar. Foi identificada falta de mercadoria no ato da entrega.`

**Linha de cada produto** (nos dois):

```text
{{codigoItem}} – {{item}} – {{quantidadeItem}}{{unidadeItem}} – {{observacao}}
```

Marcadores conferidos contra `apps/api-transportada/src/shared/occurrence-template.constant.ts`: `contratante`, `numeroNotaSemSerie`, `motorista`, `razaoSocial`, `valorNota`, `observacao`, `codigoItem`, `item`, `quantidadeItem` (assunto, corpo e linha), `linhasItens` (só corpo), `unidadeItem` (só linha).
