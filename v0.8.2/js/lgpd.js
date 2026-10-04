/* =====================================================================
   Termo de ciência LGPD (Lei nº 13.709/2018)
   ---------------------------------------------------------------------
   Exibido logo após o login. O sistema só é liberado depois que o
   usuário marca "Li e estou ciente" e clica em OK. Cada aceite fica
   registrado na auditoria (usuário, data, hora e versão do termo).

   Para alterar o texto: edite DT.LGPD.secoes e aumente DT.LGPD.versao
   (no modo "uma vez por versão", todos precisarão aceitar de novo).
   O texto é um modelo: valide com o jurídico / Encarregado de Dados.
   ===================================================================== */
window.DT = window.DT || {};

DT.LGPD = {
  versao: '1.0',
  titulo: 'Termo de Ciência e Responsabilidade no Tratamento de Dados Pessoais',
  lei: 'Lei Geral de Proteção de Dados Pessoais — Lei nº 13.709, de 14 de agosto de 2018',
  secoes: [
    {
      t: '1. Quais dados este sistema trata e para quê',
      p: ['O sistema Drive Thru trata dados pessoais de <b>clientes</b> (nome, telefone, placa do veículo e nome do motorista) e de <b>colaboradores</b> (nome, função, foto e registro das ações realizadas).',
          'Esses dados são usados <b>exclusivamente</b> para agendar, preparar, conferir e registrar a retirada de pedidos pelo Drive Thru, e para os indicadores de gestão dessa operação.']
    },
    {
      t: '2. Seus compromissos ao usar o sistema',
      l: ['Usar os dados somente nas atividades do seu trabalho e apenas no necessário para realizá-las (princípios da <b>finalidade</b> e da <b>necessidade</b> — art. 6º, I e III).',
          'Não copiar, fotografar, imprimir, exportar ou compartilhar dados pessoais fora das rotinas autorizadas pela empresa.',
          'Manter sua senha em sigilo, não emprestar seu usuário e sair do sistema ao deixar o computador ou o celular.',
          'Guardar sigilo sobre os dados pessoais que conhecer por meio do sistema, <b>inclusive após o término do seu vínculo</b> com a empresa (art. 47).',
          'Avisar imediatamente seu gestor ou o Encarregado de Dados sobre qualquer suspeita de acesso indevido, perda ou vazamento, para que a empresa possa adotar as medidas previstas na lei (arts. 46 e 48).']
    },
    {
      t: '3. Direitos dos titulares',
      p: ['Clientes e colaboradores podem pedir à empresa, entre outros direitos, a confirmação de que seus dados são tratados, o acesso a eles e a correção de dados incompletos, inexatos ou desatualizados (art. 18). Encaminhe esses pedidos ao Encarregado de Dados; não altere nem forneça dados fora do procedimento da empresa.']
    },
    {
      t: '4. Registro das ações',
      p: ['Todas as ações no sistema são registradas com usuário, data e hora (auditoria), para garantir a segurança dos dados e permitir que a empresa demonstre o cumprimento da lei (princípios da <b>segurança</b> e da <b>responsabilização e prestação de contas</b> — art. 6º, VII e X).']
    },
    {
      t: '5. Consequências do uso indevido',
      p: ['O descumprimento da LGPD pode levar a sanções à empresa pela Autoridade Nacional de Proteção de Dados (ANPD), como advertência e multa de até 2% do faturamento, limitada a R$ 50 milhões por infração (art. 52). O uso indevido dos dados pelo colaborador pode gerar as medidas previstas nas normas internas e na legislação aplicável.']
    }
  ],
  declaracao: 'Li este termo e declaro estar ciente das minhas responsabilidades no tratamento de dados pessoais, conforme a LGPD.'
};

DT.lgpd = (function () {
  const U = DT.util, esc = U.esc;
  const ACAO_ACEITE = 'Aceitou termo LGPD';
  const chave = u => DT.APP.storagePrefix + 'lgpd_' + u.id;
  let aceiteMem = {};

  function lerSessao(u) {
    try { const v = window.sessionStorage.getItem(chave(u)); if (v) return v; } catch (e) { /* usa memória */ }
    return aceiteMem[u.id] || null;
  }
  function gravarSessao(u, v) {
    aceiteMem[u.id] = v;
    try { window.sessionStorage.setItem(chave(u), v); } catch (e) { /* memória */ }
  }
  /* Chamado a cada novo login e no "Sair": o próximo acesso pede o termo de novo */
  function novaSessao() {
    aceiteMem = {};
    try {
      Object.keys(window.sessionStorage).filter(k => k.indexOf(DT.APP.storagePrefix + 'lgpd_') === 0)
        .forEach(k => window.sessionStorage.removeItem(k));
    } catch (e) { /* ignora */ }
  }

  function precisaAceitar(u) {
    if (!u) return false;
    const v = DT.LGPD.versao;
    if (lerSessao(u) === v) return false;
    if (DT.db.settings().lgpdModo === 'uma_vez') {
      // já aceitou esta versão antes (registro na auditoria)
      const ja = DT.db.auditoria().some(a => a.userId === u.id && a.acao === ACAO_ACEITE && a.depois === 'versão ' + v);
      if (ja) { gravarSessao(u, v); return false; }
    }
    return true;
  }

  function registrarAceite(u) {
    gravarSessao(u, DT.LGPD.versao);
    DT.audit.registrar(ACAO_ACEITE, 'LGPD', u.login, null, 'versão ' + DT.LGPD.versao);
  }

  function textoHTML() {
    const cfg = DT.db.settings();
    const contato = (cfg.lgpdEncarregado || '').trim();
    return DT.LGPD.secoes.map(s =>
      '<section><h3>' + esc(s.t) + '</h3>' +
      (s.p || []).map(x => '<p>' + x + '</p>').join('') +
      (s.l ? '<ul>' + s.l.map(x => '<li>' + x + '</li>').join('') + '</ul>' : '') +
      '</section>').join('') +
      '<section><h3>6. Encarregado de Dados (DPO)</h3><p>' +
      (contato ? 'Dúvidas e comunicações sobre dados pessoais: <b>' + esc(contato) + '</b>.' : 'Dúvidas e comunicações sobre dados pessoais devem ser encaminhadas ao Encarregado de Dados (DPO) da empresa.') +
      '</p></section>';
  }

  /* Tela cheia exibida após o login. onOk: libera o sistema; onRecusar: volta ao login. */
  function tela(root, u, onOk, onRecusar) {
    root.innerHTML =
      '<div class="lgpd-page">' +
        '<div class="lgpd-card" role="dialog" aria-modal="true" aria-labelledby="lgpd-titulo">' +
          '<header class="lgpd-head">' +
            '<div class="lgpd-ic">' + DT.ui.icon('shield') + '</div>' +
            '<div><span class="eyebrow">LGPD · Proteção de dados pessoais</span><h1 id="lgpd-titulo">' + esc(DT.LGPD.titulo) + '</h1>' +
            '<p class="muted">Olá, <b>' + esc(u.nome) + '</b>. Antes de acessar o sistema, leia o termo abaixo.</p></div>' +
          '</header>' +
          '<div class="lgpd-texto" id="lgpd-texto" tabindex="0" aria-label="Texto do termo">' +
            '<p class="lgpd-lei">' + esc(DT.LGPD.lei) + '</p>' + textoHTML() +
          '</div>' +
          '<div class="lgpd-foot">' +
            '<label class="lgpd-check" for="lgpd-ciente"><input type="checkbox" id="lgpd-ciente"><span>' + esc(DT.LGPD.declaracao) + '</span></label>' +
            '<div class="row between" style="width:100%">' +
              '<span class="subtle">Versão ' + esc(DT.LGPD.versao) + ' · o aceite fica registrado com seu usuário, data e hora</span>' +
              '<div class="row"><button type="button" class="btn ghost" id="lgpd-recusar">' + DT.ui.icon('logout') + 'Não aceito — sair</button>' +
              '<button type="button" class="btn primary lg" id="lgpd-ok" disabled>' + DT.ui.icon('check') + 'OK</button></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    const chk = root.querySelector('#lgpd-ciente'), ok = root.querySelector('#lgpd-ok');
    chk.addEventListener('change', () => { ok.disabled = !chk.checked; });
    ok.addEventListener('click', () => {
      if (!chk.checked) return;
      registrarAceite(u);
      onOk();
    });
    root.querySelector('#lgpd-recusar').addEventListener('click', () => {
      DT.audit.registrar('Não aceitou termo LGPD', 'LGPD', u.login, null, 'versão ' + DT.LGPD.versao);
      onRecusar();
    });
  }

  /* Visualização do termo (sem aceite), usada em Configurações */
  function visualizar() {
    DT.ui.modal({ title: DT.LGPD.titulo, wide: true,
      body: '<div class="lgpd-texto" style="max-height:none"><p class="lgpd-lei">' + esc(DT.LGPD.lei) + '</p>' + textoHTML() + '</div>' +
        '<p class="subtle">Declaração marcada pelo usuário: “' + esc(DT.LGPD.declaracao) + '” · Versão ' + esc(DT.LGPD.versao) + '</p>',
      actions: [{ label: 'Fechar', cls: 'ghost' }] });
  }

  return { precisaAceitar, registrarAceite, novaSessao, tela, visualizar, ACAO_ACEITE };
})();
