// Drive Thru — gestão de usuários (criar, alterar, trocar senha, desativar)
// Só usuários ativos com a permissão 'usuarios.gerenciar' podem chamar.
// A chave de serviço (SUPABASE_SERVICE_ROLE_KEY) é fornecida pelo próprio Supabase
// ao rodar a função; ela nunca fica no navegador nem neste arquivo.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const DOMINIO = "@drivethru.app";   // mesmo valor de DT.SUPABASE.dominioLogin em js/config.js
const PERFIS_VALIDOS = new Set(["comercial", "logistica", "coletor", "gestor", "admin"]);

// Mesma regra do aplicativo (DT.SENHA) e da configuração do Supabase
const SENHA_MINIMO = 8;
const SIMBOLOS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";
function validarSenha(s: string): string | null {
  const falta: string[] = [];
  if (s.length < SENHA_MINIMO) falta.push(`pelo menos ${SENHA_MINIMO} caracteres`);
  if (!/[a-z]/.test(s)) falta.push("uma letra minúscula");
  if (!/[A-Z]/.test(s)) falta.push("uma letra maiúscula");
  if (!/[0-9]/.test(s)) falta.push("um número");
  if (!s.split("").some((c) => SIMBOLOS.includes(c))) falta.push("um símbolo (ex.: ! @ # $ %)");
  return falta.length ? "A senha precisa ter " + falta.join(", ") + "." : null;
}
function mensagemAuth(msg: string): string {
  if (/weak|pwned|leak/i.test(msg)) return "O servidor recusou a senha por ser fraca ou já ter aparecido em vazamentos. Escolha outra.";
  return msg;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: quem, error: erroQuem } = await admin.auth.getUser(token);
  if (erroQuem || !quem?.user) return json({ erro: "Sessão inválida. Entre novamente." }, 401);

  const { data: eu } = await admin.from("dt_usuarios").select("id, perfil, ativo").eq("id", quem.user.id).maybeSingle();
  const { data: cfg } = await admin.from("dt_config").select("valor").eq("chave", "perfis").maybeSingle();
  const permissoes: string[] = eu ? (cfg?.valor?.[eu.perfil]?.permissoes ?? []) : [];
  const pode = !!eu?.ativo && (eu.perfil === "admin" || permissoes.includes("usuarios.gerenciar"));
  if (!pode) return json({ erro: "Seu perfil não pode gerenciar usuários." }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ erro: "Requisição inválida." }, 400); }

  const nome = String(body.nome ?? "").trim();
  const email = String(body.email ?? "").trim();
  const perfil = String(body.perfil ?? "");
  const senha = body.senha ? String(body.senha) : "";
  const ativo = body.ativo !== false;
  if (perfil && !PERFIS_VALIDOS.has(perfil)) return json({ erro: "Perfil inválido." }, 400);
  if (senha) {
    const erroSenha = validarSenha(senha);
    if (erroSenha) return json({ erro: erroSenha }, 400);
  }

  if (body.acao === "criar") {
    const login = String(body.login ?? "").trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,}$/.test(login)) return json({ erro: "Login inválido (mínimo 3 caracteres: letras, números, ponto, hífen)." }, 400);
    if (!nome) return json({ erro: "Informe o nome." }, 400);
    if (!senha) return json({ erro: "Informe a senha inicial." }, 400);
    const { data: existe } = await admin.from("dt_usuarios").select("id").eq("login", login).maybeSingle();
    if (existe) return json({ erro: "Já existe um usuário com esse login." }, 409);
    const { data: novo, error } = await admin.auth.admin.createUser({
      email: login + DOMINIO, password: senha, email_confirm: true, user_metadata: { login, nome },
    });
    if (error || !novo?.user) return json({ erro: "Não foi possível criar o usuário: " + mensagemAuth(error?.message ?? "erro desconhecido") }, 400);
    const { error: e2 } = await admin.from("dt_usuarios").insert({
      id: novo.user.id, login, nome, email, perfil: perfil || "comercial", ativo,
    });
    if (e2) {
      await admin.auth.admin.deleteUser(novo.user.id);
      return json({ erro: "Não foi possível salvar o usuário: " + e2.message }, 400);
    }
    if (!ativo) await admin.auth.admin.updateUserById(novo.user.id, { ban_duration: "876000h" });
    return json({ ok: true, id: novo.user.id });
  }

  if (body.acao === "atualizar") {
    const id = String(body.id ?? "");
    const { data: alvo } = await admin.from("dt_usuarios").select("id").eq("id", id).maybeSingle();
    if (!alvo) return json({ erro: "Usuário não encontrado." }, 404);
    const proprio = id === quem.user.id;
    // Senha nova: valida no Auth antes de gravar os demais dados
    if (senha) {
      const { error: eSenha } = await admin.auth.admin.updateUserById(id, { password: senha });
      if (eSenha) return json({ erro: "Não foi possível trocar a senha: " + mensagemAuth(eSenha.message) }, 400);
    }
    const campos: Record<string, unknown> = {};
    if (nome) campos.nome = nome;
    campos.email = email;
    if (!proprio && perfil) campos.perfil = perfil;          // ninguém muda o próprio perfil
    if (!proprio) campos.ativo = ativo;                      // nem desativa a si mesmo
    const { error } = await admin.from("dt_usuarios").update(campos).eq("id", id);
    if (error) return json({ erro: "Não foi possível salvar: " + error.message }, 400);
    if (!proprio) {
      const { error: e3 } = await admin.auth.admin.updateUserById(id, { ban_duration: ativo ? "none" : "876000h" });
      if (e3) return json({ erro: "Dados salvos, mas houve erro no acesso: " + e3.message }, 400);
    }
    return json({ ok: true });
  }

  return json({ erro: "Ação desconhecida." }, 400);
});
