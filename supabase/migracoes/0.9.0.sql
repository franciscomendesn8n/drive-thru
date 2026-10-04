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
