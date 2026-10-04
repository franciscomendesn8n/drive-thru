/* =====================================================================
   DRIVE THRU — Monitoramento
   • Registra erros das telas (e falhas do ERP) no servidor, com a versão
     e a tela onde aconteceram, para o Administrador acompanhar.
   • Cartão "Saúde do sistema" em Configurações.
   • Aviso ao Administrador quando o ERP falhar repetidas vezes.
   ===================================================================== */
DT.monitor = (function () {
  const U = DT.util;
  const locais = [];                      // modo demonstração: erros só nesta sessão
  const vistos = {};
  let enviados = 0, timerBanner = null;

  function tela() { return (location.hash || '#').split('/')[0].slice(1) || 'inicio'; }
  function registrar(onde, mensagem, detalhe) {
    const msg = String(mensagem || 'Erro desconhecido').slice(0, 500);
    const chave = onde + '|' + msg;
    const agora = Date.now();
    if (vistos[chave] && agora - vistos[chave] < 10 * 60000) return;   // mesmo erro: no máx. 1 a cada 10 min
    vistos[chave] = agora;
    if (enviados >= 30) return;                                       // limite por sessão
    enviados++;
    const u = DT.auth && DT.auth.usuarioAtual ? DT.auth.usuarioAtual() : null;
    const reg = { usuario: u ? u.nome + ' (' + u.login + ')' : null, versao: DT.APP.versao, tela: onde || tela(), mensagem: msg, detalhe: detalhe ? String(detalhe).slice(0, 2000) : null };
    locais.unshift(Object.assign({ ts: new Date().toISOString() }, reg));
    if (locais.length > 50) locais.pop();
    if (DT.db && DT.db.modoNuvem && DT.db.modoNuvem() && DT.nuvem && DT.nuvem.temSessao && DT.nuvem.temSessao()) DT.nuvem.registrarErro(reg);
  }
  window.addEventListener('error', e => {
    if (!e || !e.message) return;
    if (/^Script error\.?$/.test(e.message)) return;               // erro de script externo sem detalhes
    registrar(tela(), e.message, (e.filename ? e.filename.split('/').pop() + ':' + e.lineno + ':' + e.colno : '') + (e.error && e.error.stack ? '\n' + e.error.stack : ''));
  });
  window.addEventListener('unhandledrejection', e => {
    const r = e && e.reason;
    const msg = r && r.message ? r.message : String(r);
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return; // queda de conexão: tratada pela fila
    registrar(tela(), 'Promessa rejeitada: ' + msg, r && r.stack ? r.stack : null);
  });

  async function recentes(n) {
    if (DT.db.modoNuvem()) return DT.nuvem.listarErros(n || 30);
    return locais.slice(0, n || 30);
  }

  /* Aviso no topo para o Administrador quando o ERP está falhando */
  async function verificarErp() {
    const box = document.getElementById('banner-sistema');
    if (!box) return;
    if (!DT.db.modoNuvem() || !DT.auth.pode('config.alterar') || !(DT.db.get('erp') || {}).ativo) { box.innerHTML = ''; return; }
    try {
      const l = await DT.nuvem.listarErros(40);
      const lim = Date.now() - 30 * 60000;
      const erp = l.filter(x => x.tela === 'ERP' && Date.parse(x.ts) >= lim);
      box.innerHTML = erp.length >= 3 ? '<div class="notice crit banner-erp">' + DT.ui.icon('alert') + '<div><b>O ERP está falhando:</b> ' + erp.length + ' consultas com erro nos últimos 30 minutos (última: ' + U.esc(erp[0].mensagem) + '). <a href="#config/saude">Ver saúde do sistema</a></div></div>' : '';
    } catch (e) { box.innerHTML = ''; }
  }
  function iniciarBanner() {
    clearInterval(timerBanner);
    setTimeout(verificarErp, 4000);
    timerBanner = setInterval(verificarErp, 5 * 60000);
  }

  /* ---------- cartão "Saúde do sistema" ---------- */
  function montarSaude(box) {
    const ui = DT.ui, esc = U.esc;
    let erros = null, erroLista = null, testeErp = null;
    async function carregar() {
      try { erros = await recentes(30); erroLista = null; } catch (e) { erros = []; erroLista = e.message; }
      desenhar();
    }
    function desenhar() {
      const nuvem = DT.db.modoNuvem();
      const st = nuvem ? DT.nuvem.statusAtual() : 'local';
      const fila = nuvem ? DT.nuvem.pendentes() : 0;
      const erp = DT.db.get('erp') || {}, sep = DT.db.get('separacao') || {};
      const av = DT.avisos ? DT.avisos.config() : {}, ciclo = DT.db.get('avisos_ciclo');
      const ret = DT.db.get('retencao_execucao');
      const h24 = Date.now() - 86400000;
      const e24 = (erros || []).filter(x => Date.parse(x.ts) >= h24);
      box.innerHTML = '<section class="card"><div class="card-head"><h3>' + ui.icon('pulse') + ' Saúde do sistema</h3><span class="spacer"></span><button type="button" class="btn ghost sm" id="sd-atualizar">' + ui.icon('refresh', 'icon-sm') + 'Atualizar</button></div><div class="card-body stack">' +
        '<div class="saude-grid">' +
          '<div><span>Versão</span><b class="mono">' + esc(DT.APP.versao) + '</b></div>' +
          '<div><span>Dados</span><b>' + (nuvem ? 'Servidor (nuvem)' : 'Este navegador (demonstração)') + '</b></div>' +
          '<div><span>Conexão</span><b class="' + (navigator.onLine && st !== 'offline' && st !== 'erro' ? '' : 'crit-txt') + '">' + (navigator.onLine ? (nuvem ? esc(String(st)) : 'local') : 'sem internet') + '</b></div>' +
          '<div><span>Alterações aguardando envio</span><b class="' + (fila ? 'crit-txt' : '') + '">' + fila + '</b></div>' +
          '<div><span>ERP</span><b>' + (erp.ativo ? 'Ativo' : 'Base de demonstração') + '</b>' + (testeErp ? '<div class="subtle">' + esc(testeErp) + '</div>' : '') + '</div>' +
          '<div><span>Separação</span><b>' + esc(({ manual: 'Manual', erp: 'Status do ERP', coletor: 'Coletor item a item', bipe: 'Coletor por bipe' })[sep.modo] || 'Manual') + '</b></div>' +
          '<div><span>Avisos</span><b>' + esc(({ desligado: 'Desligados', link: 'Link do WhatsApp', webhook: 'Automático' })[av.modo] || '—') + '</b>' + (av.modo === 'webhook' ? '<div class="subtle">Último ciclo: ' + (ciclo && ciclo.ultimo ? U.fmtDataHora(ciclo.ultimo) : '—') + '</div>' : '') + '</div>' +
          '<div><span>Retenção (LGPD)</span><b>' + (ret && ret.ts ? U.fmtDataHora(ret.ts) : 'não executada') + '</b></div>' +
          '<div><span>Erros nas últimas 24 h</span><b class="' + (e24.length ? 'crit-txt' : '') + '">' + (erros ? e24.length : '…') + '</b></div>' +
        '</div>' +
        (erp.ativo && nuvem ? '<div class="row"><button type="button" class="btn ghost sm" id="sd-erp">' + ui.icon('refresh', 'icon-sm') + 'Testar conexão com o ERP</button></div>' : '') +
        '<div><span class="eyebrow">Últimos erros registrados</span>' +
          (erroLista ? '<div class="subtle">Não foi possível ler os erros: ' + esc(erroLista) + '</div>' :
          !erros ? '<div class="subtle">Carregando…</div>' : !erros.length ? '<div class="subtle">Nenhum erro registrado' + (nuvem ? '' : ' nesta sessão') + '.</div>' :
          erros.slice(0, 15).map(x => '<div class="saude-erro"><b>' + U.fmtDataHora(x.ts) + '</b> · ' + esc(x.tela || '—') + ' · ' + esc(x.usuario || '—') + ' · v' + esc(x.versao || '?') + '<div>' + esc(x.mensagem) + '</div>' + (x.detalhe ? '<code>' + esc(String(x.detalhe).split('\n')[0]) + '</code>' : '') + '</div>').join('')) +
        '</div></div></section>';
      box.querySelector('#sd-atualizar').addEventListener('click', carregar);
      const be = box.querySelector('#sd-erp');
      if (be) be.addEventListener('click', async () => {
        be.disabled = true; be.innerHTML = '<span class="spinner"></span>Testando…';
        const t0 = Date.now();
        try {
          await DT.nuvem.erpAcao('consultar', { numero: '0' });
          testeErp = 'Respondeu em ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s';
        } catch (e) {
          testeErp = /não encontrad|encontrado/i.test(e.message) ? 'Respondeu em ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s' : 'Falhou: ' + e.message;
        }
        desenhar();
      });
    }
    desenhar();
    carregar();
  }

  return { registrar, recentes, montarSaude, iniciarBanner, verificarErp };
})();
