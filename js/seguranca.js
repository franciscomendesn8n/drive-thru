/* =====================================================================
   DRIVE THRU — Segurança e dados
   • Retenção (LGPD): apaga, após o prazo escolhido, agendamentos já
     finalizados e registros antigos de auditoria. Roda sozinha uma vez
     por dia quando o Administrador entra, ou pelo botão "Aplicar agora".
   • Checklist de produção: o que falta para operar de verdade
     (usuários de demonstração, dados de teste, DPO, ERP, contas…).
   • Atualização de perfis da versão 0.9.0 (permissão do painel de TV).
   ===================================================================== */
DT.seguranca = (function () {
  const U = DT.util;
  const LOGINS_DEMO = ['joao.silva', 'fernanda.rocha', 'inacio.sardinha', 'ana.santos', 'carlos.lima', 'marcos.pereira', 'gestor'];
  const ehAdmin = () => { const u = DT.auth.usuarioAtual(); return !!(u && u.perfil === 'admin'); };

  /* ---------- migração de perfis (0.9.0) ---------- */
  function migrarPerfis() {
    if (!(ehAdmin() || DT.auth.pode('usuarios.gerenciar'))) return;
    const meta = DT.db.meta();
    const feitas = meta.migracoes || [];
    if (feitas.indexOf('0.9.0-painel') >= 0) return;
    const p = DT.db.get('perfis');
    if (p) {
      const novo = JSON.parse(JSON.stringify(p));
      let mudou = false;
      ['logistica', 'gestor', 'admin'].forEach(k => { if (novo[k] && novo[k].permissoes.indexOf('painel.ver') < 0) { novo[k].permissoes.push('painel.ver'); mudou = true; } });
      if (mudou) {
        DT.db.set('perfis', novo);
        DT.audit.registrar('Incluiu permissão do painel de TV', 'Perfis', 'Logística, Gestor e Administrador', null, 'painel.ver');
      }
    }
    DT.db.set('meta', Object.assign({}, meta, { migracoes: feitas.concat(['0.9.0-painel']) }));
  }

  /* ---------- retenção ---------- */
  function prazos() {
    const s = DT.db.settings();
    return { ag: Number(s.retencaoAgendamentosMeses) || 0, aud: Number(s.retencaoAuditoriaMeses) || 0 };
  }
  function limiteData(meses) {
    const d = new Date(); d.setMonth(d.getMonth() - meses); return d;
  }
  function aplicarLocal() {
    const p = prazos(), fin = DT.STATUS_GRUPOS.finalizados;
    let nAg = 0, nAud = 0;
    if (p.ag > 0) {
      const lim = U.dataISO(limiteData(p.ag));
      const l = DT.db.agendamentos(), fica = l.filter(a => !(a.data < lim && fin.indexOf(a.status) >= 0));
      nAg = l.length - fica.length;
      if (nAg) DT.db.set('agendamentos', fica);
    }
    if (p.aud > 0) {
      const lim = limiteData(p.aud).toISOString();
      const l = DT.db.auditoria(), fica = l.filter(x => !(x.ts < lim));
      nAud = l.length - fica.length;
      if (nAud) DT.db.set('auditoria', fica);
    }
    const u = DT.auth.usuarioAtual();
    DT.db.set('retencao_execucao', { ts: new Date().toISOString(), por: u ? u.nome : '', agendamentos: nAg, auditoria: nAud, erros: 0 });
    DT.audit.registrar('Aplicou retenção de dados (LGPD)', 'Configuração', 'retencao', null, nAg + ' agendamento(s) e ' + nAud + ' registro(s) de auditoria apagados');
    return { agendamentos: nAg, auditoria: nAud, erros: 0 };
  }
  async function aplicar() {
    if (!ehAdmin()) throw new Error('Somente o Administrador aplica a retenção de dados.');
    if (DT.db.modoNuvem()) return DT.nuvem.aplicarRetencao();
    return aplicarLocal();
  }
  function aoEntrar() {
    migrarPerfis();
    if (!ehAdmin()) return;
    const p = prazos();
    if (!p.ag && !p.aud) return;
    const ult = DT.db.get('retencao_execucao');
    if (ult && ult.ts && ult.ts.slice(0, 10) === U.dataISO()) return;
    setTimeout(() => { aplicar().catch(() => { /* tenta no próximo acesso */ }); }, 15000);
  }

  /* ---------- cartão: retenção ---------- */
  function montarRetencao(box, aoMudar) {
    const ui = DT.ui, esc = U.esc, admin = ehAdmin();
    const opcoes = [0, 6, 12, 24, 36, 60].map(m => ({ value: String(m), label: m ? m + ' meses' + (m >= 12 ? ' (' + (m / 12) + ' ano' + (m > 12 ? 's' : '') + ')' : '') : 'Manter sempre (não apagar)' }));
    function desenhar() {
      const p = prazos(), ult = DT.db.get('retencao_execucao');
      box.innerHTML = '<section class="card"><div class="card-head"><h3>' + ui.icon('shield') + ' Retenção de dados (LGPD)</h3></div><div class="card-body stack">' +
        '<p class="muted">Dados pessoais devem ficar guardados só pelo tempo necessário. Escolha por quanto tempo manter o histórico; o que passar do prazo é apagado automaticamente uma vez por dia (quando o Administrador entra no sistema).</p>' +
        '<div class="fields-2">' +
          '<div class="field"><label for="rt-ag">Agendamentos finalizados</label><select id="rt-ag" class="select"' + (admin ? '' : ' disabled') + '>' + ui.options(opcoes, String(p.ag)) + '</select><span class="hint">Concluídos, cancelados e não comparecimentos, contados pela data da retirada.</span></div>' +
          '<div class="field"><label for="rt-aud">Registros da auditoria</label><select id="rt-aud" class="select"' + (admin ? '' : ' disabled') + '>' + ui.options(opcoes, String(p.aud)) + '</select><span class="hint">Recomendado: ao menos 12 meses.</span></div>' +
        '</div>' +
        '<div class="notice info">' + ui.icon('info') + '<div>' + (ult && ult.ts ? 'Última execução: <b>' + U.fmtDataHora(ult.ts) + '</b> por ' + esc(ult.por || '—') + ' — ' + (ult.agendamentos || 0) + ' agendamento(s), ' + (ult.auditoria || 0) + ' registro(s) de auditoria' + (ult.erros ? ' e ' + ult.erros + ' erro(s) de tela' : '') + ' apagados.' : 'A retenção ainda não foi executada.') +
          (DT.db.modoNuvem() ? ' Os registros de erro das telas são apagados após 90 dias.' : '') + '</div></div>' +
        '</div>' + (admin ? '<div class="card-foot row end"><button type="button" class="btn ghost" id="rt-aplicar">' + ui.icon('refresh') + 'Aplicar agora</button><button type="button" class="btn primary" id="rt-salvar">' + ui.icon('check') + 'Salvar prazos</button></div>' : '') +
        '</section>';
      if (!admin) return;
      box.querySelector('#rt-salvar').addEventListener('click', () => {
        const ag = Number(box.querySelector('#rt-ag').value), aud = Number(box.querySelector('#rt-aud').value);
        const antes = DT.db.settings();
        if (ag === (Number(antes.retencaoAgendamentosMeses) || 0) && aud === (Number(antes.retencaoAuditoriaMeses) || 0)) { ui.toast('Nenhuma alteração para salvar.', 'warn'); return; }
        DT.db.set('settings', Object.assign({}, antes, { retencaoAgendamentosMeses: ag, retencaoAuditoriaMeses: aud }));
        DT.audit.registrar('Alterou retenção de dados', 'Configuração', 'retencao', (antes.retencaoAgendamentosMeses || 0) + '/' + (antes.retencaoAuditoriaMeses || 0) + ' meses', ag + '/' + aud + ' meses');
        ui.toast('Prazos de retenção salvos.');
        desenhar(); if (aoMudar) aoMudar();
      });
      box.querySelector('#rt-aplicar').addEventListener('click', async () => {
        const p = prazos();
        if (!p.ag && !p.aud) { ui.toast('Defina e salve um prazo antes de aplicar.', 'warn'); return; }
        const r = await ui.confirmar({ titulo: 'Aplicar retenção agora', perigo: true, ok: 'Apagar dados antigos',
          mensagem: 'Serão apagados ' + (p.ag ? 'os agendamentos finalizados com retirada há mais de <b>' + p.ag + ' meses</b>' : '') + (p.ag && p.aud ? ' e ' : '') + (p.aud ? 'os registros de auditoria com mais de <b>' + p.aud + ' meses</b>' : '') + '. Não é possível desfazer.' });
        if (!r.ok) return;
        try {
          const x = await aplicar();
          ui.toast('Retenção aplicada: ' + (x.agendamentos || 0) + ' agendamento(s) e ' + (x.auditoria || 0) + ' registro(s) de auditoria apagados.', 'ok', 8000);
          desenhar(); if (aoMudar) aoMudar();
        } catch (e) { ui.toast(e.message, 'crit', 8000); }
      });
    }
    desenhar();
  }

  /* ---------- cartão: checklist de produção ---------- */
  const MANUAIS = [
    ['dominio', 'Endereço próprio da Condor (domínio) para o sistema', 'Ex.: drivethru.condor.com.br apontando para o site publicado.'],
    ['contas', 'Contas do GitHub e do Supabase em nome da empresa (e-mail corporativo)', 'Evita depender de uma conta pessoal; ative a verificação em duas etapas.'],
    ['plano', 'Plano pago do Supabase (backup diário e sem pausa por inatividade)', 'O plano gratuito pausa o projeto após dias sem uso e não tem backup diário.'],
    ['juridico', 'Termo LGPD revisado pelo Jurídico', 'Texto do termo exibido após o login e na página do cliente.'],
    ['senhas', 'Senhas iniciais trocadas por todos os usuários', 'Cada usuário entra e troca a senha pelo menu do perfil.']
  ];
  function itensAutomaticos() {
    const s = DT.db.settings(), meta = DT.db.meta(), eu = DT.auth.usuarioAtual();
    const demo = DT.db.users().filter(u => u.ativo && LOGINS_DEMO.indexOf(u.login) >= 0 && (!eu || u.id !== eu.id));
    const erp = DT.db.get('erp') || {};
    const av = DT.avisos ? DT.avisos.config() : { modo: 'link' };
    return [
      { id: 'demoUsers', ok: !demo.length, titulo: 'Usuários de demonstração desativados', det: demo.length ? demo.length + ' ativo(s): ' + demo.map(u => u.login).join(', ') : 'Nenhum usuário de demonstração ativo.', acao: demo.length ? 'Desativar agora' : null, demo: demo },
      { id: 'demoDados', ok: !meta.seeded || !!meta.operacaoReal, titulo: 'Dados de demonstração removidos', det: !meta.seeded || meta.operacaoReal ? 'Operação real iniciada.' : 'Ainda há agendamentos e auditoria de demonstração.', acao: !meta.seeded || meta.operacaoReal ? null : 'Começar operação real' },
      { id: 'erp', ok: !!erp.ativo, titulo: 'Integração com o ERP ativa', det: erp.ativo ? 'Consultando o ERP da Condor.' : 'Usando a base de demonstração.', link: 'erp' },
      { id: 'cd', ok: !!s.localCD, titulo: 'Local do CD definido no mapa', det: s.localCD ? 'Definido.' : 'Necessário para o alerta de "cliente chegando".', href: '#mapa' },
      { id: 'dpo', ok: !!(s.lgpdEncarregado || '').trim(), titulo: 'Encarregado de Dados (DPO) informado', det: (s.lgpdEncarregado || '').trim() ? s.lgpdEncarregado : 'Aparece no termo LGPD.', link: 'operacao' },
      { id: 'ret', ok: !!(Number(s.retencaoAgendamentosMeses) || Number(s.retencaoAuditoriaMeses)), titulo: 'Prazo de retenção de dados definido', det: 'Agendamentos: ' + (s.retencaoAgendamentosMeses || 'sem prazo') + ' · Auditoria: ' + (s.retencaoAuditoriaMeses || 'sem prazo') + (s.retencaoAgendamentosMeses || s.retencaoAuditoriaMeses ? ' meses' : '') },
      { id: 'avisos', ok: av.modo !== 'desligado', titulo: 'Avisos ao cliente configurados', det: av.modo === 'webhook' ? 'Envio automático pelo webhook.' : av.modo === 'link' ? 'Link do WhatsApp (envio manual).' : 'Desligados.', link: 'avisos' },
      { id: 'nuvem', ok: DT.db.modoNuvem(), titulo: 'Dados no servidor (nuvem)', det: DT.db.modoNuvem() ? 'Dados compartilhados em tempo real.' : 'Modo demonstração: dados só neste navegador.' }
    ];
  }
  function montarChecklist(box, irAba, limparOperacao) {
    const ui = DT.ui, esc = U.esc, admin = ehAdmin();
    function desenhar() {
      const auto = itensAutomaticos(), man = DT.db.get('producao') || {};
      const total = auto.length + MANUAIS.length, feitos = auto.filter(x => x.ok).length + MANUAIS.filter(m => man[m[0]]).length;
      box.innerHTML = '<section class="card"><div class="card-head"><h3>' + ui.icon('check') + ' Checklist para operação real</h3><span class="spacer"></span><b class="mono">' + feitos + '/' + total + '</b></div><div class="card-body stack">' +
        '<div class="bar-track"><div class="bar-fill' + (feitos === total ? ' ok' : '') + '" style="width:' + Math.round(feitos / total * 100) + '%"></div></div>' +
        '<div class="ck-lista">' + auto.map(x =>
          '<div class="ck-item' + (x.ok ? ' ok' : '') + '"><span class="ck-ic">' + ui.icon(x.ok ? 'check' : 'alert', 'icon-sm') + '</span><div><b>' + esc(x.titulo) + '</b><span class="subtle">' + esc(x.det) + '</span></div>' +
          (x.acao && admin ? '<button type="button" class="btn ' + (x.id === 'demoDados' ? 'danger' : 'ghost') + ' sm" data-ck="' + x.id + '">' + esc(x.acao) + '</button>' : x.link && !x.ok ? '<button type="button" class="btn ghost sm" data-aba-ir="' + x.link + '">Configurar</button>' : x.href && !x.ok ? '<a class="btn ghost sm" href="' + x.href + '">Definir</a>' : '') + '</div>').join('') +
        MANUAIS.map(m => '<label class="ck-item' + (man[m[0]] ? ' ok' : '') + '"><span class="ck-ic"><input type="checkbox" data-man="' + m[0] + '"' + (man[m[0]] ? ' checked' : '') + (admin ? '' : ' disabled') + '></span><div><b>' + esc(m[1]) + '</b><span class="subtle">' + esc(m[2]) + (man[m[0]] && man[m[0]].por ? ' · marcado por ' + esc(man[m[0]].por) + ' em ' + U.fmtData(man[m[0]].ts.slice(0, 10)) : '') + '</span></div></label>').join('') +
        '</div></div></section>';
      box.querySelectorAll('[data-aba-ir]').forEach(b => b.addEventListener('click', () => irAba(b.dataset.abaIr)));
      if (!admin) return;
      box.querySelectorAll('[data-man]').forEach(i => i.addEventListener('change', () => {
        const atual = Object.assign({}, DT.db.get('producao') || {});
        const m = MANUAIS.find(x => x[0] === i.dataset.man);
        if (i.checked) atual[m[0]] = { ts: new Date().toISOString(), por: DT.auth.usuarioAtual().nome }; else delete atual[m[0]];
        DT.db.set('producao', atual);
        DT.audit.registrar(i.checked ? 'Marcou item do checklist' : 'Desmarcou item do checklist', 'Configuração', 'producao', null, m[1]);
        desenhar();
      }));
      const bu = box.querySelector('[data-ck="demoUsers"]');
      if (bu) bu.addEventListener('click', async () => {
        const demo = itensAutomaticos()[0].demo;
        const r = await ui.confirmar({ titulo: 'Desativar usuários de demonstração', ok: 'Desativar', perigo: true,
          mensagem: 'Os usuários <b>' + demo.map(u => esc(u.login)).join(', ') + '</b> deixam de entrar no sistema. O histórico deles é mantido e é possível reativar em Usuários e perfis.' });
        if (!r.ok) return;
        bu.disabled = true; bu.innerHTML = '<span class="spinner"></span>Desativando…';
        try {
          if (DT.db.modoNuvem()) {
            for (const u of demo) await DT.nuvem.gerenciarUsuario({ acao: 'atualizar', id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, ativo: false });
          } else {
            const lista = DT.db.users();
            lista.forEach(u => { if (demo.some(d => d.id === u.id)) u.ativo = false; });
            DT.db.set('users', lista);
          }
          DT.audit.registrar('Desativou usuários de demonstração', 'Usuário', demo.map(u => u.login).join(', '), 'ativos', 'inativos');
          ui.toast(demo.length + ' usuário(s) de demonstração desativado(s).');
        } catch (e) { ui.toast(e.message || 'Não foi possível desativar.', 'crit', 8000); }
        desenhar();
      });
      const bd = box.querySelector('[data-ck="demoDados"]');
      if (bd) bd.addEventListener('click', async () => { await limparOperacao(); desenhar(); });
    }
    desenhar();
  }

  return { aoEntrar, migrarPerfis, aplicar, aplicarLocal, montarRetencao, montarChecklist, itensAutomaticos, LOGINS_DEMO };
})();
