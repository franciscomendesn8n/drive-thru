# Banco de dados (Supabase) — instalação em um projeto novo

Esta pasta recria o banco de dados do Drive Thru em uma conta Supabase da empresa.
Nenhum arquivo aqui contém dados, senhas ou chaves secretas.

| Arquivo | O que é |
|---|---|
| `schema.sql` | Tabelas, índices, regras de acesso (RLS), funções, gatilho e tempo real |
| `functions/dt-usuarios/index.ts` | Função de servidor que cria e altera usuários e senhas |

## Passo a passo

1. **Criar o projeto** no Supabase (região *South America — São Paulo*).
2. **Banco:** em *SQL Editor*, cole o conteúdo de `schema.sql` e clique em *Run*.
3. **Função de usuários:** publique `functions/dt-usuarios` com o nome **dt-usuarios**
   (painel *Edge Functions › Deploy a new function*, ou `supabase functions deploy dt-usuarios`).
   Mantenha a verificação de JWT ligada. A chave de serviço é fornecida pelo próprio Supabase.
4. **Login (Authentication):**
   - *Sign In / Providers › Email*: ligado; **desligue "Allow new users to sign up"** (usuários são criados só pelo administrador) e desligue a confirmação por e-mail.
   - *Password requirements*: mínimo de 8 caracteres, com minúscula, maiúscula, número e símbolo (mesma regra do aplicativo).
   - A proteção contra senhas vazadas existe a partir do plano Pro.
5. **Primeiro administrador:**
   - *Authentication › Users › Add user*: e-mail `admin@drivethru.app`, uma senha forte, marcar *Auto Confirm User*.
   - Copie o *UID* do usuário criado e rode no *SQL Editor*:
     ```sql
     insert into public.dt_usuarios (id, login, nome, perfil)
     values ('COLE-O-UID-AQUI', 'admin', 'Nome do Administrador', 'admin');
     ```
6. **Ligar o aplicativo ao banco:** em `js/config.js`, preencha `DT.SUPABASE.url` e `DT.SUPABASE.chave`
   com a *Project URL* e a chave **publicável** (*Settings › API Keys › Publishable key*).
   Nunca coloque a chave *secret / service_role* no aplicativo.
7. **Primeiro acesso:** entre com o administrador. Com o banco vazio, o sistema carrega dados de
   demonstração. Para operar de verdade: *Configurações › Começar operação real*, depois cadastre
   funcionários e usuários em *Usuários e perfis* e marque o local do CD no *Mapa de chegadas*.

## Como os logins funcionam

O usuário digita só o login (ex.: `joao.silva`); o aplicativo entra no Supabase como
`joao.silva@drivethru.app`. O domínio fica em `DT.SUPABASE.dominioLogin` (`js/config.js`) e em
`DOMINIO` (`functions/dt-usuarios/index.ts`) — os dois precisam ser iguais.

## Regras de acesso (resumo)

- Visitante sem login: não lê nenhuma tabela; só usa as funções da página do cliente
  (`dt_acompanhar`, `dt_acompanhar_pedido`, `dt_enviar_localizacao`, `dt_parar_localizacao`),
  que exigem o código de acompanhamento e devolvem apenas dados não sensíveis.
- Usuário ativo: lê e grava agendamentos e inclui registros de auditoria.
- Configurações, funcionários e exclusões: só com a permissão correspondente do perfil.
- Localização do cliente: lida só por quem faz check-in ou vê o dashboard; apagada no check-in,
  cancelamento, não comparecimento, conclusão ou após 6 horas.

O script foi testado em um PostgreSQL limpo e reproduz a estrutura do projeto em uso em 30/09/2026.
