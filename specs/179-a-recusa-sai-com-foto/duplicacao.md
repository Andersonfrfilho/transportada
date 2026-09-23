# O que a 179 duplicava — 23/09

Registro do erro, para quem vier depois não repetir.

A spec 179 foi escrita sem ler as specs anteriores sobre ocorrência, e **recriou três coisas que já
estavam prontas em `origin/staging`**. Descoberto quando o executor ia criar `thumbnail_object_id`
numa tabela nova — coluna que já existia em outra.

| A 179 criou | Já existia |
|---|---|
| `returns_to_depot` em `company_occurrence_types` | **`redelivery_policy`** na mesma tabela (`unset`/`allowed`/`blocked`), spec 164, T1–T30 implementadas |
| retorno ao barracão como marca da nota | **status `returned_to_warehouse`** em `trip_occurrence_cases`, terminal, com nota obrigatória |
| `thumbnail_object_id` em tabela nova | **`trip_document_occurrence_attachments.thumbnail_object_id`**, com FK composta e purpose `trip_occurrence_thumbnail` (spec 161) |
| miniatura a implementar | já gerada no cliente, gravada em dois `stored_objects`, devolvida como `thumbnailUrl` |

A 164 chegou ao mesmo raciocínio que a 179 apresentou como novo: *"é propriedade do cadastro, porque
quem sabe se 'avaria total' admite segunda tentativa é a transportadora, uma vez, não o conferente a
cada registro"*.

## O que sobrou de genuinamente novo

1. **A foto obrigatória.** A spec 161 entregou foto na ocorrência, mas **opcional** (até 5 anexos).
   Nenhum `attachment_mode`/`requiresAttachment` existe no código. Esta é a contribuição real da 179.
2. **O upload sem passar pela API.** URL assinada em vez de multipart — pedido explícito do usuário
   ("sem sobrecarregar a api"). Não existia; `createSignedUpload` foi publicado no pacote para isso.

## A lição

`specs/` está versionado no repositório. Antes de escrever spec nova sobre um assunto, **ler as
specs existentes daquele assunto** — não só o código. A revisão de arquitetura pegou erros sobre o
código; nenhuma pegou a duplicação de decisão, porque ninguém olhou o histórico.
