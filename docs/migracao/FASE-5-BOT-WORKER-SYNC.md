# Fase 5 - Bot Worker de Persistencia

Nesta fase, o `apps/bot-worker` passou a atuar como a ponte oficial entre o robo legado e a nova plataforma.

## Objetivo

- manter a estrategia atual intacta
- sincronizar `snapshot`, `metricas`, `trades` e `analises` para o banco oficial
- permitir que `apps/api` e `apps/web` dependam cada vez menos dos arquivos locais

## O que entrou

- `DatabaseSyncService` para leitura do legado e persistencia em Postgres via Prisma
- leitura centralizada dos arquivos em `legacy-data-reader.ts`
- estado de sincronizacao em `.runtime/new-platform-sync-state.json`
- uso de `watermarks` para evitar reimportar os mesmos registros a cada ciclo

## Fluxo

1. o worker sobe
2. verifica se `DATABASE_URL` existe
3. carrega o estado local de sincronizacao
4. consulta os ultimos timestamps do banco
5. importa apenas o que for novo
6. grava o estado local atualizado

## Observacao

Sem `DATABASE_URL`, o worker sobe em modo seguro e apenas informa que a sincronizacao oficial esta desativada.
