# Feature 285 — Fluxo semanal da Spani

## Problema e resultado

Toda semana a Spani manda por email ("Frete Fernandes - Semana 19/10/2026 a 23/10/2026") uma planilha
de frete (`AFR Fernandes - 19 a 23-10-2026.xlsx`) e os XMLs das NF-e do período, hoje em um `.zip`
(`ID9910_procNFe_parte1.zip`). A Spani pede de volta, na mesma conversa: os XMLs fora do zip, o Excel,
o PDF da fatura e a nota de serviço de Ribeirão Preto. Hoje o operador cruza e envia tudo à mão.

Resultado: um fluxo guiado, **com tela de confirmação antes de cada ação**, que vai do email recebido
até a resposta a todos os envolvidos. Entregue em etapas, cada uma verificada.

## Fora do escopo

- Qualquer contratante além do pagamento da Spani (faturamento sempre em 15 dias).
- Emitir NFS-e fora de Ribeirão Preto.
- Execução sem confirmação humana (nenhum passo roda sozinho).

## Dados do primeiro lote (conferidos nos arquivos)

- Zip: 399 XMLs, notas 914060–918210, emitente Comercial Zaragoza (CNPJ 05868574001090).
- Planilha: 399 linhas (`DATA, DOCUMENTO1, CODCLIENTE, CLIENTE, CIDADECLIENTE, VALORLIQUIDO, Frete`),
  1 a 1 com o zip; 28 notas de Ribeirão Preto; frete R$ 41.642,62.
- Contra as 264 notas já em produção na faixa: 264 repetidas e **135 novas** (918074–918210).

## Histórias priorizadas

### P1 — Importar o zip sem duplicar (JÁ EXISTE)

**Given** um zip de XMLs **When** o operador o envia no painel de NF-e (aceita `.xml` e `.zip`)
**Then** o worker expande o zip (máx. 500 entradas, 5 MB por entrada, 100 MB no total, razão de
compressão 20, bloqueia `..`), identifica cada nota pela chave de acesso e marca como `duplicated` a
que já existe, contando no resumo (`duplicatedCount`). Esta etapa só precisa de verificação.

### P1 — Confirmar cada passo do fluxo

**Given** que chegou o email da semana **When** o operador abre o fluxo **Then** vê, em ordem, uma tela
de confirmação por passo e só avança ao confirmar: 1) importação e planilha; 2) emissão de CT-e e
NFS-e das notas selecionadas; 3) fatura dos CT-e; 4) envio respondendo a todos. Previews em `prints/`.

### P1 — Emitir só o que a planilha seleciona

**Given** a planilha da semana **When** o operador confirma o passo 2 **Then** emite CT-e apenas das
notas que constam nela e NFS-e apenas das de Ribeirão Preto.

### P1 — Enviar em partes de 100, respondendo a todos

**When** o operador confirma o passo 4 **Then** o sistema responde ao email original para todos os
envolvidos, com os XMLs em partes de 100 (informando "parte N de M"), a fatura (PDF), a NFS-e (PDF) e,
no corpo, a tabela das entregas municipais de Ribeirão Preto.

### P2 — Página para criar as automações

**Given** um contratante com pagamento configurado **When** o administrador cria uma automação
**Then** define contratante, gatilho (email recebido na caixa da empresa), passos, prazo de faturamento
(15 dias para a Spani), cidade da NFS-e, tamanho das partes e destinatários. Nada da Spani no código.

### P2 — Caixa de email da empresa

**Given** uma caixa da empresa **When** chega o email da Spani **Then** o fluxo abre sozinho
aguardando confirmação, e as respostas saem dessa caixa.

## Requisitos funcionais

- RF1 Cada passo grava confirmação na auditoria (quem, quando, o que foi feito, `traceId`).
- RF2 Seleção pela planilha: nota fora dela nunca emite; nota na planilha sem XML é apontada antes de confirmar.
- RF3 Resposta a todos preserva destinatários e cópia do email original, sem expor lista fora dele.
- RF4 Parte de XMLs ≤ 100 arquivos; todas as partes carregam a numeração e a fatura.
- RF5 Automação só existe para contratante configurado; faturamento em dias vem da configuração.
- RF6 `companyId` da sessão; permissões próprias por passo (importar, emitir, faturar, enviar, configurar).

## Requisitos não funcionais

- XML fiscal original preservado; nunca em log. Teto de anexo do provedor de email respeitado
  (partes dimensionadas por bytes além de 100 arquivos).
- Passos idempotentes: confirmar duas vezes não emite nem envia duas vezes.

## Casos extremos e falhas

- Planilha com nota sem XML, ou XML fora da planilha: aviso no passo 1, decisão do operador.
- Falha parcial na emissão: o passo mostra o que emitiu e o que falhou; reconfirmar refaz só o que falta.
- Envio com uma parte falha: reenvia só aquela parte.
- Email chega sem zip ou sem planilha: o fluxo não abre e avisa.

## Critérios de aceite

- Zip do lote 19–23/10: 135 importadas e 264 duplicadas; reenvio: 399 duplicadas.
- Fluxo completo em staging com os 399 documentos de teste, cada passo só avança com confirmação.
- Envio gera 4 partes (100+100+100+99) e a tabela com as 28 notas de Ribeirão.

## Dúvidas

- A Spani manda mais de uma parte por semana (o arquivo se chama `parte1`)?
- A planilha avisa já na importação quando houver divergência com o zip? Proposta: sim, no passo 1.
- A caixa da empresa recebe por qual domínio/provedor? Decidir na spec da etapa 5.
