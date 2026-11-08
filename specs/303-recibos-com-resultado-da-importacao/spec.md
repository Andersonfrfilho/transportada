# Spec 303 — Recibos de e-mail/WhatsApp com o resultado da importação

Pedido: saber, por envio, a quantidade de notas, quando chegou, quando entrou no sistema e de quais contratantes.

- RF1: cada recibo com importação mostra recebido em (`created_at`), entrou no sistema em (fim da importação; "ainda entrando" enquanto não terminou).
- RF2: contagens da importação: recebidas, novas, já existiam, com problema (inválidas + recusadas + falhas).
- RF3: contratantes das notas novas, com quantidade, pelo emitente da nota casado a `contractors` por `tax_id`.
- Sem migration: lê `nfe_imports` e `nfe_documents.import_id`. Recibo sem importação segue `import: null`.
