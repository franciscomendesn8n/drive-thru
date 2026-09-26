/* =====================================================================
   Nuvem (Supabase) — login, carga, gravação e tempo real
   ---------------------------------------------------------------------
   As telas continuam usando DT.db (leitura síncrona em memória).
   Este módulo:
     • faz o login pelo Supabase Auth;
     • carrega as tabelas para a memória depois do login;
     • envia cada alteração ao banco (fila com nova tentativa);
     • recebe em tempo real o que outros usuários alteram.
   Sem DT.SUPABASE.url configurado, o sistema funciona no modo local.
   ===================================================================== */
window.DT = window.DT || {};

DT.nuvem = (function () {
  const cfg = DT.SUPABASE || {};
  const TAB = { agendamentos: 'dt_agendamentos', auditoria: 'dt_auditoria', funcionarios: 'dt_funcionarios', config: 'dt_config', usuarios: 'dt_usuarios' };
  const CONFIG_CHAVES = ['settings', 'perfis', 'meta'];
  let sb = null, sessao = null, canal = null;
  let status = 'desconectado';           // desconectado | sincronizado | salvando | erro
  let avisouErro = false;
  const fila = new Map();                 // 'tabela:id' -> { tabela, tipo: 'upsert'|'delete', linha|id }
  const ids = { agendamentos: new Set(), auditoria: new Set(), funcionarios: new Set() };
  let timerFila = null, timerAviso = null;
  const ouvintes = [];
  const sessaoEncerradaOuvintes = [];
  let saindo = false;
  function aoEncerrarSessao(fn) { sessaoEncerradaOuvintes.push(fn); }
  /* O servidor recusou a sessão: encerra localmente (dispara o aviso de sessão encerrada) */
  async function sessaoInvalida() {
    if (canal) { try { sb.removeChannel(canal); } catch (e) { /* ignora */ } canal = null; }
    try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* ignora */ }
  }

  const ativa = !!(cfg.url && cfg.chave && window.supabase && typeof window.supabase.createClient === 'function' && /^https?:$/.test(location.protocol));

  function cliente() {
    if (!sb && ativa) {
      sb = window.supabase.createClient(cfg.url, cfg.chave, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'dt-drive-thru-auth' }
      });
    }
    return sb;
  }

  /* ---------------------------- status ---------------------------- */
  function setStatus(s) {
    status = s;
    const el = document.getElementById('nuvem-status');
    if (el) {
      const txt = { sincronizado: 'Nuvem: sincronizado', salvando: 'Nuvem: salvando…', erro: 'Nuvem: sem conexão — tentando de novo', desconectado: 'Nuvem: desconectado' }[s];
      el.textContent = txt;
      el.dataset.s = s;
    }
  }
  function statusAtual() { return status; }

  /* ---------------------------- mapeamentos ---------------------------- */
  function linhaAgendamento(ag) {
    const tel = String((ag.pedido && ag.pedido.telefone) || '').replace(/\D/g, '');
    return {
      id: ag.id, pedido_numero: String(ag.pedido.numero), data: ag.data, hora: ag.hora, status: ag.status,
      codigo: DT.ag.codigo(ag), telefone_final: tel ? tel.slice(-4) : null, doc: ag, atualizado_em: new Date().toISOString()
    };
  }
  function usuarioDeLinha(r) {
    return { id: r.id, login: r.login, nome: r.nome, email: r.email || '', perfil: r.perfil, ativo: r.ativo, criadoEm: r.criado_em, ultimoAcesso: r.ultimo_acesso };
  }

  /* ---------------------------- fila de gravação ---------------------------- */
  function enfileirar(tabela, tipo, dado) {
    const chave = tabela + ':' + (tipo === 'delete' ? dado : (dado.id || dado.chave));
    fila.set(chave, { tabela: tabela, tipo: tipo, dado: dado });
    agendarEnvio(30);
  }
  function agendarEnvio(ms) {
    clearTimeout(timerFila);
    timerFila = setTimeout(enviar, ms);
  }
  async function enviar() {
    if (!fila.size || !sessao) return;
    setStatus('salvando');
    const lote = Array.from(fila.entries());
    lote.forEach(([k]) => fila.delete(k));
    const grupos = {};
    lote.forEach(([k, op]) => {
      const g = op.tabela + '|' + op.tipo;
      (grupos[g] = grupos[g] || []).push([k, op]);
    });
    let falhou = false;
    for (const g of Object.keys(grupos)) {
      const [tabela, tipo] = g.split('|');
      const itens = grupos[g];
      for (let i = 0; i < itens.length; i += 50) {
        const parte = itens.slice(i, i + 50);
        let resp;
        try {
          if (tipo === 'delete') {
            const chaveId = tabela === TAB.config ? 'chave' : 'id';
            resp = await sb.from(tabela).delete().in(chaveId, parte.map(([, op]) => op.dado));
          } else {
            const onConflict = tabela === TAB.config ? 'chave' : 'id';
            resp = await sb.from(tabela).upsert(parte.map(([, op]) => op.dado), { onConflict: onConflict });
          }
        } catch (e) { resp = { error: e }; }
        if (resp && resp.error) {
          falhou = true;
          // devolve à fila sem sobrescrever alterações mais novas
          parte.forEach(([k, op]) => { if (!fila.has(k)) fila.set(k, op); });
          console.warn('[nuvem] falha ao gravar em', tabela, resp.error);
          if (resp.error.code === '42501' || /row-level security/i.test(resp.error.message || '')) {
            parte.forEach(([k]) => fila.delete(k));
            DT.ui && DT.ui.toast('Sem permissão para gravar essa alteração no servidor.', 'err');
          }
        }
      }
    }
    if (falhou && fila.size) {
      setStatus('erro');
      if (!avisouErro && DT.ui) { avisouErro = true; DT.ui.toast('Sem conexão com o servidor. As alterações serão enviadas assim que a conexão voltar.', 'warn'); }
      agendarEnvio(5000);
    } else if (fila.size) {
      agendarEnvio(30);
    } else {
      avisouErro = false;
      setStatus('sincronizado');
    }
  }
  function pendentes() { return fila.size; }

  /* Chamado por DT.db quando uma coleção inteira é gravada */
  function sincronizar(col, valor) {
    if (!sessao) return;
    if (CONFIG_CHAVES.indexOf(col) >= 0) {
      enfileirar(TAB.config, 'upsert', { chave: col, valor: valor, atualizado_em: new Date().toISOString() });
      return;
    }
    if (col === 'agendamentos' || col === 'auditoria' || col === 'funcionarios') {
      const novos = new Set((valor || []).map(x => x.id));
      ids[col].forEach(id => { if (!novos.has(id)) enfileirar(TAB[col], 'delete', id); });
      (valor || []).forEach(x => {
        if (col === 'agendamentos') enfileirar(TAB.agendamentos, 'upsert', linhaAgendamento(x));
        else if (col === 'auditoria') { if (!ids.auditoria.has(x.id)) enfileirar(TAB.auditoria, 'upsert', { id: x.id, ts: x.ts, doc: x }); }
        else enfileirar(TAB.funcionarios, 'upsert', { id: x.id, doc: x, atualizado_em: new Date().toISOString() });
      });
      ids[col] = novos;
    }
    // 'users' é gerenciado pela função dt-usuarios no servidor
  }
  function salvarAgendamento(ag) {
    if (!sessao) return;
    ids.agendamentos.add(ag.id);
    enfileirar(TAB.agendamentos, 'upsert', linhaAgendamento(ag));
  }
  function inserirAuditoria(reg) {
    if (!sessao) return;
    ids.auditoria.add(reg.id);
    enfileirar(TAB.auditoria, 'upsert', { id: reg.id, ts: reg.ts, doc: reg });
  }

  /* ---------------------------- carga ---------------------------- */
  async function buscarTudo(tabela, ordem) {
    const passo = 1000;
    let de = 0, out = [];
    for (;;) {
      let q = sb.from(tabela).select('*').range(de, de + passo - 1);
      if (ordem) q = q.order(ordem, { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      out = out.concat(data || []);
      if (!data || data.length < passo) break;
      de += passo;
    }
    return out;
  }
  async function carregar() {
    const [conf, usuarios, funcs, ags, auds] = await Promise.all([
      buscarTudo(TAB.config), buscarTudo(TAB.usuarios), buscarTudo(TAB.funcionarios),
      buscarTudo(TAB.agendamentos, 'data'), buscarTudo(TAB.auditoria, 'ts')
    ]);
    const mem = DT.db.memoria;
    CONFIG_CHAVES.forEach(k => { const r = conf.find(c => c.chave === k); mem.gravar(k, r ? r.valor : null); });
    mem.gravar('users', usuarios.map(usuarioDeLinha));
    mem.gravar('funcionarios', funcs.map(r => r.doc));
    mem.gravar('agendamentos', ags.map(r => r.doc));
    mem.gravar('auditoria', auds.map(r => r.doc));
    ids.funcionarios = new Set(funcs.map(r => r.id));
    ids.agendamentos = new Set(ags.map(r => r.id));
    ids.auditoria = new Set(auds.map(r => r.id));
    setStatus('sincronizado');
  }
  async function recarregarUsuarios() {
    const usuarios = await buscarTudo(TAB.usuarios);
    DT.db.memoria.gravar('users', usuarios.map(usuarioDeLinha));
  }

  /* ---------------------------- tempo real ---------------------------- */
  function aoMudar(fn) { ouvintes.push(fn); }
  function avisar() {
    clearTimeout(timerAviso);
    timerAviso = setTimeout(() => ouvintes.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } }), 350);
  }
  function aplicarLista(col, novo, idRemovido) {
    const mem = DT.db.memoria;
    const lista = mem.ler(col) || [];
    if (idRemovido) {
      const i = lista.findIndex(x => x.id === idRemovido);
      if (i >= 0) lista.splice(i, 1);
      if (ids[col]) ids[col].delete(idRemovido);
    } else if (novo) {
      // não sobrescreve uma alteração local ainda não enviada ao servidor.
      // (Não comparamos horários: cada aparelho tem o próprio relógio e eles podem divergir.)
      if (fila.has(TAB[col] + ':' + novo.id)) return;
      const i = lista.findIndex(x => x.id === novo.id);
      if (i >= 0) lista[i] = novo;
      else lista.push(novo);
      if (ids[col]) ids[col].add(novo.id);
    }
    mem.gravar(col, lista);
  }
  function assinar() {
    if (canal) sb.removeChannel(canal);
    canal = sb.channel('dt-mudancas');
    const on = (tabela, fn) => canal.on('postgres_changes', { event: '*', schema: 'public', table: tabela }, fn);
    on(TAB.agendamentos, p => { if (p.eventType === 'DELETE') aplicarLista('agendamentos', null, p.old && p.old.id); else aplicarLista('agendamentos', p.new.doc); avisar(); });
    on(TAB.auditoria, p => { if (p.eventType === 'DELETE') aplicarLista('auditoria', null, p.old && p.old.id); else if (!ids.auditoria.has(p.new.id)) aplicarLista('auditoria', p.new.doc); avisar(); });
    on(TAB.funcionarios, p => { if (p.eventType === 'DELETE') aplicarLista('funcionarios', null, p.old && p.old.id); else aplicarLista('funcionarios', p.new.doc); avisar(); });
    on(TAB.config, p => { if (p.new && p.new.chave && !fila.has(TAB.config + ':' + p.new.chave)) { DT.db.memoria.gravar(p.new.chave, p.new.valor); avisar(); } });
    on(TAB.usuarios, () => { recarregarUsuarios().then(avisar).catch(() => {}); });
    canal.subscribe(st => {
      estadoCanal = st;
      if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') setStatus('erro');
    });
  }
  let estadoCanal = 'fechado';
  function tempoReal() { return estadoCanal; }

  /* ---------------------------- login ---------------------------- */
  async function iniciar() {
    if (!ativa) return false;
    cliente();
    const { data } = await sb.auth.getSession();
    sessao = data && data.session ? data.session : null;
    sb.auth.onAuthStateChange((evento, s) => {
      sessao = s;
      if (evento === 'SIGNED_OUT') {
        setStatus('desconectado');
        // Encerrada fora do botão "Sair" (senha trocada em outro aparelho, usuário desativado, token revogado)
        if (!saindo) setTimeout(() => sessaoEncerradaOuvintes.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } }), 0);
      }
    });
    return true;
  }
  function temSessao() { return !!sessao; }

  /* Confere no servidor se a sessão ainda vale (ex.: senha trocada em outro aparelho) */
  async function conferirSessao() {
    if (!sessao || saindo) return;
    try {
      const { error } = await sb.auth.getUser();
      if (error && (error.status === 401 || error.status === 403 || /session.*not.*found|missing|invalid/i.test(error.message || ''))) await sessaoInvalida();
    } catch (e) { /* sem internet: tenta de novo depois */ }
  }
  setInterval(conferirSessao, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') conferirSessao(); });
  function userId() { return sessao && sessao.user ? sessao.user.id : null; }

  async function prepararSessao() {
    // A sessão guardada no navegador pode ter sido revogada no servidor
    const conf = await sb.auth.getUser();
    if (conf.error && (conf.error.status === 401 || conf.error.status === 403 || /session.*not.*found|missing|invalid/i.test(conf.error.message || ''))) {
      saindo = true;
      try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* ignora */ }
      saindo = false;
      sessao = null;
      return { ok: false, erro: 'Sua sessão foi encerrada. Entre novamente.' };
    }
    await carregar();
    const u = DT.db.users().find(x => x.id === userId());
    if (!u || !u.ativo) {
      await sb.auth.signOut();
      sessao = null;
      return { ok: false, erro: 'Usuário sem acesso ao sistema ou inativo. Procure o administrador.' };
    }
    assinar();
    return { ok: true };
  }
  async function login(loginTxt, senha) {
    const email = String(loginTxt || '').trim().toLowerCase() + (cfg.dominioLogin || '@drivethru.app');
    const { data, error } = await sb.auth.signInWithPassword({ email: email, password: senha });
    if (error) {
      if (/fetch|network/i.test(error.message || '')) return { ok: false, erro: 'Não foi possível conectar ao servidor. Verifique a internet.' };
      if (/banned/i.test(error.message || '')) return { ok: false, erro: 'Usuário inativo. Procure o administrador.' };
      // Senha correta, mas fora das regras de segurança configuradas no Supabase
      if (error.code === 'weak_password' || error.name === 'AuthWeakPasswordError' || /weak.?password/i.test(error.message || '')) {
        return { ok: false, erro: 'Sua senha não atende às novas regras de segurança. Peça ao administrador para redefini-la.' };
      }
      return { ok: false, erro: 'Usuário ou senha incorretos.' };
    }
    sessao = data.session;
    try {
      const r = await prepararSessao();
      if (!r.ok) return r;
    } catch (e) {
      return { ok: false, erro: 'Entrou, mas não foi possível carregar os dados: ' + (e.message || e) };
    }
    sb.rpc('dt_registrar_acesso').then(() => {}, () => {});
    // O Supabase deixa entrar, mas avisa quando a senha está fora das regras de segurança
    return { ok: true, senhaFraca: !!(data && data.weakPassword) };
  }

  /* Troca da senha do próprio usuário (o Supabase aplica as regras de segurança do projeto) */
  async function trocarMinhaSenha(atual, nova) {
    // confirma a senha atual antes de trocar (evita troca num computador que ficou aberto)
    const email = sessao && sessao.user ? sessao.user.email : null;
    if (!email) return { ok: false, erro: 'Sessão encerrada. Entre novamente.' };
    const conf = await sb.auth.signInWithPassword({ email: email, password: atual });
    if (conf.error) {
      if (/fetch|network/i.test(conf.error.message || '')) return { ok: false, erro: 'Não foi possível conectar ao servidor. Verifique a internet.' };
      return { ok: false, erro: 'A senha atual está incorreta.' };
    }
    sessao = conf.data.session;
    if (atual === nova) return { ok: false, erro: 'A nova senha precisa ser diferente da atual.' };
    const { error } = await sb.auth.updateUser({ password: nova });
    if (!error) return { ok: true };
    const msg = error.message || '';
    if (error.code === 'same_password' || /different from the old/i.test(msg)) return { ok: false, erro: 'A nova senha precisa ser diferente da atual.' };
    if (error.code === 'weak_password' || error.name === 'AuthWeakPasswordError') return { ok: false, erro: 'O servidor recusou a senha por ser fraca ou já ter aparecido em vazamentos. Escolha outra.' };
    if (/reauthent|nonce/i.test(msg)) return { ok: false, erro: 'Por segurança, saia e entre de novo antes de trocar a senha.' };
    if (/fetch|network/i.test(msg)) return { ok: false, erro: 'Não foi possível conectar ao servidor. Verifique a internet.' };
    return { ok: false, erro: 'Não foi possível trocar a senha: ' + msg };
  }
  async function logout() {
    saindo = true;
    try { await enviar(); } catch (e) { /* ignora */ }
    if (canal) { sb.removeChannel(canal); canal = null; }
    try { await sb.auth.signOut(); } catch (e) { try { await sb.auth.signOut({ scope: 'local' }); } catch (e2) { /* ignora */ } }
    saindo = false;
    sessao = null;
    ['users', 'funcionarios', 'agendamentos', 'auditoria', 'settings', 'perfis', 'meta'].forEach(k => DT.db.memoria.gravar(k, null));
  }

  /* ---------------------------- funções de servidor ---------------------------- */
  async function gerenciarUsuario(dados) {
    const { data, error } = await sb.functions.invoke('dt-usuarios', { body: dados });
    if (error) {
      let msg = null;
      const status = error.context && error.context.status;
      try { const j = await error.context.json(); msg = j && j.erro; } catch (e) { /* sem corpo */ }
      if (status === 401) { await sessaoInvalida(); msg = 'Sua sessão foi encerrada. Entre novamente.'; }
      throw new Error(msg || 'Falha ao falar com o servidor.');
    }
    if (data && data.erro) throw new Error(data.erro);
    await recarregarUsuarios();
    return data;
  }
  async function acompanhar(codigo) {
    cliente();
    const { data, error } = await sb.rpc('dt_acompanhar', { p_codigo: codigo });
    if (error) throw error;
    return data;
  }
  async function acompanharPorPedido(numero, final) {
    cliente();
    const { data, error } = await sb.rpc('dt_acompanhar_pedido', { p_numero: numero, p_final: final });
    if (error) throw error;
    return data;
  }

  window.addEventListener('beforeunload', e => {
    if (fila.size) { e.preventDefault(); e.returnValue = ''; }
  });

  return { ativa, iniciar, temSessao, userId, prepararSessao, login, logout, carregar, recarregarUsuarios,
    sincronizar, salvarAgendamento, inserirAuditoria, pendentes, enviar, aoMudar, statusAtual, setStatus, tempoReal,
    gerenciarUsuario, acompanhar, acompanharPorPedido, trocarMinhaSenha, aoEncerrarSessao, conferirSessao };
})();
