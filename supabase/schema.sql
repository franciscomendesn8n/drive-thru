-- =====================================================================
-- Drive Thru — estrutura do banco de dados (Supabase / PostgreSQL)
-- ---------------------------------------------------------------------
-- Recria tabelas, índices, regras de acesso (RLS), funções, gatilho e
-- tempo real usados pelo aplicativo. Rode uma vez em um projeto novo:
--   Supabase › SQL Editor › colar este arquivo › Run
-- Não contém dados nem senhas. Veja supabase/README.md.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabelas
-- Os registros ficam em "doc" (JSON), no mesmo formato usado pelo app;
-- algumas colunas são copiadas para busca e para as regras de acesso.
-- ---------------------------------------------------------------------
create table if not exists public.dt_usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  login text not null unique,
  nome text not null,
  email text,
  perfil text not null default 'comercial',     -- comercial | logistica | coletor | gestor | admin
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  ultimo_acesso timestamptz
);

create table if not exists public.dt_config (
  chave text primary key,                        -- settings | perfis | meta | aparencia
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.dt_funcionarios (
  id text primary key,
  doc jsonb not null,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.dt_agendamentos (
  id text primary key,
  pedido_numero text not null,
  data date not null,
  hora text not null,
  status text not null,
  codigo text not null unique,                   -- código de acompanhamento do cliente
  telefone_final text,                           -- 4 últimos dígitos (consulta sem o link)
  doc jsonb not null,
  atualizado_em timestamptz not null default now()
);
create index if not exists dt_agendamentos_data_idx on public.dt_agendamentos (data);
create index if not exists dt_agendamentos_pedido_idx on public.dt_agendamentos (pedido_numero);

create table if not exists public.dt_auditoria (
  id text primary key,
  ts timestamptz not null,
  doc jsonb not null
);
create index if not exists dt_auditoria_ts_idx on public.dt_auditoria (ts);

-- Localização do cliente a caminho (apagada no check-in / encerramento / após 6 h)
create table if not exists public.dt_rastreio (
  agendamento_id text primary key references public.dt_agendamentos(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  precisao real,
  velocidade real,
  rumo real,
  simulado boolean not null default false,
  inicio timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  trilha jsonb not null default '[]'::jsonb
);

alter table public.dt_usuarios     enable row level security;
alter table public.dt_config       enable row level security;
alter table public.dt_funcionarios enable row level security;
alter table public.dt_agendamentos enable row level security;
alter table public.dt_auditoria    enable row level security;
alter table public.dt_rastreio     enable row level security;

-- dt_rastreio: só leitura/exclusão por usuários logados; gravação apenas pela função do cliente
revoke all on public.dt_rastreio from anon, authenticated;
grant select, delete on public.dt_rastreio to authenticated;

-- ---------------------------------------------------------------------
-- 2. Funções auxiliares das regras de acesso (esquema privado)
-- ---------------------------------------------------------------------
create schema if not exists dt_priv;
grant usage on schema dt_priv to authenticated;

create or replace function dt_priv.dt_usuario_ativo()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dt_usuarios u where u.id = (select auth.uid()) and u.ativo);
$$;

-- Permissões vêm da matriz de perfis gravada em dt_config (chave 'perfis'); admin pode tudo
create or replace function dt_priv.dt_tem_permissao(p_perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.dt_usuarios u
    left join public.dt_config c on c.chave = 'perfis'
    where u.id = (select auth.uid()) and u.ativo
      and (u.perfil = 'admin' or coalesce((c.valor -> u.perfil -> 'permissoes') ? p_perm, false))
  );
$$;

revoke all on function dt_priv.dt_usuario_ativo() from public, anon;
revoke all on function dt_priv.dt_tem_permissao(text) from public, anon;
grant execute on function dt_priv.dt_usuario_ativo() to authenticated;
grant execute on function dt_priv.dt_tem_permissao(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Regras de acesso (RLS). Visitante sem login não lê nenhuma tabela.
-- ---------------------------------------------------------------------
create policy dt_usuarios_ler on public.dt_usuarios for select to authenticated
  using ((select dt_priv.dt_usuario_ativo()));
-- (criação e alteração de usuários: somente pela função dt-usuarios, com a chave de serviço)

create policy dt_config_ler on public.dt_config for select to authenticated
  using ((select dt_priv.dt_usuario_ativo()));
create policy dt_config_inserir on public.dt_config for insert to authenticated
  with check ((select dt_priv.dt_tem_permissao('config.alterar')) or (select dt_priv.dt_tem_permissao('usuarios.gerenciar')));
create policy dt_config_alterar on public.dt_config for update to authenticated
  using ((select dt_priv.dt_tem_permissao('config.alterar')) or (select dt_priv.dt_tem_permissao('usuarios.gerenciar')))
  with check ((select dt_priv.dt_tem_permissao('config.alterar')) or (select dt_priv.dt_tem_permissao('usuarios.gerenciar')));

create policy dt_funcionarios_ler on public.dt_funcionarios for select to authenticated
  using ((select dt_priv.dt_usuario_ativo()));
create policy dt_funcionarios_inserir on public.dt_funcionarios for insert to authenticated
  with check ((select dt_priv.dt_tem_permissao('funcionarios.gerenciar')));
create policy dt_funcionarios_alterar on public.dt_funcionarios for update to authenticated
  using ((select dt_priv.dt_tem_permissao('funcionarios.gerenciar')))
  with check ((select dt_priv.dt_tem_permissao('funcionarios.gerenciar')));
create policy dt_funcionarios_excluir on public.dt_funcionarios for delete to authenticated
  using ((select dt_priv.dt_tem_permissao('config.alterar')));

create policy dt_agendamentos_ler on public.dt_agendamentos for select to authenticated
  using ((select dt_priv.dt_usuario_ativo()));
create policy dt_agendamentos_inserir on public.dt_agendamentos for insert to authenticated
  with check ((select dt_priv.dt_usuario_ativo()));
create policy dt_agendamentos_alterar on public.dt_agendamentos for update to authenticated
  using ((select dt_priv.dt_usuario_ativo()))
  with check ((select dt_priv.dt_usuario_ativo()));
create policy dt_agendamentos_excluir on public.dt_agendamentos for delete to authenticated
  using ((select dt_priv.dt_tem_permissao('config.alterar')));

-- Auditoria: todos incluem, ninguém altera; exclusão só na limpeza dos dados de demonstração
create policy dt_auditoria_ler on public.dt_auditoria for select to authenticated
  using ((select dt_priv.dt_usuario_ativo()));
create policy dt_auditoria_inserir on public.dt_auditoria for insert to authenticated
  with check ((select dt_priv.dt_usuario_ativo()));
create policy dt_auditoria_excluir on public.dt_auditoria for delete to authenticated
  using ((select dt_priv.dt_tem_permissao('config.alterar')));

create policy dt_rastreio_ler on public.dt_rastreio for select to authenticated
  using ((select dt_priv.dt_tem_permissao('checkin.registrar')) or (select dt_priv.dt_tem_permissao('dashboard.ver')));
create policy dt_rastreio_apagar on public.dt_rastreio for delete to authenticated
  using ((select dt_priv.dt_tem_permissao('checkin.registrar')) or (select dt_priv.dt_tem_permissao('agendamento.alterar')));

-- ---------------------------------------------------------------------
-- 4. Funções chamadas pelo aplicativo
-- ---------------------------------------------------------------------
-- Último acesso do usuário logado
create or replace function public.dt_registrar_acesso()
returns void language sql security definer set search_path = '' as $$
  update public.dt_usuarios set ultimo_acesso = now() where id = (select auth.uid());
$$;

-- Página do cliente (sem login): devolve só dados não sensíveis do agendamento
create or replace function public.dt_acompanhar(p_codigo text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id,
    'codigo', a.codigo,
    'data', a.data,
    'hora', a.hora,
    'status', a.status,
    'prep', a.doc ->> 'prep',
    'criadoEm', a.doc ->> 'criadoEm',
    'entrega', a.doc ->> 'entrega',
    'doca', a.doc ->> 'doca',
    'pedido', jsonb_build_object(
      'numero', a.doc -> 'pedido' ->> 'numero',
      'cliente', a.doc -> 'pedido' ->> 'cliente',
      'qtdItens', a.doc -> 'pedido' -> 'qtdItens'),
    'historico', coalesce((select jsonb_agg(jsonb_build_object('status', h ->> 'status', 'ts', h ->> 'ts'))
                           from jsonb_array_elements(coalesce(a.doc -> 'historico', '[]'::jsonb)) h), '[]'::jsonb),
    'reagendamentos', coalesce((select jsonb_agg(jsonb_build_object('deData', r ->> 'deData', 'deHora', r ->> 'deHora',
                                                                    'paraData', r ->> 'paraData', 'paraHora', r ->> 'paraHora'))
                                from jsonb_array_elements(coalesce(a.doc -> 'reagendamentos', '[]'::jsonb)) r), '[]'::jsonb),
    'unidade', (select c.valor ->> 'unidade' from public.dt_config c where c.chave = 'settings'),
    'rastreio', jsonb_build_object(
      'ativo', coalesce((select (c.valor ->> 'rastreioAtivo')::boolean from public.dt_config c where c.chave = 'settings'), true),
      'cd', (select case when c.valor -> 'localCD' ? 'lat'
                         then jsonb_build_object('lat', c.valor -> 'localCD' -> 'lat', 'lng', c.valor -> 'localCD' -> 'lng') end
             from public.dt_config c where c.chave = 'settings'),
      'compartilhando', exists (select 1 from public.dt_rastreio t where t.agendamento_id = a.id))
  )
  from public.dt_agendamentos a
  where a.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Consulta sem o link: nº do pedido + 4 últimos dígitos do telefone → código
create or replace function public.dt_acompanhar_pedido(p_numero text, p_final text)
returns text language sql stable security definer set search_path = '' as $$
  select a.codigo from public.dt_agendamentos a
  where a.pedido_numero = regexp_replace(coalesce(p_numero, ''), '\D', '', 'g')
    and a.telefone_final = regexp_replace(coalesce(p_final, ''), '\D', '', 'g')
    and length(regexp_replace(coalesce(p_final, ''), '\D', '', 'g')) = 4
  order by a.atualizado_em desc
  limit 1;
$$;

-- "Estou a caminho": o cliente envia a posição pelo código de acompanhamento
create or replace function public.dt_enviar_localizacao(
  p_codigo text, p_lat double precision, p_lng double precision,
  p_precisao double precision default null, p_velocidade double precision default null,
  p_rumo double precision default null, p_simulado boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cod text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  a record;
  r record;
  v_agora text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_aud text := 'aud_' || replace(gen_random_uuid()::text, '-', '');
  v_ativos text[] := array['Agendado','Reagendado','Em preparação','Separado','Conferido','Faturado','Pronto para retirada','Cliente a caminho'];
begin
  if length(v_cod) < 6 then return jsonb_build_object('ok', false, 'erro', 'codigo'); end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or (p_lat = 0 and p_lng = 0) then
    return jsonb_build_object('ok', false, 'erro', 'posicao');
  end if;
  select id, status, data, doc into a from public.dt_agendamentos where codigo = v_cod for update;
  if not found then return jsonb_build_object('ok', false, 'erro', 'nao_encontrado'); end if;
  if not (a.status = any(v_ativos)) then
    delete from public.dt_rastreio where agendamento_id = a.id;
    return jsonb_build_object('ok', false, 'erro', 'encerrado');
  end if;
  if a.data <> (now() at time zone 'America/Sao_Paulo')::date then
    return jsonb_build_object('ok', false, 'erro', 'outro_dia');
  end if;

  -- posições com mais de 6 horas são apagadas
  delete from public.dt_rastreio where atualizado_em < now() - interval '6 hours';

  select atualizado_em into r from public.dt_rastreio where agendamento_id = a.id;
  if found and r.atualizado_em > now() - interval '2 seconds' then
    return jsonb_build_object('ok', true, 'ignorado', true);
  end if;

  insert into public.dt_rastreio as t (agendamento_id, lat, lng, precisao, velocidade, rumo, simulado, trilha)
  values (a.id, p_lat, p_lng, p_precisao, p_velocidade, p_rumo, coalesce(p_simulado, false),
          jsonb_build_array(jsonb_build_object('lat', p_lat, 'lng', p_lng, 'ts', v_agora)))
  on conflict (agendamento_id) do update set
    lat = excluded.lat, lng = excluded.lng, precisao = excluded.precisao, velocidade = excluded.velocidade,
    rumo = excluded.rumo, simulado = excluded.simulado, atualizado_em = now(),
    trilha = (select coalesce(jsonb_agg(x order by n), '[]'::jsonb) from (
               select x, n from jsonb_array_elements(t.trilha || excluded.trilha) with ordinality as e(x, n)
               order by n desc limit 60) s);

  if a.status <> 'Cliente a caminho' then
    update public.dt_agendamentos set
      status = 'Cliente a caminho',
      atualizado_em = now(),
      doc = jsonb_set(jsonb_set(jsonb_set(jsonb_set(doc,
              '{status}', '"Cliente a caminho"'),
              '{alteradoEm}', to_jsonb(v_agora)),
              '{alteradoPor}', '"Cliente"'),
              '{historico}', coalesce(doc -> 'historico', '[]'::jsonb) || jsonb_build_object(
                'ts', v_agora, 'status', 'Cliente a caminho', 'usuario', 'Cliente',
                'desc', case when coalesce(p_simulado, false) then 'Trajeto simulado (demonstração) — cliente a caminho'
                             else 'Cliente compartilhou a localização e está a caminho' end))
    where id = a.id;
    insert into public.dt_auditoria (id, ts, doc) values (v_aud, now(),
      jsonb_build_object('id', v_aud, 'ts', v_agora, 'userId', null, 'usuario', 'Cliente (página de acompanhamento)',
        'acao', 'Cliente a caminho (localização)', 'entidade', 'Agendamento', 'referencia', a.doc -> 'pedido' ->> 'numero',
        'antes', a.status, 'depois', case when coalesce(p_simulado, false) then 'Cliente a caminho (simulação)' else 'Cliente a caminho' end));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Aparência (logo, cores e textos do login): pública, lida antes do login
create or replace function public.dt_aparencia()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select c.valor from public.dt_config c where c.chave = 'aparencia'), '{}'::jsonb);
$$;

-- O cliente para de compartilhar: a posição é apagada
create or replace function public.dt_parar_localizacao(p_codigo text)
returns boolean language sql security definer set search_path = '' as $$
  with d as (
    delete from public.dt_rastreio t using public.dt_agendamentos a
    where a.id = t.agendamento_id and a.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'))
    returning 1)
  select exists (select 1 from d);
$$;

revoke all on function public.dt_registrar_acesso() from public, anon;
grant execute on function public.dt_registrar_acesso() to authenticated;
revoke all on function public.dt_acompanhar(text) from public;
revoke all on function public.dt_acompanhar_pedido(text, text) from public;
revoke all on function public.dt_enviar_localizacao(text, double precision, double precision, double precision, double precision, double precision, boolean) from public;
revoke all on function public.dt_parar_localizacao(text) from public;
-- funções públicas de propósito: usadas pela página do cliente, sem login
grant execute on function public.dt_acompanhar(text) to anon, authenticated;
grant execute on function public.dt_acompanhar_pedido(text, text) to anon, authenticated;
grant execute on function public.dt_enviar_localizacao(text, double precision, double precision, double precision, double precision, double precision, boolean) to anon, authenticated;
grant execute on function public.dt_parar_localizacao(text) to anon, authenticated;
revoke all on function public.dt_aparencia() from public;
grant execute on function public.dt_aparencia() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Gatilho: chegou, cancelou, não compareceu ou concluiu → apaga a localização
-- ---------------------------------------------------------------------
create or replace function dt_priv.dt_limpar_rastreio()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not (new.status = any(array['Agendado','Reagendado','Em preparação','Separado','Conferido','Faturado','Pronto para retirada','Cliente a caminho'])) then
    delete from public.dt_rastreio where agendamento_id = new.id;
  end if;
  return new;
end $$;
revoke all on function dt_priv.dt_limpar_rastreio() from public, anon, authenticated;

drop trigger if exists dt_limpar_rastreio on public.dt_agendamentos;
create trigger dt_limpar_rastreio after update of status on public.dt_agendamentos
  for each row when (old.status is distinct from new.status) execute function dt_priv.dt_limpar_rastreio();

-- ---------------------------------------------------------------------
-- 6. Tempo real (todas as telas se atualizam sozinhas)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table
  public.dt_usuarios, public.dt_config, public.dt_funcionarios,
  public.dt_agendamentos, public.dt_auditoria, public.dt_rastreio;

-- ---------------------------------------------------------------------
-- 7. Integração com o ERP: credencial guardada no cofre (Vault), criptografada.
--    Só a função de servidor dt-erp (chave de serviço) usa estas funções;
--    o navegador nunca lê a credencial.
-- ---------------------------------------------------------------------
create or replace function public.dt_erp_credencial_salvar(p_valor text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'dt_erp_credencial';
  if coalesce(p_valor, '') = '' then
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
    return;
  end if;
  if v_id is null then
    perform vault.create_secret(p_valor, 'dt_erp_credencial', 'Credencial do ERP (Drive Thru)');
  else
    perform vault.update_secret(v_id, p_valor);
  end if;
end $$;

create or replace function public.dt_erp_credencial_ler()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'dt_erp_credencial' limit 1;
$$;

create or replace function public.dt_erp_credencial_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('definida', exists (select 1 from vault.secrets where name = 'dt_erp_credencial'),
                            'atualizadaEm', (select updated_at from vault.secrets where name = 'dt_erp_credencial'));
$$;

revoke all on function public.dt_erp_credencial_salvar(text) from public, anon, authenticated;
revoke all on function public.dt_erp_credencial_ler() from public, anon, authenticated;
revoke all on function public.dt_erp_credencial_status() from public, anon, authenticated;
grant execute on function public.dt_erp_credencial_salvar(text) to service_role;
grant execute on function public.dt_erp_credencial_ler() to service_role;
grant execute on function public.dt_erp_credencial_status() to service_role;

-- ---------------------------------------------------------------------
-- 8. Modo de separação e conferência (chave 'separacao'): somente o
--    perfil Administrador pode trocar. Perfil "Operador de coletor".
-- ---------------------------------------------------------------------
create or replace function dt_priv.dt_config_separacao_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.chave = 'separacao' and (select auth.uid()) is not null and not exists (
    select 1 from public.dt_usuarios u where u.id = (select auth.uid()) and u.ativo and u.perfil = 'admin'
  ) then
    raise exception 'Somente o Administrador pode trocar o modo de separação e conferência.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function dt_priv.dt_config_separacao_admin() from public, anon, authenticated;

drop trigger if exists dt_config_separacao_admin on public.dt_config;
create trigger dt_config_separacao_admin before insert or update on public.dt_config
  for each row execute function dt_priv.dt_config_separacao_admin();

-- Bancos já em uso: inclui a permissão do coletor nos perfis gravados
update public.dt_config set valor =
  jsonb_set(
    jsonb_set(
      valor || jsonb_build_object('coletor', jsonb_build_object('nome', 'Operador de coletor', 'permissoes', jsonb_build_array('coletor.operar'))),
      '{logistica,permissoes}', coalesce(valor->'logistica'->'permissoes', '[]'::jsonb) || '["coletor.operar"]'::jsonb),
    '{admin,permissoes}', coalesce(valor->'admin'->'permissoes', '[]'::jsonb) || '["coletor.operar"]'::jsonb),
  atualizado_em = now()
where chave = 'perfis' and not (valor ? 'coletor');

-- =====================================================================
-- Versão 0.9.0 (o mesmo conteúdo de supabase/migracoes/0.9.0.sql)
-- =====================================================================
-- =====================================================================
-- Drive Thru 0.9.0 — rodar uma vez no SQL Editor do Supabase (projeto já em uso)
-- Pode ser executado mais de uma vez sem problema.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Regras por perfil no servidor: quem pode mudar cada status
--    (função "invoker": vale para alterações feitas pelo aplicativo;
--     funções internas do servidor e a página do cliente não são afetadas)
-- ---------------------------------------------------------------------
create or replace function dt_priv.dt_agendamento_regras()
returns trigger language plpgsql set search_path = '' as $$
declare
  ok boolean := true;
  p_old text; p_new text;
begin
  if current_user <> 'authenticated' then return new; end if;
  if tg_op = 'INSERT' then
    -- "upsert" de um agendamento que já existe: a regra é conferida na alteração
    if exists (select 1 from public.dt_agendamentos a where a.id = new.id) then return new; end if;
    if not dt_priv.dt_tem_permissao('agendamento.criar') then
      raise exception 'Seu perfil não pode criar agendamentos.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    ok := case new.status
      when 'Reagendado' then dt_priv.dt_tem_permissao('agendamento.alterar')
      when 'Cancelado' then dt_priv.dt_tem_permissao('agendamento.alterar')
      when 'Agendado' then dt_priv.dt_tem_permissao('agendamento.alterar') or dt_priv.dt_tem_permissao('preparacao.alterar') or dt_priv.dt_tem_permissao('coletor.operar')
      when 'Em preparação' then dt_priv.dt_tem_permissao('preparacao.alterar') or dt_priv.dt_tem_permissao('coletor.operar')
      when 'Separado' then dt_priv.dt_tem_permissao('preparacao.alterar') or dt_priv.dt_tem_permissao('coletor.operar')
      when 'Conferido' then dt_priv.dt_tem_permissao('preparacao.alterar') or dt_priv.dt_tem_permissao('coletor.operar')
      when 'Faturado' then dt_priv.dt_tem_permissao('preparacao.alterar')
      when 'Pronto para retirada' then dt_priv.dt_tem_permissao('preparacao.alterar')
      when 'Cliente a caminho' then dt_priv.dt_tem_permissao('checkin.registrar')
      when 'Cliente chegou' then dt_priv.dt_tem_permissao('checkin.registrar')
      when 'Em atendimento' then dt_priv.dt_tem_permissao('atendimento.registrar')
      when 'Carregamento iniciado' then dt_priv.dt_tem_permissao('atendimento.registrar')
      when 'Pedido entregue' then dt_priv.dt_tem_permissao('entrega.finalizar')
      when 'Retirada concluída' then dt_priv.dt_tem_permissao('entrega.finalizar')
      when 'Não compareceu' then dt_priv.dt_tem_permissao('checkin.registrar') or dt_priv.dt_tem_permissao('agendamento.alterar')
      else dt_priv.dt_tem_permissao('config.alterar')
    end;
  end if;
  p_old := coalesce(old.doc ->> 'prep', ''); p_new := coalesce(new.doc ->> 'prep', '');
  if not ok then
    raise exception 'Seu perfil não pode registrar "%".', coalesce(new.status, '') using errcode = '42501';
  end if;
  if p_new is distinct from p_old
     and not (dt_priv.dt_tem_permissao('preparacao.alterar') or dt_priv.dt_tem_permissao('coletor.operar')) then
    raise exception 'Seu perfil não pode alterar a preparação do pedido.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function dt_priv.dt_agendamento_regras() from public, anon;

drop trigger if exists dt_agendamento_regras on public.dt_agendamentos;
create trigger dt_agendamento_regras before insert or update on public.dt_agendamentos
  for each row execute function dt_priv.dt_agendamento_regras();

-- ---------------------------------------------------------------------
-- 2. Consulta do cliente sem o link: limite de tentativas
--    (5 erros por pedido ou 20 por endereço de internet a cada 15 minutos)
-- ---------------------------------------------------------------------
create table if not exists dt_priv.dt_tentativas (
  chave text not null,
  ts timestamptz not null default now()
);
create index if not exists dt_tentativas_idx on dt_priv.dt_tentativas (chave, ts);
revoke all on dt_priv.dt_tentativas from public, anon, authenticated;

drop function if exists public.dt_acompanhar_pedido(text, text);
create function public.dt_acompanhar_pedido(p_numero text, p_final text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v_num text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
  v_fim text := regexp_replace(coalesce(p_final, ''), '\D', '', 'g');
  v_ip text := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  v_cod text;
begin
  delete from dt_priv.dt_tentativas where ts < now() - interval '1 day';
  if (select count(*) from dt_priv.dt_tentativas where chave = 'ped:' || v_num and ts > now() - interval '15 minutes') >= 5
     or (v_ip <> '' and (select count(*) from dt_priv.dt_tentativas where chave = 'ip:' || v_ip and ts > now() - interval '15 minutes') >= 20) then
    raise exception 'Muitas tentativas. Aguarde 15 minutos e tente de novo, ou use o link enviado pelo vendedor.' using errcode = 'P0001';
  end if;
  select a.codigo into v_cod from public.dt_agendamentos a
   where a.pedido_numero = v_num and a.telefone_final = v_fim and length(v_fim) = 4
   order by a.atualizado_em desc limit 1;
  if v_cod is null then
    insert into dt_priv.dt_tentativas (chave) values ('ped:' || v_num);
    if v_ip <> '' then insert into dt_priv.dt_tentativas (chave) values ('ip:' || v_ip); end if;
  end if;
  return v_cod;
end $$;
revoke all on function public.dt_acompanhar_pedido(text, text) from public;
grant execute on function public.dt_acompanhar_pedido(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Monitoramento: erros das telas
-- ---------------------------------------------------------------------
create table if not exists public.dt_erros (
  id bigserial primary key,
  ts timestamptz not null default now(),
  usuario text,
  versao text,
  tela text,
  mensagem text not null,
  detalhe text
);
alter table public.dt_erros enable row level security;
drop policy if exists dt_erros_inserir on public.dt_erros;
create policy dt_erros_inserir on public.dt_erros for insert to authenticated with check ((select dt_priv.dt_usuario_ativo()));
drop policy if exists dt_erros_ler on public.dt_erros;
create policy dt_erros_ler on public.dt_erros for select to authenticated using ((select dt_priv.dt_tem_permissao('config.alterar')));

-- ---------------------------------------------------------------------
-- 4. Avisos ao cliente (WhatsApp por webhook) — registro dos envios
-- ---------------------------------------------------------------------
create table if not exists public.dt_avisos_enviados (
  agendamento_id text not null references public.dt_agendamentos(id) on delete cascade,
  tipo text not null,
  ts timestamptz not null default now(),
  ok boolean not null default true,
  detalhe text,
  primary key (agendamento_id, tipo)
);
alter table public.dt_avisos_enviados enable row level security;
drop policy if exists dt_avisos_ler on public.dt_avisos_enviados;
create policy dt_avisos_ler on public.dt_avisos_enviados for select to authenticated using ((select dt_priv.dt_usuario_ativo()));

-- Segredos do servidor (cofre): token do webhook de avisos
create or replace function public.dt_segredo_salvar(p_nome text, p_valor text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_nome not in ('dt_avisos_token') then raise exception 'Segredo não permitido.'; end if;
  select id into v_id from vault.secrets where name = p_nome;
  if coalesce(p_valor, '') = '' then
    if v_id is not null then delete from vault.secrets where id = v_id; end if;
    return;
  end if;
  if v_id is null then perform vault.create_secret(p_valor, p_nome, 'Drive Thru');
  else perform vault.update_secret(v_id, p_valor); end if;
end $$;
create or replace function public.dt_segredo_ler(p_nome text)
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_nome and p_nome in ('dt_avisos_token') limit 1;
$$;
create or replace function public.dt_segredo_status(p_nome text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('definida', exists (select 1 from vault.secrets where name = p_nome),
                            'atualizadaEm', (select updated_at from vault.secrets where name = p_nome));
$$;
revoke all on function public.dt_segredo_salvar(text, text) from public, anon, authenticated;
revoke all on function public.dt_segredo_ler(text) from public, anon, authenticated;
revoke all on function public.dt_segredo_status(text) from public, anon, authenticated;
grant execute on function public.dt_segredo_salvar(text, text) to service_role;
grant execute on function public.dt_segredo_ler(text) to service_role;
grant execute on function public.dt_segredo_status(text) to service_role;

-- ---------------------------------------------------------------------
-- 5. Retenção de dados (LGPD): apaga o que passou do prazo configurado
--    em Configurações (somente o Administrador executa)
-- ---------------------------------------------------------------------
create or replace function public.dt_aplicar_retencao()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ag int := 0; v_aud int := 0; v_err int := 0;
  m_ag int; m_aud int; v_nome text; v_id text;
begin
  select u.nome into v_nome from public.dt_usuarios u where u.id = (select auth.uid()) and u.ativo and u.perfil = 'admin';
  if v_nome is null then raise exception 'Somente o Administrador aplica a retenção de dados.' using errcode = '42501'; end if;
  select coalesce((c.valor ->> 'retencaoAgendamentosMeses')::int, 0), coalesce((c.valor ->> 'retencaoAuditoriaMeses')::int, 0)
    into m_ag, m_aud from public.dt_config c where c.chave = 'settings';
  if coalesce(m_ag, 0) > 0 then
    delete from public.dt_agendamentos a
     where a.data < (current_date - make_interval(months => m_ag))
       and a.status in ('Retirada concluída', 'Cancelado', 'Não compareceu');
    get diagnostics v_ag = row_count;
  end if;
  if coalesce(m_aud, 0) > 0 then
    delete from public.dt_auditoria x where x.ts < (now() - make_interval(months => m_aud));
    get diagnostics v_aud = row_count;
  end if;
  delete from public.dt_erros e where e.ts < now() - interval '90 days';
  get diagnostics v_err = row_count;
  v_id := 'aud_ret_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.dt_auditoria (id, ts, doc) values (v_id, now(),
    jsonb_build_object('id', v_id, 'ts', now(), 'userId', auth.uid(), 'usuario', v_nome, 'acao', 'Aplicou retenção de dados (LGPD)',
      'entidade', 'Configuração', 'referencia', 'retencao', 'antes', null,
      'depois', v_ag || ' agendamento(s), ' || v_aud || ' registro(s) de auditoria e ' || v_err || ' erro(s) antigos apagados'));
  insert into public.dt_config (chave, valor, atualizado_em) values ('retencao_execucao', jsonb_build_object('ts', now(), 'por', v_nome, 'agendamentos', v_ag, 'auditoria', v_aud, 'erros', v_err), now())
    on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
  return jsonb_build_object('agendamentos', v_ag, 'auditoria', v_aud, 'erros', v_err);
end $$;
revoke all on function public.dt_aplicar_retencao() from public, anon;
grant execute on function public.dt_aplicar_retencao() to authenticated;

-- ---------------------------------------------------------------------
-- 6. Permissão nova "Ver painel de TV" (Logística, Gestor e Administrador)
-- ---------------------------------------------------------------------
update public.dt_config set valor = (
  select jsonb_object_agg(k, case when k in ('logistica', 'gestor', 'admin') and not (v -> 'permissoes' ? 'painel.ver')
                                  then jsonb_set(v, '{permissoes}', (v -> 'permissoes') || '["painel.ver"]'::jsonb) else v end)
  from jsonb_each(valor) as e(k, v)), atualizado_em = now()
where chave = 'perfis';

-- Tempo real para os avisos
do $$ begin
  begin alter publication supabase_realtime add table public.dt_avisos_enviados; exception when duplicate_object then null; end;
end $$;

-- ---------------------------------------------------------------------
-- 7. Página do cliente: informa se o QR de chegada está ligado
-- ---------------------------------------------------------------------
create or replace function public.dt_acompanhar(p_codigo text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id,
    'codigo', a.codigo,
    'data', a.data,
    'hora', a.hora,
    'status', a.status,
    'prep', a.doc ->> 'prep',
    'criadoEm', a.doc ->> 'criadoEm',
    'entrega', a.doc ->> 'entrega',
    'doca', a.doc ->> 'doca',
    'pedido', jsonb_build_object(
      'numero', a.doc -> 'pedido' ->> 'numero',
      'cliente', a.doc -> 'pedido' ->> 'cliente',
      'qtdItens', a.doc -> 'pedido' -> 'qtdItens'),
    'historico', coalesce((select jsonb_agg(jsonb_build_object('status', h ->> 'status', 'ts', h ->> 'ts'))
                           from jsonb_array_elements(coalesce(a.doc -> 'historico', '[]'::jsonb)) h), '[]'::jsonb),
    'reagendamentos', coalesce((select jsonb_agg(jsonb_build_object('deData', r ->> 'deData', 'deHora', r ->> 'deHora',
                                                                    'paraData', r ->> 'paraData', 'paraHora', r ->> 'paraHora'))
                                from jsonb_array_elements(coalesce(a.doc -> 'reagendamentos', '[]'::jsonb)) r), '[]'::jsonb),
    'unidade', (select c.valor ->> 'unidade' from public.dt_config c where c.chave = 'settings'),
    'checkinQR', coalesce((select (c.valor ->> 'checkinQR')::boolean from public.dt_config c where c.chave = 'settings'), true),
    'rastreio', jsonb_build_object(
      'ativo', coalesce((select (c.valor ->> 'rastreioAtivo')::boolean from public.dt_config c where c.chave = 'settings'), true),
      'cd', (select case when c.valor -> 'localCD' ? 'lat'
                         then jsonb_build_object('lat', c.valor -> 'localCD' -> 'lat', 'lng', c.valor -> 'localCD' -> 'lng') end
             from public.dt_config c where c.chave = 'settings'),
      'compartilhando', exists (select 1 from public.dt_rastreio t where t.agendamento_id = a.id))
  )
  from public.dt_agendamentos a
  where a.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
$$;
