// Drive Thru — avisos ao cliente (WhatsApp) e resumo diário
// O envio é feito por um WEBHOOK da Condor (ex.: n8n, Make ou o provedor de WhatsApp):
// este servidor faz um POST em JSON com a mensagem pronta e o telefone do cliente.
// O token do webhook fica no cofre (Vault) e nunca vai para o navegador.
// Ações:
//   evento      { agendamentoId, tipo: "confirmacao" | "pronto" }   → envia um aviso (uma vez por pedido e tipo)
//   ciclo       { forcar? }      → lembretes "X min antes", avisos pendentes e o resumo diário (no máx. a cada 4 min)
//   resumo      { forcar? }      → envia o resumo do dia agora (configuração)
//   previa                       → devolve o resumo do dia sem enviar (configuração)
//   testar      { telefone? }    → envia uma mensagem de teste ao webhook (configuração)
//   salvarToken { token } / statusToken                              (configuração)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA = Deno.env.get("SUPABASE_URL")!;
const PRE_CHEGADA = ["Agendado", "Reagendado", "Em preparação", "Separado", "Conferido", "Faturado", "Pronto para retirada", "Cliente a caminho"];
const FINAL = ["Pedido entregue", "Retirada concluída"];
const ALFA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const MODELOS: Record<string, string> = {
  confirmacao: "Olá, {primeiroNome}! Sua retirada no Drive Thru Condor está agendada para {data} às {hora} (pedido {pedido}). Acompanhe e avise sua chegada: {link}",
  pronto: "{primeiroNome}, seu pedido {pedido} está PRONTO para retirada no Drive Thru Condor. Horário: {data} às {hora}. Ao chegar, mostre o QR: {link}",
  lembrete: "Lembrete: sua retirada no Drive Thru Condor é hoje às {hora} (pedido {pedido}). Endereço e acompanhamento: {link}",
};

/* Dia e hora em Brasília (UTC−3, sem horário de verão) */
const agoraBR = () => new Date(Date.now() - 3 * 3600000);
const hojeBR = () => agoraBR().toISOString().slice(0, 10);
const fmtData = (d: string) => d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : "";

function urlPermitida(u: string): string | null {
  let url: URL;
  try { url = new URL(u); } catch { return "Endereço do webhook inválido."; }
  if (url.protocol !== "https:") return "O endereço do webhook precisa começar com https://";
  const h = url.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === "[::1]") {
    return "Endereço interno não é permitido para o webhook.";
  }
  return null;
}
async function sha256hex(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function codigoDe(a: { id: string; codigo?: string; doc?: { codigo?: string } }) {
  if (a.codigo) return a.codigo;
  if (a.doc?.codigo) return a.doc.codigo;
  const h = await sha256hex("acomp::" + a.id);
  let c = "";
  for (let i = 0; i < 8; i++) c += ALFA[parseInt(h.substr(i * 2, 2), 16) % ALFA.length];
  return c;
}
function telefoneE164(t: string) {
  let d = String(t || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length <= 11) d = "55" + d.replace(/^0+/, "");
  return d;
}
// deno-lint-ignore no-explicit-any
export function preencher(modelo: string, v: Record<string, any>) {
  return String(modelo || "").replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined && v[k] !== null ? String(v[k]) : m));
}

// deno-lint-ignore no-explicit-any
async function postar(cfg: any, token: string | null, corpo: unknown) {
  const bloqueio = urlPermitida(String(cfg.webhookUrl || ""));
  if (bloqueio) return { ok: false, detalhe: bloqueio };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["X-DriveThru-Token"] = token;
    const r = await fetch(cfg.webhookUrl, { method: "POST", headers, body: JSON.stringify(corpo), signal: ctrl.signal });
    const txt = (await r.text()).slice(0, 300);
    return { ok: r.ok, detalhe: "HTTP " + r.status + (txt ? " · " + txt : "") };
  } catch (e) {
    return { ok: false, detalhe: (e as Error).name === "AbortError" ? "O webhook não respondeu em 10 s." : "Falha ao chamar o webhook: " + (e as Error).message };
  } finally { clearTimeout(timer); }
}

// deno-lint-ignore no-explicit-any
async function variaveis(a: any, cfg: any, settings: any) {
  const doc = a.doc || {}, p = doc.pedido || {};
  const cod = await codigoDe(a);
  const base = String(cfg.siteUrl || "").split("#")[0];
  const cliente = String(p.cliente || "");
  return {
    cliente, primeiroNome: cliente.split(/\s+/)[0] || cliente, pedido: p.numero, data: fmtData(doc.data || a.data), hora: doc.hora || a.hora,
    link: base ? base + "#acompanhar-" + cod : "", codigo: cod, unidade: settings?.unidade || "", doca: doc.doca || "",
    telefone: telefoneE164((doc.veiculo && doc.veiculo.contato) || p.telefone || ""),
  };
}

// deno-lint-ignore no-explicit-any
async function enviarAviso(admin: any, cfg: any, token: string | null, settings: any, a: any, tipo: string) {
  const { data: ja } = await admin.from("dt_avisos_enviados").select("ok").eq("agendamento_id", a.id).eq("tipo", tipo).maybeSingle();
  if (ja?.ok) return { ok: true, jaEnviado: true };
  const v = await variaveis(a, cfg, settings);
  if (!v.telefone) {
    await admin.from("dt_avisos_enviados").upsert({ agendamento_id: a.id, tipo, ts: new Date().toISOString(), ok: false, detalhe: "Pedido sem telefone do cliente." });
    return { ok: false, detalhe: "Pedido sem telefone do cliente." };
  }
  const mensagem = preencher((cfg.modelos && cfg.modelos[tipo]) || MODELOS[tipo], v);
  const r = await postar(cfg, token, { evento: tipo, mensagem, telefone: v.telefone, cliente: v.cliente, pedido: v.pedido, data: a.data, hora: v.hora, link: v.link, unidade: v.unidade, enviadoEm: new Date().toISOString() });
  await admin.from("dt_avisos_enviados").upsert({ agendamento_id: a.id, tipo, ts: new Date().toISOString(), ok: r.ok, detalhe: r.detalhe.slice(0, 300) });
  return r;
}

// deno-lint-ignore no-explicit-any
function deveEnviar(cfg: any, tipo: string, a: any) {
  if (cfg.modo !== "webhook" || !cfg.webhookUrl) return false;
  if (!cfg.eventos || cfg.eventos[tipo] === false) return false;
  const doc = a.doc || {};
  if (tipo === "confirmacao") return PRE_CHEGADA.indexOf(a.status) >= 0;
  if (tipo === "pronto") return doc.prep === "Pronto para retirada" && PRE_CHEGADA.indexOf(a.status) >= 0;
  if (tipo === "lembrete") return PRE_CHEGADA.indexOf(a.status) >= 0 && a.status !== "Cliente a caminho";
  return false;
}

/* ---------------- Resumo diário ---------------- */
const difMin = (a?: string, b?: string) => (a && b ? (Date.parse(b) - Date.parse(a)) / 60000 : null);
// deno-lint-ignore no-explicit-any
async function montarResumo(admin: any, settings: any, dia: string) {
  const { data: ags } = await admin.from("dt_agendamentos").select("id, status, data, hora, doc").eq("data", dia).limit(1000);
  const l = ags || [];
  // deno-lint-ignore no-explicit-any
  const n = (f: (a: any) => boolean) => l.filter(f).length;
  // deno-lint-ignore no-explicit-any
  const comChegada = l.filter((a: any) => a.doc?.chegada);
  // deno-lint-ignore no-explicit-any
  const prontosAntes = comChegada.filter((a: any) => { const t = a.doc?.etapas?.["Pronto para retirada"]?.ts; return t && Date.parse(t) <= Date.parse(a.doc.chegada); }).length;
  // deno-lint-ignore no-explicit-any
  const esperas = comChegada.map((a: any) => difMin(a.doc.chegada, a.doc.inicioAtendimento)).filter((x: number | null) => x !== null && x >= 0) as number[];
  // deno-lint-ignore no-explicit-any
  const atend = l.map((a: any) => difMin(a.doc?.inicioAtendimento, a.doc?.entrega)).filter((x: number | null) => x !== null && x >= 0) as number[];
  const media = (v: number[]) => (v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null);
  const metaAt = Number(settings?.metaAtendimentoMin) || 15;
  const ind = {
    agendados: n((a) => a.status !== "Cancelado"),
    concluidos: n((a) => FINAL.indexOf(a.status) >= 0),
    naoCompareceu: n((a) => a.status === "Não compareceu"),
    cancelados: n((a) => a.status === "Cancelado"),
    pendentes: n((a) => PRE_CHEGADA.indexOf(a.status) >= 0 || ["Cliente chegou", "Em atendimento", "Carregamento iniciado"].indexOf(a.status) >= 0),
    esperaMediaMin: media(esperas),
    atendimentoMedioMin: media(atend),
    prontosAntesPct: comChegada.length ? Math.round(prontosAntes / comChegada.length * 100) : null,
    atendidosNoPrazoPct: esperas.length ? Math.round(esperas.filter((x) => x <= metaAt).length / esperas.length * 100) : null,
    metaProntoAntesPct: Number(settings?.metaProntoAntesPct) || 90,
    metaAtendidosPct: Number(settings?.metaAtendidosPct) || 80,
    metaAtendimentoMin: metaAt,
  };
  const pct = (x: number | null) => (x === null ? "—" : x + "%"), min = (x: number | null) => (x === null ? "—" : x + " min");
  const linhas: [string, string][] = [
    ["Agendados", String(ind.agendados)], ["Retiradas concluídas", String(ind.concluidos)], ["Não compareceram", String(ind.naoCompareceu)],
    ["Cancelados", String(ind.cancelados)], ["Ainda em andamento", String(ind.pendentes)],
    ["Espera média (chegada → doca)", min(ind.esperaMediaMin)], ["Atendimento médio (doca → entrega)", min(ind.atendimentoMedioMin)],
    ["Prontos antes da chegada", pct(ind.prontosAntesPct) + " (meta " + ind.metaProntoAntesPct + "%)"],
    ["Atendidos em até " + metaAt + " min", pct(ind.atendidosNoPrazoPct) + " (meta " + ind.metaAtendidosPct + "%)"],
  ];
  const assunto = "Drive Thru · resumo de " + fmtData(dia) + " · " + ind.concluidos + "/" + ind.agendados + " retiradas";
  const texto = "Resumo do Drive Thru — " + fmtData(dia) + (settings?.unidade ? " · " + settings.unidade : "") + "\n\n" + linhas.map((x) => "• " + x[0] + ": " + x[1]).join("\n");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const html = '<div style="font-family:Arial,sans-serif;color:#1f262c"><h2 style="color:#AB0F14;margin:0 0 4px">Drive Thru · resumo do dia</h2><p style="margin:0 0 12px;color:#5b6670">' + esc(fmtData(dia) + (settings?.unidade ? " · " + settings.unidade : "")) + '</p><table style="border-collapse:collapse">' +
    linhas.map((x) => '<tr><td style="padding:6px 14px 6px 0;border-bottom:1px solid #e3e7ea">' + esc(x[0]) + '</td><td style="padding:6px 0;border-bottom:1px solid #e3e7ea"><b>' + esc(x[1]) + "</b></td></tr>").join("") + "</table></div>";
  return { dia, assunto, texto, html, indicadores: ind };
}
const listaEmails = (s: unknown) => String(s || "").split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).slice(0, 20);

// deno-lint-ignore no-explicit-any
async function enviarResumo(admin: any, cfg: any, token: string | null, settings: any, forcar: boolean) {
  const r = cfg.resumo || {};
  if (cfg.modo !== "webhook" || !cfg.webhookUrl) return { ok: false, detalhe: "Configure o webhook de envio." };
  if (!forcar && !r.ativo) return { ok: true, ignorado: true };
  const dia = hojeBR();
  if (!forcar) {
    const hora = String(r.hora || "19:00");
    if (agoraBR().toISOString().slice(11, 16) < hora) return { ok: true, ignorado: true };
    const { data: ult } = await admin.from("dt_config").select("valor").eq("chave", "resumo_ultimo").maybeSingle();
    if (ult?.valor?.dia === dia) return { ok: true, ignorado: true };
  }
  const dest = listaEmails(r.destinatarios);
  if (!dest.length) return { ok: false, detalhe: "Informe ao menos um e-mail de destino." };
  const res = await montarResumo(admin, settings, dia);
  const p = await postar(cfg, token, { evento: "resumo_diario", destinatarios: dest, ...res, enviadoEm: new Date().toISOString() });
  const agora = new Date().toISOString();
  if (p.ok) await admin.from("dt_config").upsert({ chave: "resumo_ultimo", valor: { dia, ts: agora, destinatarios: dest.length }, atualizado_em: agora });
  return { ...p, assunto: res.assunto };
}

// deno-lint-ignore no-explicit-any
async function ciclo(admin: any, cfg: any, token: string | null, settings: any, forcar: boolean) {
  const agora = Date.now();
  const { data: c } = await admin.from("dt_config").select("valor").eq("chave", "avisos_ciclo").maybeSingle();
  const ult = c?.valor?.ultimo ? Date.parse(c.valor.ultimo) : 0;
  if (agora - ult < (forcar ? 15000 : 240000)) return { ok: true, ignorado: true, ultimo: c?.valor?.ultimo };
  const enviados: unknown[] = [], erros: unknown[] = [];
  if (cfg.modo === "webhook" && cfg.webhookUrl) {
    const dia = hojeBR();
    const { data: ags } = await admin.from("dt_agendamentos").select("id, codigo, status, data, hora, doc").gte("data", dia).in("status", PRE_CHEGADA).limit(400);
    const { data: env } = await admin.from("dt_avisos_enviados").select("agendamento_id, tipo, ok, ts, detalhe").in("agendamento_id", (ags || []).map((a: { id: string }) => a.id).concat(["-"]));
    // já enviado com sucesso, ou falhou há menos de 15 min (ou sem telefone): não tenta agora
    const bloqueado = new Set((env || []).filter((e: { ok: boolean; ts: string; detalhe?: string }) =>
      e.ok || /sem telefone/i.test(e.detalhe || "") || agora - Date.parse(e.ts) < 15 * 60000)
      .map((e: { agendamento_id: string; tipo: string }) => e.agendamento_id + "|" + e.tipo));
    const minLemb = Math.max(10, Number(cfg.lembreteMin) || 60);
    const hhmm = agoraBR().toISOString().slice(11, 16);
    const minAgora = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
    const fila: [unknown, string][] = [];
    // deno-lint-ignore no-explicit-any
    for (const a of (ags || []) as any[]) {
      const criado = a.doc?.criadoEm ? Date.parse(a.doc.criadoEm) : 0;
      // confirmação: só agendamentos recentes (não dispara para a base antiga ao ligar o recurso)
      if (deveEnviar(cfg, "confirmacao", a) && !bloqueado.has(a.id + "|confirmacao") && agora - criado < 6 * 3600000) fila.push([a, "confirmacao"]);
      if (deveEnviar(cfg, "pronto", a) && !bloqueado.has(a.id + "|pronto") && a.data === dia) fila.push([a, "pronto"]);
      if (deveEnviar(cfg, "lembrete", a) && !bloqueado.has(a.id + "|lembrete") && a.data === dia) {
        const m = Number(String(a.hora).slice(0, 2)) * 60 + Number(String(a.hora).slice(3, 5));
        if (m - minAgora <= minLemb && m - minAgora > 0) fila.push([a, "lembrete"]);
      }
    }
    for (const [a, tipo] of fila.slice(0, 40)) {
      const r = await enviarAviso(admin, cfg, token, settings, a, tipo);
      // deno-lint-ignore no-explicit-any
      ((r as any).ok ? enviados : erros).push({ pedido: (a as any).doc?.pedido?.numero, tipo, detalhe: (r as any).detalhe });
    }
  }
  const resumo = await enviarResumo(admin, cfg, token, settings, false);
  const ts = new Date(agora).toISOString();
  await admin.from("dt_config").upsert({ chave: "avisos_ciclo", valor: { ultimo: ts, enviados: enviados.length, erros: erros.length }, atualizado_em: ts });
  return { ok: true, enviados, erros: erros.slice(0, 10), resumo };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido." }, 405);
  const admin = createClient(SUPA, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: quem, error: erroQuem } = await admin.auth.getUser(jwt);
  if (erroQuem || !quem?.user) return json({ erro: "Sessão inválida. Entre novamente." }, 401);
  const { data: eu } = await admin.from("dt_usuarios").select("id, nome, perfil, ativo").eq("id", quem.user.id).maybeSingle();
  if (!eu?.ativo) return json({ erro: "Usuário sem acesso ao sistema." }, 403);
  const { data: confs } = await admin.from("dt_config").select("chave, valor").in("chave", ["perfis", "avisos", "settings"]);
  // deno-lint-ignore no-explicit-any
  const get = (k: string) => (confs || []).find((c: any) => c.chave === k)?.valor;
  const permissoes: string[] = get("perfis")?.[eu.perfil]?.permissoes ?? [];
  const pode = (p: string) => eu.perfil === "admin" || permissoes.includes(p);
  const cfg = get("avisos") || { modo: "link" };
  const settings = get("settings") || {};

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ erro: "Requisição inválida." }, 400); }
  const acao = String(body.acao || "");
  const config = ["resumo", "previa", "testar", "salvarToken", "statusToken"];
  if (config.indexOf(acao) >= 0 && !pode("config.alterar")) return json({ erro: "Seu perfil não pode configurar os avisos." }, 403);
  const audit = async (acaoTxt: string, ref: string, depois: string) => {
    const id = "aud_" + crypto.randomUUID().replace(/-/g, ""), ts = new Date().toISOString();
    await admin.from("dt_auditoria").insert({ id, ts, doc: { id, ts, userId: eu.id, usuario: eu.nome, acao: acaoTxt, entidade: "Avisos", referencia: ref, antes: null, depois } });
  };

  if (acao === "salvarToken") {
    const t = String(body.token ?? "");
    if (t.length > 2000) return json({ erro: "Token longo demais." }, 400);
    const { error } = await admin.rpc("dt_segredo_salvar", { p_nome: "dt_avisos_token", p_valor: t });
    if (error) return json({ erro: "Não foi possível guardar o token: " + error.message }, 400);
    await audit(t ? "Alterou token do webhook de avisos" : "Removeu token do webhook de avisos", "token", t ? "guardado no cofre" : "removido");
    return json({ ok: true, definido: !!t });
  }
  if (acao === "statusToken") {
    const { data } = await admin.rpc("dt_segredo_status", { p_nome: "dt_avisos_token" });
    return json({ ok: true, ...(data || {}) });
  }
  const { data: token } = await admin.rpc("dt_segredo_ler", { p_nome: "dt_avisos_token" });

  if (acao === "previa") return json({ ok: true, ...(await montarResumo(admin, settings, hojeBR())) });
  if (acao === "resumo") {
    const r = await enviarResumo(admin, cfg, token || null, settings, true);
    await audit("Enviou resumo diário", hojeBR(), r.ok ? "enviado" : "falhou: " + (r.detalhe || ""));
    return r.ok ? json(r) : json({ erro: "O webhook não aceitou: " + (r.detalhe || "falha"), ...r }, 400);
  }
  if (acao === "testar") {
    const tel = telefoneE164(String(body.telefone || ""));
    const r = await postar(cfg, token || null, { evento: "teste", mensagem: "Teste de aviso do Drive Thru Condor. Se você recebeu, a integração está funcionando.", telefone: tel, enviadoEm: new Date().toISOString() });
    await audit("Testou webhook de avisos", "teste", r.ok ? "ok" : "falhou");
    return r.ok ? json(r) : json({ erro: "O webhook não aceitou: " + (r.detalhe || "falha"), ...r }, 400);
  }
  if (acao === "ciclo") return json(await ciclo(admin, cfg, token || null, settings, !!body.forcar));
  if (acao === "evento") {
    const tipo = String(body.tipo || "");
    if (["confirmacao", "pronto"].indexOf(tipo) < 0) return json({ erro: "Tipo de aviso inválido." }, 400);
    const { data: a } = await admin.from("dt_agendamentos").select("id, codigo, status, data, hora, doc").eq("id", String(body.agendamentoId || "")).maybeSingle();
    if (!a) return json({ erro: "Agendamento não encontrado." }, 404);
    if (!deveEnviar(cfg, tipo, a)) return json({ ok: true, ignorado: true });
    return json(await enviarAviso(admin, cfg, token || null, settings, a, tipo));
  }
  return json({ erro: "Ação desconhecida." }, 400);
});
