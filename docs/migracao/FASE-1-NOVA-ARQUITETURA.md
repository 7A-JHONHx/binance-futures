# Fase 1 - Fundacao da nova arquitetura

Esta fase abre a nova stack recomendada sem desmontar o sistema atual.

## Stack alvo

- Linguagem: TypeScript
- Frontend/Painel: Next.js + React
- Backend/API: NestJS
- HTTP server: Fastify via adapter do Nest
- Banco: PostgreSQL
- ORM para painel/admin/API: Prisma
- Execucao do robo: bot-worker separado
- Infra: Docker Compose

## O que foi criado

- `apps/web`
  - nova base do painel em Next.js
- `apps/api`
  - nova base da API em NestJS + Fastify
- `apps/bot-worker`
  - novo servico dedicado para o motor do bot
- `packages/shared`
  - pacote para tipos, contratos e utilitarios compartilhados

## O que continua valendo

- o sistema atual em `src/` continua sendo a referencia funcional
- o painel atual continua sendo a interface de producao ate migrarmos a camada web
- os servicos novos ainda estao em fase de base estrutural

## Comandos da nova arquitetura

Depois que instalarmos as dependencias da fase 2:

```powershell
npm run dev:web
npm run dev:api
npm run dev:bot
```

## Proxima etapa recomendada

Fase 2:

1. instalar dependencias da nova stack
2. subir o `apps/web` e o `apps/api`
3. migrar o painel atual para o Next.js
4. expor no NestJS os primeiros endpoints reais de status, trades e analises

## Regra da migracao

Nao vamos reescrever tudo de uma vez.

A ordem correta sera:

1. base
2. painel
3. API
4. worker
5. banco/modelagem
6. corte final do legado
