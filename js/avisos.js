/* =====================================================================
   DRIVE THRU — Avisos ao cliente (WhatsApp) e resumo diário
   ---------------------------------------------------------------------
   Modos (escolhidos pelo Administrador em Configurações › Avisos):
   • desligado — nenhum aviso.
   • link      — botões "WhatsApp" abrem a conversa com a mensagem pronta
                 (o funcionário só confirma o envio). Não precisa de conta.
   • webhook   — o servidor envia sozinho: confirmação do agendamento,
                 "pedido pronto" e lembrete X min antes, por um webhook
                 HTTPS da Condor (n8n, Make ou o provedor de WhatsApp).
                 O mesmo webhook recebe o resumo diário por e-mail.
   ===================================================================== */
DT.avisos = (function () {
  const U = DT.util;
  const MODELOS = {
    confirmacao: 'Olá, {primeiroNome}! Sua retirada no Drive Thru Condor está agendada para {data} às {hora} (pedido {pedido}). Acompanhe e avise sua chegada: {link}',
    pronto: '{primeiroNome}, seu pedido {pedido} está PRONTO para retirada no Drive Thru Condor. Horário: {data} às {hora}. Ao chegar, mostre o QR: {link}',
    lembrete: 'Lembrete: sua retirada no Drive Thru Condor é hoje às {hora} (pedido {pedido}). Endereço e acompanhamento: {link}'
  };
  const TIPOS = { confirmacao: 'Confirmação do agendamento', pronto: 'Pedido pronto', lembrete: 'Lembrete antes do horário' };
  const ROT = { confirmacao: 'confirmação', pronto: 'pronto', lembrete: 'lembrete' };
  const VARS = ['{cliente}', '{primeiroNome}', '{pedido}', '{data}', '{hora}', '{link}', '{codigo}', '{unidade}'];
  const copia = o => JSON.parse(JSON.stringify(o));
  function padrao() {
    return { modo: 'link', webhookUrl: '', siteUrl: location.href.split('#')[0], eventos: { confirmacao: true, pronto: true, lembrete: true },
      lembreteMin: 60, modelos: copia(MODELOS), resumo: { ativo: false, hora: '19:00', destinatarios: '' } };
  }
  function config() {
    const c = Object.assign(padrao(), DT.db.get('avisos') || {});
    c.eventos = Object.assign(padrao().eventos, c.eventos || {});
    c.modelos = Object.assign(copia(MODELOS), c.modelos || {});
    c.resumo = Object.assign(padrao().resumo, c.resumo || {});
    return c;
  }
  function telefone(ag) {
    let d = String((ag.veiculo && ag.veiculo.contato) || ag.pedido.telefone || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length <= 11) d = '55' + d.replace(/^0+/, '');
    return d;
  }
  function variaveis(ag) {
    const cli = String(ag.pedido.cliente || '');
    return { cliente: cli, primeiroNome: cli.split(/\s+/)[0] || cli, pedido: ag.pedido.numero, data: U.fmtData(ag.data), hora: ag.hora,
      link: DT.ag.linkCliente(ag), codigo: DT.ag.codigo(ag), unidade: DT.db.settings().unidade || '' };
  }
  function preencher(modelo, v) { return String(modelo || '').replace(/\{(\w+)\}/g, (m, k) => v[k] !== undefined && v[k] !== null ? String(v[k]) : m); }
  function mensagem(ag, tipo) { return preencher(config().modelos[tipo] || MODELOS[tipo], variaveis(ag)); }
  function linkWhats(ag, tipo) {
    const t = telefone(ag);
    return 'https://wa.me/' + t + '?text=' + encodeURIComponent(mensagem(ag, tipo));
  }

  /* Botões "WhatsApp" (modo link ou para reenviar manualmente) */
  function botoes(ag) {
    const c = config();
    if (c.modo === 'desligado') return '';
    const ui = DT.ui, esc = U.esc;
    if (!telefone(ag)) return '<span class="subtle">Sem telefone do cliente para WhatsApp.</span>';
    const pronto = DT.ag.prepAtual(ag) === DT.STATUS.PRONTO;
    const tipos = ['confirmacao'].concat(pronto ? ['pronto'] : []).concat(ag.data === U.dataISO() ? ['lembrete'] : []);
    return '<div class="row wrap" style="gap:6px">' + tipos.map(t =>
      '<a class="btn ghost sm" target="_blank" rel="noopener" href="' + esc(linkWhats(ag, t)) + '" data-whats="' + t + '">' + ui.icon('chat', 'icon-sm') + 'WhatsApp: ' + ROT[t] + '</a>').join('') + '</div>';
  }
  function ligarBotoes(root, ag) {
    root.querySelectorAll('[data-whats]').forEach(a => a.addEventListener('click', () => {
      DT.audit.registrar('Abriu aviso no WhatsApp', 'Agendamento', ag.pedido.numero, null, TIPOS[a.dataset.whats]);
    }));
  }

  /* Envio automático (modo webhook): o servidor confere e evita duplicidade */
  function evento(ag, tipo) {
    const c = config();
    if (!DT.db.modoNuvem() || c.modo !== 'webhook' || !c.eventos[tipo]) return;
    // aguarda a gravação do agendamento chegar ao servidor
    setTimeout(() => { DT.nuvem.avisosAcao('evento', { agendamentoId: ag.id, tipo: tipo }).catch(() => { /* o ciclo reenvia */ }); }, 5000);
  }
  let timer = null, ultimoCiclo = null;
  function ciclo(forcar) {
    const c = config();
    if (!DT.db.modoNuvem() || c.modo !== 'webhook') return Promise.resolve(null);
    return DT.nuvem.avisosAcao('ciclo', { forcar: !!forcar }).then(r => { ultimoCiclo = { ts: new Date().toISOString(), r: r }; return r; });
  }
  function aoEntrar() {
    parar();
    if (!DT.db.modoNuvem()) return;
    timer = setInterval(() => { ciclo(false).catch(() => {}); }, 5 * 60000);
    setTimeout(() => { ciclo(false).catch(() => {}); }, 8000);
  }
  function parar() { if (timer) clearInterval(timer); timer = null; }

  /* ---------------- Cartão em Configurações ---------------- */
  function montarConfig(box) {
    const ui = DT.ui, esc = U.esc;
    const pode = DT.auth.pode('config.alterar');
    const nuvem = DT.db.modoNuvem();
    let rasc = config(), tokenInfo = null, enviados = null;
    async function carregar() {
      if (!nuvem || !pode) return;
      try { tokenInfo = await DT.nuvem.avisosAcao('statusToken'); } catch (e) { tokenInfo = { erro: e.message }; }
      try { enviados = await DT.nuvem.avisosEnviados(); } catch (e) { enviados = []; }
      desenhar();
    }
    function desenhar() {
      const c = rasc, w = c.modo === 'webhook';
      const ultCiclo = DT.db.get('avisos_ciclo'), ultResumo = DT.db.get('resumo_ultimo');
      box.innerHTML =
        '<section class="card"><div class="card-head"><h3>' + ui.icon('chat') + ' Avisos ao cliente pelo WhatsApp</h3></div><div class="card-body stack">' +
          '<div class="field"><span class="label">Como os avisos são enviados</span><div class="sep-modos">' +
            [['desligado', 'Desligado', 'Nenhum aviso é enviado ao cliente.'],
             ['link', 'Link do WhatsApp (manual)', 'Botões "WhatsApp" na confirmação e na agenda abrem a conversa com a mensagem pronta. Não precisa de conta.'],
             ['webhook', 'Automático (webhook)', 'O servidor envia sozinho pelo webhook da Condor (n8n, Make ou provedor de WhatsApp): confirmação, pronto e lembrete.']]
            .map(m => '<label class="sep-modo' + (c.modo === m[0] ? ' sel' : '') + '"><input type="radio" name="av-modo" value="' + m[0] + '"' + (c.modo === m[0] ? ' checked' : '') + (pode ? '' : ' disabled') + '><div><b>' + m[1] + '</b><span class="subtle" style="display:block;margin-top:2px">' + m[2] + '</span></div></label>').join('') +
          '</div></div>' +
          (w ? '<div class="fields-2">' +
            '<div class="field"><label for="av-url">Endereço do webhook (HTTPS)</label><input id="av-url" class="input mono" value="' + esc(c.webhookUrl) + '" placeholder="https://n8n.suaempresa.com.br/webhook/drive-thru"' + (pode ? '' : ' disabled') + '><span class="hint">Recebe um POST em JSON com <span class="mono">evento, mensagem, telefone, pedido, link…</span></span></div>' +
            '<div class="field"><label for="av-site">Endereço do site (para o link do cliente)</label><input id="av-site" class="input mono" value="' + esc(c.siteUrl) + '"' + (pode ? '' : ' disabled') + '></div>' +
            '<div class="field"><label for="av-token">Token do webhook (opcional)</label><div class="row"><input id="av-token" type="password" class="input" autocomplete="new-password" placeholder="' + (tokenInfo && tokenInfo.definida ? 'guardado no cofre — digite para trocar' : 'cole o token') + '"' + (pode && nuvem ? '' : ' disabled') + '><button type="button" class="btn ghost sm" id="av-token-salvar"' + (pode && nuvem ? '' : ' disabled') + '>Guardar no cofre</button></div>' +
              '<span class="hint">Enviado no cabeçalho <span class="mono">X-DriveThru-Token</span>. Fica criptografado no servidor e não volta para a tela.</span></div>' +
            '<div class="field"><label for="av-lemb">Lembrete antes do horário (min)</label><input type="number" min="10" max="1440" step="5" id="av-lemb" class="input" value="' + esc(c.lembreteMin) + '"' + (pode ? '' : ' disabled') + '></div>' +
          '</div>' +
          '<div class="field"><span class="label">Avisos automáticos</span><div class="row wrap">' + Object.keys(TIPOS).map(t =>
            '<label class="check"><input type="checkbox" data-ev="' + t + '"' + (c.eventos[t] ? ' checked' : '') + (pode ? '' : ' disabled') + '> ' + TIPOS[t] + '</label>').join('') + '</div></div>' : '') +
          (c.modo !== 'desligado' ? '<details class="sep-det"><summary>Textos das mensagens</summary><div class="stack" style="margin-top:10px">' +
            Object.keys(TIPOS).map(t => '<div class="field"><label for="av-m-' + t + '">' + TIPOS[t] + '</label><textarea id="av-m-' + t + '" class="textarea" rows="3" data-mod="' + t + '"' + (pode ? '' : ' disabled') + '>' + esc(c.modelos[t]) + '</textarea></div>').join('') +
            '<span class="hint">Variáveis: ' + VARS.map(v => '<span class="mono">' + v + '</span>').join(' ') + '</span>' +
            '<button type="button" class="btn ghost sm" id="av-mod-padrao" style="align-self:flex-start">Restaurar textos padrão</button></div></details>' : '') +
          (w ? '<div class="notice info">' + ui.icon('info') + '<div>' + (nuvem ? 'Último ciclo de avisos: <b>' + (ultCiclo && ultCiclo.ultimo ? U.fmtDataHora(ultCiclo.ultimo) + '</b> (' + (ultCiclo.enviados || 0) + ' enviado(s), ' + (ultCiclo.erros || 0) + ' com erro)' : 'ainda não executado</b>') +
            (enviados && enviados.length ? ' · últimos envios: ' + enviados.slice(0, 5).map(e => '<span class="' + (e.ok ? '' : 'crit-txt') + '">' + esc(TIPOS[e.tipo] || e.tipo) + ' ' + U.fmtHora(e.ts) + (e.ok ? '' : ' (erro)') + '</span>').join(', ') : '') : 'O envio automático funciona com o sistema conectado ao servidor (modo nuvem).') + '</div></div>' : '') +
        '</div>' +
        '<div class="card-head" style="border-top:1px solid var(--line)"><h3>' + ui.icon('mail') + ' Resumo diário por e-mail</h3></div><div class="card-body stack">' +
          '<p class="muted">No horário escolhido, o servidor envia ao webhook o resumo do dia (agendados, concluídos, não compareceram, tempos médios e metas), com assunto e texto prontos para o e-mail.</p>' +
          '<div class="fields-2">' +
            '<label class="check"><input type="checkbox" id="av-res-ativo"' + (c.resumo.ativo ? ' checked' : '') + (pode ? '' : ' disabled') + '> Enviar o resumo todos os dias</label>' +
            '<div class="field"><label for="av-res-hora">Horário do envio</label><input type="time" id="av-res-hora" class="input" value="' + esc(c.resumo.hora) + '"' + (pode ? '' : ' disabled') + '></div>' +
          '</div>' +
          '<div class="field"><label for="av-res-dest">E-mails de destino (separados por vírgula)</label><input id="av-res-dest" class="input" value="' + esc(c.resumo.destinatarios) + '" placeholder="gerente@condor.com.br, logistica@condor.com.br"' + (pode ? '' : ' disabled') + '></div>' +
          (ultResumo && ultResumo.dia ? '<span class="hint">Último resumo enviado: ' + U.fmtDataHora(ultResumo.ts) + '</span>' : '') +
        '</div>' +
        (pode ? '<div class="card-foot row wrap end">' +
          (w && nuvem ? '<button type="button" class="btn ghost" id="av-testar">' + ui.icon('play') + 'Enviar teste</button>' +
            '<button type="button" class="btn ghost" id="av-ciclo">' + ui.icon('refresh') + 'Executar ciclo agora</button>' +
            '<button type="button" class="btn ghost" id="av-previa">' + ui.icon('mail') + 'Prévia do resumo</button>' +
            '<button type="button" class="btn ghost" id="av-resumo">' + ui.icon('mail') + 'Enviar resumo agora</button>' : '') +
          '<button type="button" class="btn primary" id="av-salvar">' + ui.icon('check') + 'Salvar avisos</button></div>' : '') +
        '</section>';
      ligar();
    }
    function ler() {
      const q = s => box.querySelector(s);
      const r = copia(rasc);
      const m = box.querySelector('[name="av-modo"]:checked'); if (m) r.modo = m.value;
      if (q('#av-url')) r.webhookUrl = q('#av-url').value.trim();
      if (q('#av-site')) r.siteUrl = q('#av-site').value.trim();
      if (q('#av-lemb')) r.lembreteMin = Math.min(1440, Math.max(10, Number(q('#av-lemb').value) || 60));
      box.querySelectorAll('[data-ev]').forEach(i => { r.eventos[i.dataset.ev] = i.checked; });
      box.querySelectorAll('[data-mod]').forEach(t => { r.modelos[t.dataset.mod] = t.value; });
      r.resumo = { ativo: q('#av-res-ativo').checked, hora: q('#av-res-hora').value || '19:00', destinatarios: q('#av-res-dest').value.trim() };
      return r;
    }
    async function acao(nome, payload, ok) {
      try { const r = await DT.nuvem.avisosAcao(nome, payload); ok(r); }
      catch (e) { ui.toast(e.message, 'crit', 9000); }
    }
    function ligar() {
      if (!pode) return;
      const q = s => box.querySelector(s);
      box.querySelectorAll('[name="av-modo"]').forEach(i => i.addEventListener('change', () => { rasc = ler(); desenhar(); }));
      const mp = q('#av-mod-padrao'); if (mp) mp.addEventListener('click', () => { rasc = ler(); rasc.modelos = copia(MODELOS); desenhar(); });
      q('#av-salvar').addEventListener('click', () => {
        const n = ler();
        if (n.modo === 'webhook' && !/^https:\/\/[^\s]+$/i.test(n.webhookUrl)) { ui.toast('Informe o endereço do webhook começando com https://', 'warn'); return; }
        if (n.resumo.ativo && n.modo !== 'webhook') { ui.toast('O resumo diário usa o webhook: escolha o modo "Automático (webhook)".', 'warn'); return; }
        if (n.resumo.ativo && !n.resumo.destinatarios) { ui.toast('Informe ao menos um e-mail para o resumo diário.', 'warn'); return; }
        const antes = config();
        DT.db.set('avisos', n);
        rasc = config();
        DT.audit.registrar('Alterou configuração de avisos', 'Configuração', 'avisos', antes.modo + (antes.resumo.ativo ? ' + resumo' : ''), n.modo + (n.resumo.ativo ? ' + resumo ' + n.resumo.hora : ''));
        ui.toast('Configuração de avisos salva.');
        aoEntrar();
        desenhar();
      });
      const ts = q('#av-token-salvar');
      if (ts) ts.addEventListener('click', () => {
        const v = q('#av-token').value;
        if (!v) { ui.toast('Digite o token para guardar.', 'warn'); return; }
        acao('salvarToken', { token: v }, () => { ui.toast('Token guardado no cofre do servidor.'); tokenInfo = { definida: true }; rasc = ler(); desenhar(); });
      });
      const tt = q('#av-testar');
      if (tt) tt.addEventListener('click', async () => {
        if (JSON.stringify(ler()) !== JSON.stringify(config())) { ui.toast('Salve a configuração antes de testar.', 'warn'); return; }
        const r = await ui.confirmar({ titulo: 'Enviar teste ao webhook', ok: 'Enviar', pedirMotivo: true, labelMotivo: 'Telefone de teste (com DDD)', mensagem: 'O webhook recebe uma mensagem de teste para o telefone informado.' });
        if (!r.ok) return;
        acao('testar', { telefone: r.motivo }, x => ui.toast('Webhook respondeu: ' + (x.detalhe || 'ok'), 'ok', 8000));
      });
      const tc = q('#av-ciclo');
      if (tc) tc.addEventListener('click', () => acao('ciclo', { forcar: true }, r => {
        if (r.ignorado) { ui.toast('Ciclo executado há pouco. Tente em alguns segundos.', 'warn'); return; }
        ui.toast('Ciclo concluído: ' + r.enviados.length + ' aviso(s) enviado(s)' + (r.erros.length ? ', ' + r.erros.length + ' com erro (' + r.erros[0].detalhe + ')' : '') + '.', r.erros.length ? 'warn' : 'ok', 9000);
        carregar();
      }));
      const pv = q('#av-previa');
      if (pv) pv.addEventListener('click', () => acao('previa', {}, r => ui.modal({ title: r.assunto, wide: true, body: r.html, actions: [{ label: 'Fechar', cls: 'ghost' }] })));
      const rs = q('#av-resumo');
      if (rs) rs.addEventListener('click', () => {
        if (JSON.stringify(ler()) !== JSON.stringify(config())) { ui.toast('Salve a configuração antes de enviar.', 'warn'); return; }
        acao('resumo', {}, r => ui.toast('Resumo enviado: ' + (r.assunto || '') + '.', 'ok', 8000));
      });
    }
    desenhar();
    carregar();
  }

  return { MODELOS, TIPOS, config, mensagem, linkWhats, telefone, botoes, ligarBotoes, evento, ciclo, aoEntrar, parar, montarConfig, ultimoCiclo: () => ultimoCiclo };
})();
