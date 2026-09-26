-- Spec 215, fase A: o schema TS esqueceu `latitude`, `longitude` e `geocoding_precision` de
-- `trip_stops`, mas o banco NÃO muda aqui. O Drizzle nomeia todas as colunas do schema em cada
-- `insert`, e o pre-deploy migra antes de a versão nova assumir: apagar as colunas agora quebraria
-- a instância anterior, ainda servindo, ao criar parada (42703). A remoção é a fase B, depois desta
-- estar em produção.
SELECT 1;
