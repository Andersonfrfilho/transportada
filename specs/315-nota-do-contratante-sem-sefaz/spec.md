# Spec 315 — Nota do contratante que a SEFAZ não entrega

## Problema (produção, 09/11/2026)

A UNICA (contratante, emitente `26344834000108`) manda por WhatsApp e e-mail os XMLs de NF-e que a transportadora não
consegue buscar na SEFAZ, porque o XML nomeia **outra** transportadora no bloco `transp`. O consumidor de importação
recusa todas com `NFE_IMPORT_UNRELATED_CNPJ`: a nota não cita o CNPJ da empresa (46 notas recusadas). A regra existe para
barrar nota de terceiro e continua valendo.

## Regra (decisão do dono)

Uma nota **sem relação** com a empresa é aceita se, e somente se, valem as três:

- RF1. O remetente foi autorizado por um caminho que o liga a **um** contratante da empresa: (a) contato do contratante com
  tipo `nfe_xml` (spec 302 — telefone no WhatsApp, e-mail no e-mail) ou (b) domínio de e-mail liberado amarrado a
  contratante (spec 313).
- RF2. O CNPJ do **emitente** da nota (chave de acesso, posições 7-20; no evento, a mesma chave) tem a mesma **raiz de 8
  dígitos** do `tax_id` desse contratante.
- RF3. O contratante está `active`.

Qualquer outra nota sem relação segue recusada com `NFE_IMPORT_UNRELATED_CNPJ`. Membro da empresa (sem contratante) não tem
bypass. Falha fechada: contratante não resolvido, inativo, ausente ou com `tax_id` que não seja CNPJ de 14 posições → recusa.

## Como

- Receita de WhatsApp ganha `nfe_xml_receipts.restricted_contractor_id` (migration aditiva): a API grava o contratante do
  contato; o worker o repassa a `createImport`, que já grava `nfe_imports.restricted_contractor_id` (spec 313).
- E-mail: `findAuthorizedSenderByEmail` devolve o contratante do contato (antes só devolvia no domínio).
- Contato que pertence a **mais de um** contratante autoriza o envio, mas não é ligado a nenhum (sem bypass, sem restrição).
- Consumidor: `isIssuedByLinkedContractor` (função pura, `nfe-imports/domain/`) é consultada antes da recusa.

## Segurança e limites

- A restrição de emitente da 313 (CNPJ **exato** do contratante) continua depois do bypass; como o caminho do contato passa
  a gravar o mesmo campo, **nota do contato emitida por filial (mesma raiz, outro CNPJ) agora é recusada com
  `NFE_IMPORT_ISSUER_NOT_CONTRACTOR`**, mesmo quando citava a empresa. Mudança de comportamento do caminho 302.
- Sem log de nome de arquivo, CNPJ de terceiro ou conteúdo do XML.

## Fora do escopo

Reprocessar as 46 notas já recusadas (operação, com aprovação); tela de cadastro; relaxar a restrição exata para raiz.
