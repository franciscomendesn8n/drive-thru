// Drive Thru — integração com o ERP
// Ações:
//   consultar        { numero }            → pedido traduzido (usuário ativo com permissão de consulta/agendamento)
//   testar           { numero, config? }   → pedido + resposta bruta + caminhos (permissão de configuração)
//   salvarCredencial { credencial }        → guarda a credencial do ERP no cofre (Vault), criptografada
//   statusCredencial                       → informa se há credencial guardada (nunca devolve o valor)
// A credencial do ERP nunca vai para o navegador.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import "./erp-nucleo.js";

// deno-lint-ignore no-explicit-any
const N = (globalThis as any).DT_ERP_NUCLEO;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SUPA = Deno.env.get("SUPABASE_URL")!;
const MAX_BYTES = 2_000_000;

/* Só HTTPS e nunca endereços internos (evita usar o servidor para alcançar a rede da nuvem) */
function urlPermitida(u: string): string | null {
  let url: URL;
  try { url = new URL(u); } catch { return "Endereço do ERP inválido."; }
  if (url.protocol !== "https:") return "O endereço do ERP precisa começar com https://";
  const h = url.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === "[::1]") {
    return "Endereço interno não é permitido. Publique o serviço do ERP com HTTPS (veja o passo a passo).";
  }
  return null;
}

// deno-lint-ignore no-explicit-any
async function consultarErp(cfg: any, credencial: string | null, numero: string) {
  const url = N.montarUrl({ ...cfg, url: String(cfg.url || "").split("{SUPABASE}").join(SUPA) }, numero);
  const bloqueio = urlPermitida(url);
  if (bloqueio) return { erro: bloqueio };
  const ctrl = new AbortController();
  const ms = Math.min(30000, Math.max(2000, Number(cfg.timeoutMs) || 8000));
  const timer = setTimeout(() => ctrl.abort(), ms);
  let resp: Response;
  try {
    resp = await fetch(url, { method: "GET", headers: N.cabecalhos(cfg, credencial), signal: ctrl.signal, redirect: "follow" });
  } catch (e) {
    clearTimeout(timer);
    const msg = (e as Error).name === "AbortError" ? `O ERP não respondeu em ${ms / 1000} s.` : "Não foi possível conectar ao ERP (" + (e as Error).message + ").";
    return { erro: msg };
  }
  clearTimeout(timer);
  if (resp.status === 404) return { encontrado: false, status: 404 };
  if (resp.status === 401 || resp.status === 403) return { erro: `O ERP recusou o acesso (HTTP ${resp.status}). Confira a credencial e o tipo de autenticação.` };
  const texto = await resp.text();
  if (texto.length > MAX_BYTES) return { erro: "Resposta do ERP grande demais." };
  if (!resp.ok) return { erro: `O ERP respondeu com erro (HTTP ${resp.status}).`, bruto: texto.slice(0, 2000) };
  let dados: unknown;
  try { dados = texto ? JSON.parse(texto) : null; } catch { return { erro: "A resposta do ERP não está em JSON.", bruto: texto.slice(0, 2000) }; }
  if (dados == null || (Array.isArray(dados) && !dados.length)) return { encontrado: false, status: resp.status };
  const r = N.mapear(dados, cfg, numero);
  if (!r.pedido) return { encontrado: false, status: resp.status, dados, avisos: r.avisos };
  return { encontrado: true, pedido: r.pedido, avisos: r.avisos, dados };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  const admin = createClient(SUPA, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: quem, error: erroQuem } = await admin.auth.getUser(token);
  if (erroQuem || !quem?.user) return json({ erro: "Sessão inválida. Entre novamente." }, 401);
  const { data: eu } = await admin.from("dt_usuarios").select("id, nome, perfil, ativo").eq("id", quem.user.id).maybeSingle();
  if (!eu?.ativo) return json({ erro: "Usuário sem acesso ao sistema." }, 403);
  const { data: perfis } = await admin.from("dt_config").select("valor").eq("chave", "perfis").maybeSingle();
  const permissoes: string[] = perfis?.valor?.[eu.perfil]?.permissoes ?? [];
  const pode = (p: string) => eu.perfil === "admin" || permissoes.includes(p);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ erro: "Requisição inválida." }, 400); }
  const acao = String(body.acao || "");

  if (acao === "salvarCredencial" || acao === "statusCredencial" || acao === "testar") {
    if (!pode("config.alterar")) return json({ erro: "Seu perfil não pode configurar a integração." }, 403);
  } else if (acao === "consultar") {
    if (!(pode("pedido.consultar") || pode("agendamento.criar"))) return json({ erro: "Seu perfil não pode consultar pedidos." }, 403);
  } else return json({ erro: "Ação desconhecida." }, 400);

  if (acao === "salvarCredencial") {
    const cred = String(body.credencial ?? "");
    if (cred.length > 4000) return json({ erro: "Credencial longa demais." }, 400);
    const { error } = await admin.rpc("dt_erp_credencial_salvar", { p_valor: cred });
    if (error) return json({ erro: "Não foi possível guardar a credencial: " + error.message }, 400);
    const idAud = "aud_" + crypto.randomUUID().replace(/-/g, ""), agora = new Date().toISOString();
    await admin.from("dt_auditoria").insert({ id: idAud, ts: agora,
      doc: { id: idAud, ts: agora, userId: eu.id, usuario: eu.nome, acao: cred ? "Alterou credencial do ERP" : "Removeu credencial do ERP", entidade: "Integração ERP", referencia: "credencial", antes: null, depois: cred ? "guardada no cofre" : "removida" } });
    return json({ ok: true, definida: !!cred });
  }
  if (acao === "statusCredencial") {
    const { data } = await admin.rpc("dt_erp_credencial_status");
    return json({ ok: true, ...(data || {}) });
  }

  const numero = String(body.numero ?? "").replace(/\D/g, "");
  if (!numero) return json({ erro: "Informe o número do pedido." }, 400);
  let cfg = body.config;
  if (acao === "consultar" || !cfg) {
    const { data } = await admin.from("dt_config").select("valor").eq("chave", "erp").maybeSingle();
    cfg = data?.valor;
  }
  if (!cfg || !cfg.url) return json({ erro: "Integração com o ERP não configurada." }, 400);
  if (acao === "consultar" && !cfg.ativo) return json({ erro: "Integração com o ERP desativada." }, 400);
  const { data: cred } = await admin.rpc("dt_erp_credencial_ler");
  const r = await consultarErp(cfg, cred || null, numero);

  if (acao === "consultar") {
    if (r.erro) return json({ erro: r.erro }, 502);
    // devolve só o pedido já traduzido (dados mínimos — LGPD)
    return json(r.encontrado ? { encontrado: true, pedido: r.pedido } : { encontrado: false });
  }
  // testar: inclui a resposta bruta e os caminhos, para montar o de-para
  const bruto = r.dados !== undefined ? JSON.stringify(r.dados).slice(0, 60000) : (r.bruto || null);
  return json({ ok: !r.erro, ...r, dados: undefined, bruto, caminhos: r.dados !== undefined ? N.caminhos(r.dados).slice(0, 300) : [] });
});
