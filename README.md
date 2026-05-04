# VelozLog Waitlist

Projeto com bot do Telegram para lista de espera e painel web integrado ao Supabase.

## Estrutura

- `apps/bot`: bot em Python
- `apps/web`: painel em Next.js
- `supabase/schema.sql`: schema da tabela principal

## Bot

1. Copie `apps/bot/.env.example` para `apps/bot/.env`
2. Preencha:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_BOT_USERNAME`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Instale dependências:

```bash
cd apps/bot
python -m pip install -r requirements.txt
```

4. Rode o bot:

```bash
python main.py
```

## Links para os grupos

- Santa Etelvina:
  - `https://t.me/Velozlog_lista_bot?start=santa_etelvina`
- Ponta Negra:
  - `https://t.me/Velozlog_lista_bot?start=ponta_negra`
- Tancredo Neves:
  - `https://t.me/Velozlog_lista_bot?start=tancredo_neves`
- Chapada:
  - `https://t.me/Velozlog_lista_bot?start=chapada`

## Texto sugerido para fixar no grupo

```text
Para entrar na lista de espera desta praça, clique no botão abaixo e preencha seus dados no bot.
```

## Painel web

1. Copie `apps/web/.env.example` para `apps/web/.env.local`
2. Preencha:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Instale dependências:

```bash
cd apps/web
npm install
```

4. Rode o painel:

```bash
npm run dev
```

## Login e perfis

- Rode `supabase/add_dashboard_auth.sql` no SQL Editor do Supabase
- No primeiro acesso ao painel, a tela `/login` cria o primeiro `owner`
- O `owner` entra no painel e cria os logins das areas
- Cada login pode ser `owner` ou `area`
- O modulo atual controlado por permissao e a `Lista de espera`

## Fluxo operacional no painel

- o topo mostra cards com total, disponiveis, pendentes, agendados e usados
- a secao `Visao por hotzone e horario` agrupa os nomes por praça e turno
- quando alguem ja foi escalado como substituto, clique em `Marcar como usado`
- o nome fica riscado e sai da fila dos disponiveis
- se precisar devolver a pessoa para a fila, clique em `Reabrir nome`

## Schema

Rode o arquivo `supabase/schema.sql` no SQL Editor do Supabase.

Se a tabela ja existir no projeto atual, rode antes o arquivo `supabase/add_used_columns.sql` para liberar a marcacao de nomes usados como substituto.

## Segurança

- Não commitar `.env`
- Rotacionar token do Telegram e chaves do Supabase antes de publicar
- Manter a `SUPABASE_SERVICE_ROLE_KEY` apenas no backend
