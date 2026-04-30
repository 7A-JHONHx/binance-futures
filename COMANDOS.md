# Comandos do projeto

Este arquivo deixa os comandos principais organizados para uso rapido.
Os exemplos abaixo assumem execucao no PowerShell, dentro da pasta do projeto.

## 1. Setup inicial

Entrar na pasta do projeto:

```powershell
cd C:\Users\Ballantines88\Desktop\binance-futures
```

Instalar dependencias:

```powershell
npm install
```

## 2. Setup do banco

Se voce for rodar o app fora do Docker, o Postgres precisa estar acessivel pela sua maquina.

Exemplo de `DATABASE_URL` para rodar local:

```text
DATABASE_URL=postgres://binance:binance@localhost:5432/binance_futures
```

Exemplo de `DATABASE_URL` dentro do Docker Compose:

```text
DATABASE_URL=postgres://binance:binance@postgres:5432/binance_futures
```

Aplicar migrations fora do Docker:

```powershell
npm run db:migrate
```

Aplicar migrations com Docker:

```powershell
docker compose --profile platform run --rm control-center npm run db:migrate
```

## 3. Rodar localmente

Rodar o robo em modo real:

```powershell
npm start
```

Rodar em paper trading:

```powershell
npm run start:paper
```

Consultar o snapshot atual:

```powershell
npm run status
```

Subir a API e o painel fora do Docker:

```powershell
npm run api
```

Painel local:

```text
http://localhost:3000
```

## 4. Backtest local

Rodar backtest simples:

```powershell
npm run backtest
```

Rodar backtest com parametros:

```powershell
node src/cli/backtest.js --symbol BTCUSDT --interval 5m --limit 1000
```

Rodar backtest com janela de datas:

```powershell
node src/cli/backtest.js --symbol BTCUSDT --interval 15m --start 2026-03-01 --end 2026-04-01
```

## 5. Rodar com Docker

Subir apenas o bot em modo real:

```powershell
docker compose up -d bot
```

Ou:

```powershell
npm run docker:up
```

Ver logs do bot:

```powershell
docker compose logs -f bot
```

Ou:

```powershell
npm run docker:logs
```

Subir o bot em paper trading:

```powershell
docker compose --profile paper up -d bot-paper
```

Ou:

```powershell
npm run docker:up:paper
```

Subir a plataforma completa com banco, bot e painel:

```powershell
npm run docker:up:platform
```

Ver logs do painel/API:

```powershell
docker compose logs -f control-center
```

Ver status dos containers:

```powershell
docker compose ps
```

Painel:

```text
http://localhost:3000
```

Parar tudo:

```powershell
docker compose down
```

Ou:

```powershell
npm run docker:down
```

## 6. Ferramentas Docker

Consultar snapshot e metricas pelo container:

```powershell
docker compose --profile tools run --rm status
```

Ou:

```powershell
npm run docker:status
```

Rodar backtest pelo container:

```powershell
docker compose --profile tools run --rm backtest
```

Rodar backtest pelo container com parametros:

```powershell
docker compose --profile tools run --rm backtest --symbol BTCUSDT --interval 5m --limit 1000
```

Ou:

```powershell
npm run docker:backtest
```

## 7. Endpoints da API

Com o `control-center` ativo, as rotas principais sao:

```text
http://localhost:3000/api/health
http://localhost:3000/api/overview
http://localhost:3000/api/status
http://localhost:3000/api/metrics
http://localhost:3000/api/trades
http://localhost:3000/api/analyses
```

## 8. Arquivos gerados pelo robo

Historico de trades:

```text
data/history/trades.csv
```

Historico de analises:

```text
data/history/analyses.csv
```

Snapshot para monitoramento/painel:

```text
data/monitoring/bot-status.json
```

Metricas consolidadas:

```text
data/monitoring/metrics.json
```

Resultados de backtest:

```text
data/backtests/<run-id>/
```

Estado local do robo:

```text
.runtime/strategy-state.json
```

## 9. Variaveis de ambiente uteis

Modo do robo:

```text
TRADING_MODE=live
TRADING_MODE=paper
```

Formato dos logs no terminal:

```text
LOG_FORMAT=pretty
LOG_FORMAT=json
```

Porta local do painel/API:

```text
API_PORT=3000
```

Intervalo de refresh do dashboard:

```text
DASHBOARD_REFRESH_MS=5000
```

Ativacao do Postgres no app:

```text
DATABASE_ENABLED=true
DATABASE_SSL=false
DATABASE_POOL_MAX=10
```

Banco usado pelo container Postgres:

```text
POSTGRES_DB=binance_futures
POSTGRES_USER=binance
POSTGRES_PASSWORD=binance
POSTGRES_PORT=5432
```

Saldo inicial do paper trading:

```text
PAPER_START_BALANCE=1000
```

Taxa simulada no paper e no backtest:

```text
PAPER_FEE_RATE=0.0004
```

Mensagens de status no Telegram:

```text
TELEGRAM_STATUS_ENABLED=true
TELEGRAM_STATUS_INTERVAL_MS=900000
TELEGRAM_NOTIFY_STARTUP=true
TELEGRAM_NOTIFY_DAILY_RESET=true
```

Meta diaria de lucro em USDT:

```text
DAILY_PROFIT_TARGET_USDT=30
```

Modo da meta diaria:

```text
DAILY_PROFIT_TARGET_MODE=positive
DAILY_PROFIT_TARGET_MODE=net
```

Limite diario de entradas:

```text
DAILY_MAX_ENTRIES=4
```

Fuso horario usado para reset diario:

```text
DAILY_RESET_TIME_ZONE=America/Sao_Paulo
```

Modo do take profit:

```text
TAKE_PROFIT_MODE=trail_after_target
TAKE_PROFIT_MODE=fixed
```

Ordens nativas de protecao na Binance:

```text
EXCHANGE_PROTECTION_ENABLED=true
PROTECTION_WORKING_TYPE=CONTRACT_PRICE
PROTECTION_WORKING_TYPE=MARK_PRICE
PROTECTION_PRICE_PROTECT=false
POSITION_SYNC_INTERVAL_MS=5000
```

Observacao:
Se `TAKE_PROFIT_MODE=trail_after_target`, a Binance recebe apenas `STOP_MARKET`.
Para ver `STOP_MARKET` e `TAKE_PROFIT_MARKET` ao mesmo tempo, use `TAKE_PROFIT_MODE=fixed`.

Tempo entre snapshots para monitoramento:

```text
MONITORING_SNAPSHOT_INTERVAL_MS=5000
```

## 10. Observacao importante

O modo `paper` e o `backtest` existem para calibracao e validacao.
Antes de operar em modo real, vale comparar:

- win rate
- drawdown
- lucro liquido
- frequencia de trades
- comportamento em diferentes intervalos e ativos
