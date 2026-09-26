/* =====================================================================
   Camada de dados
   ---------------------------------------------------------------------
   Nesta versão os dados ficam no navegador (localStorage), com
   fallback em memória se o armazenamento estiver bloqueado.
   Todas as telas acessam os dados só por DT.db, então trocar por uma
   API/banco (Oracle, Supabase, etc.) exige mudar apenas este arquivo.
   ===================================================================== */
window.DT = window.DT || {};

DT.db = (function () {
  const P = DT.APP.storagePrefix;
  const memoria = {};
  let persistente = true;

  function ler(chave) {
    try {
      const v = window.localStorage.getItem(P + chave);
      return v ? JSON.parse(v) : (memoria[chave] !== undefined ? memoria[chave] : null);
    } catch (e) {
      persistente = false;
      return memoria[chave] !== undefined ? memoria[chave] : null;
    }
  }
  function gravar(chave, valor) {
    memoria[chave] = valor;
    try { window.localStorage.setItem(P + chave, JSON.stringify(valor)); }
    catch (e) { persistente = false; }
  }
  function remover(chave) {
    delete memoria[chave];
    try { window.localStorage.removeItem(P + chave); } catch (e) { /* ignora */ }
  }

  const COLECOES = ['users', 'perfis', 'funcionarios', 'agendamentos', 'auditoria', 'settings', 'meta'];

  function get(col) { return ler(col); }
  function set(col, valor) { gravar(col, valor); }

  function meta() { return ler('meta') || {}; }
  function settings() { return Object.assign({}, DT.DEFAULT_SETTINGS, ler('settings') || {}); }
  function perfis() { return ler('perfis') || JSON.parse(JSON.stringify(DT.DEFAULT_PERFIS)); }

  function agendamentos() { return ler('agendamentos') || []; }
  function salvarAgendamento(ag) {
    const lista = agendamentos();
    const i = lista.findIndex(a => a.id === ag.id);
    if (i >= 0) lista[i] = ag; else lista.push(ag);
    gravar('agendamentos', lista);
    return ag;
  }
  function agendamentoPorId(id) { return agendamentos().find(a => a.id === id) || null; }

  function users() { return ler('users') || []; }
  function funcionarios() { return ler('funcionarios') || []; }
  function auditoria() { return ler('auditoria') || []; }
  function registrarAuditoria(reg) {
    const lista = auditoria();
    lista.push(reg);
    gravar('auditoria', lista);
  }

  function limparTudo() { COLECOES.forEach(remover); }
  function estaPersistindo() { return persistente; }

  return { get, set, meta, settings, perfis, agendamentos, salvarAgendamento, agendamentoPorId,
    users, funcionarios, auditoria, registrarAuditoria, limparTudo, estaPersistindo };
})();

/* Sessão do usuário logado */
DT.session = (function () {
  const K = DT.APP.storagePrefix + 'sessao';
  let mem = null;
  function get() {
    let s = mem;
    try { const v = window.sessionStorage.getItem(K); if (v) s = JSON.parse(v); } catch (e) { /* usa memória */ }
    if (s && Date.now() > s.expira) { clear(); return null; }
    return s;
  }
  function set(userId) {
    mem = { userId: userId, inicio: Date.now(), expira: Date.now() + DT.APP.sessaoHoras * 3600000 };
    try { window.sessionStorage.setItem(K, JSON.stringify(mem)); } catch (e) { /* memória */ }
  }
  function clear() {
    mem = null;
    try { window.sessionStorage.removeItem(K); } catch (e) { /* ignora */ }
  }
  return { get, set, clear };
})();
