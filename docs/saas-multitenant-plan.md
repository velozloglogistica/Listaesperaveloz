# Plano SaaS Multiempresa

## Decisao de arquitetura

Para este produto, a recomendacao inicial e usar **multi-tenant com tabelas compartilhadas** em vez de um schema por empresa.

Em vez de:

- `velozlog.waitlist_requests`
- `cliente_x.waitlist_requests`
- `cliente_y.waitlist_requests`

usar:

- `public.tenants`
- `public.app_users`
- `public.tenant_memberships`
- `public.waitlist_requests` com `tenant_id`

## Por que esse caminho e melhor agora

- reduz complexidade de migrations
- evita duplicar tabelas, triggers e policies por cliente
- facilita deploy unico no Supabase e na Vercel
- simplifica manutencao do bot e do painel
- preserva o modelo SaaS sem prender o produto a uma empresa

## Modelo recomendado

### `tenants`

Representa cada empresa cliente.

Campos base:

- `id`
- `name`
- `slug`
- `timezone`
- `is_active`

### `app_users`

Perfil global do usuario, vinculado ao `auth.users`.

Campos base:

- `id`
- `full_name`
- `email`
- `is_platform_admin`
- `is_active`

### `tenant_memberships`

Relaciona usuario com empresa e define permissao dentro daquela empresa.

Campos base:

- `tenant_id`
- `user_id`
- `role`
- `can_access_waitlist`
- `is_active`

Exemplo de papeis:

- `owner`
- `manager`
- `area`
- `viewer`

### `waitlist_requests`

Tabela de negocio da lista de espera, agora com `tenant_id`.

Regra de duplicidade recomendada:

- `tenant_id + cpf + praca + horario_label + escala_data`

Isso preserva a regra atual, mas separada por empresa.

## Como adaptar o sistema atual

### Banco

Hoje:

- `public.waitlist_requests` sem `tenant_id`
- duplicidade por `cpf + praca + horario_label + escala_data`

Novo:

- adicionar `tenant_id` na tabela
- criar `tenants`
- criar `app_users`
- criar `tenant_memberships`
- trocar o indice unico para incluir `tenant_id`

### Painel web

Hoje:

- usa `service_role`
- le e escreve direto na tabela
- autenticacao estava sendo pensada so para um contexto unico

Novo:

- login continua no Supabase Auth
- depois do login, carregar membership ativa do usuario
- todas as consultas devem considerar `tenant_id`
- o owner cria usuarios dentro do tenant atual, nao como papel global

### Bot Telegram

Hoje:

- grava direto em `waitlist_requests`
- nao sabe a qual empresa pertence o cadastro

Novo:

- cada bot precisa operar em um tenant
- o bot deve receber/configurar um `TENANT_SLUG` ou `TENANT_ID`
- ao salvar a solicitacao, inserir tambem o `tenant_id`

## Estrategia de migracao recomendada

### Fase 1

- criar `tenants`
- criar `app_users`
- criar `tenant_memberships`
- inserir o tenant inicial `velozlog`

### Fase 2

- adicionar `tenant_id` em `waitlist_requests`
- preencher todos os registros antigos com o tenant `velozlog`
- recriar indice unico incluindo `tenant_id`

### Fase 3

- adaptar backend e painel para filtrar por `tenant_id`
- adaptar bot para salvar com `tenant_id`

### Fase 4

- ativar RLS de verdade no app autenticado
- reduzir dependencia de consultas amplas com `service_role`

## O que evitar

- criar um schema por empresa no inicio
- usar role global para representar papel interno da empresa
- misturar permissao da plataforma com permissao do tenant
- continuar gravando dados sem identificar empresa

## Arquivo base

O arquivo [saas_multitenant_foundation.sql](file:///c:/Users/Alex/Desktop/Velozlog/repo_clean/supabase/saas_multitenant_foundation.sql) traz a fundacao do modelo multiempresa recomendado para um ambiente novo.

Para migrar o banco atual sem quebrar operacao, o ideal e criar depois uma migration incremental especifica para:

- incluir `tenant_id`
- popular o tenant inicial
- ajustar o indice unico atual
