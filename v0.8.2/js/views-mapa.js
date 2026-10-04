/* =====================================================================
   Mapa de chegadas (Logística)
   Clientes que compartilham a localização a caminho do Drive Thru:
   posição no mapa, distância, previsão de chegada e alerta de aproximação.
   ===================================================================== */
window.DT = window.DT || {};
DT.views = DT.views || {};

DT.views.mapa = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc, S = DT.STATUS, G = DT.STATUS_GRUPOS;
  const R = () => DT.rastreio;
  const view = { titulo: 'Mapa de chegadas', eyebrow: 'Logística · Clientes a caminho', aoVivo: true };
  let el = null, mapa = null, camadas = null, marcadores = {}, trilhas = {}, cdMarker = null, cdRaio = null, pendente = null;
  let ajustado = false, escolhendoNoMapa = false, editandoCD = false;
  const CENTRO_BR = [-15.7939, -47.8828];

  function podeConfig() { return DT.auth.pode('config.alterar'); }
  function naRota() { const r = DT.app.rotaAtual(); return r && r.id === 'mapa' && el && document.body.contains(el); }

  /* ---------------------------- listas ---------------------------- */
  function idade(min) {
    if (min < 1) return 'agora há pouco';
    if (min < 60) return 'há ' + Math.round(min) + ' min';
    return 'há ' + Math.floor(min / 60) + ' h';
  }
  function listaACaminho(ativos) {
    if (!ativos.length) return ui.empty('Nenhum cliente compartilhando a localização agora. Quando o cliente tocar em "Estou a caminho" na página de acompanhamento, ele aparece aqui.', 'nav');
    return '<div class="queue">' + ativos.map(i => {
      const ag = i.ag, pronto = DT.ag.prepAtual(ag) === S.PRONTO;
      const estado = i.perdido ? '<span class="rast-chip lost">sem sinal ' + idade(i.idadeMin) + '</span>' :
        i.noRaio ? '<span class="rast-chip near">chegando</span>' : '';
      return '<div class="mp-item' + (view.foco === ag.id ? ' sel' : '') + '">' +
        '<button type="button" class="mp-item-main" data-foco="' + ag.id + '">' +
          '<span class="mp-dist"><b>' + R().fmtKm(i.dist) + '</b><span>' + (i.perdido ? '—' : R().fmtEta(i.eta)) + '</span></span>' +
          '<span class="qm"><b>' + esc(ag.pedido.cliente) + '</b>' +
            '<span class="row">' + ui.tag(ag.pedido.numero, false) + '<span class="subtle">agendado ' + ag.hora + '</span>' + estado +
              (i.r.simulado ? '<span class="tag sim">simulação</span>' : '') + '</span>' +
            '<span class="subtle">' + (pronto ? '<span class="ok-txt">Pedido pronto</span>' : '<span class="crit-txt">Pedido ainda não está pronto (' + esc(DT.ag.prepAtual(ag)) + ')</span>') +
              ' · posição atualizada ' + idade(i.idadeMin) + '</span></span>' +
        '</button>' +
        '<div class="mp-item-acoes">' +
          '<a class="btn primary sm" href="#checkin/' + ag.id + '">' + ui.icon('pin') + 'Check-in</a>' +
          (R().simulando(ag.id) || i.r.simulado ? '<button type="button" class="btn ghost sm" data-parar="' + ag.id + '">' + ui.icon('stop') + 'Parar simulação</button>' : '') +
        '</div></div>';
    }).join('') + '</div>';
  }
  function listaAguardando(ativos) {
    const hoje = U.dataISO();
    const ids = new Set(ativos.map(i => i.ag.id));
    const lista = DT.db.agendamentos().filter(a => a.data === hoje && G.ativosPreChegada.indexOf(a.status) >= 0 && !ids.has(a.id))
      .sort((a, b) => a.hora < b.hora ? -1 : 1);
    if (!lista.length) return '<p class="muted">Nenhuma outra retirada aguardando hoje.</p>';
    return '<div class="mp-aguard">' + lista.map(a =>
      '<div class="row between mp-ag-row"><div><b class="mono">' + a.hora + '</b> ' + esc(a.pedido.cliente) + ' <span class="subtle">· ' + esc(a.pedido.numero) + '</span></div>' +
      (R().cd() ? '<button type="button" class="btn ghost sm" data-simular="' + a.id + '" title="Simula o cliente dirigindo até o CD (demonstração)">' + ui.icon('play') + 'Simular</button>' : '') +
      '</div>').join('') + '</div>';
  }

  /* ---------------------------- local do CD ---------------------------- */
  function painelCD() {
    const c = R().cd();
    if (c && !editandoCD) return '';
    if (!podeConfig()) return ui.notice('warn', 'O local do CD ainda não foi definido. Peça ao administrador para marcá-lo nesta tela; sem ele não é possível calcular distância e previsão de chegada.');
    return '<section class="card mp-cd-card"><div class="card-head"><h3>' + (c ? 'Alterar o local do CD' : 'Defina o local do CD (ponto de chegada)') + '</h3><span class="spacer"></span>' +
        (c ? '<button type="button" class="btn ghost sm" id="mp-cd-cancelar">Cancelar</button>' : '') + '</div>' +
      '<div class="card-body stack">' +
        '<p class="muted">É o ponto usado para calcular a distância, a previsão de chegada e o alerta de aproximação. Escolha uma forma:</p>' +
        '<div class="row wrap" style="gap:8px">' +
          '<button type="button" class="btn primary" id="mp-cd-gps">' + ui.icon('nav') + 'Usar minha localização atual</button>' +
          '<button type="button" class="btn ghost" id="mp-cd-clique">' + ui.icon('pin') + (escolhendoNoMapa ? 'Clique no mapa…' : 'Clicar no mapa') + '</button>' +
        '</div>' +
        '<form class="row" id="mp-cd-busca" style="gap:8px"><input class="input" id="mp-cd-end" placeholder="Ou digite o endereço do CD (rua, número, cidade)" style="flex:1;min-width:200px">' +
          '<button type="submit" class="btn ghost">' + ui.icon('search') + 'Buscar</button></form>' +
        '<div id="mp-cd-msg"></div>' +
        (pendente ? '<div class="row between mp-pendente"><span>Local escolhido: <b class="mono">' + pendente.lat.toFixed(5) + ', ' + pendente.lng.toFixed(5) + '</b>' + (pendente.endereco ? '<br><span class="subtle">' + esc(pendente.endereco) + '</span>' : '') + '</span>' +
          '<button type="button" class="btn primary" id="mp-cd-salvar">' + ui.icon('check') + 'Salvar local do CD</button></div>' : '') +
      '</div></section>';
  }
  function salvarCD() {
    if (!pendente) return;
    const antes = DT.db.settings();
    const novo = { lat: Math.round(pendente.lat * 1e6) / 1e6, lng: Math.round(pendente.lng * 1e6) / 1e6, endereco: pendente.endereco || '' };
    DT.db.set('settings', Object.assign({}, antes, { localCD: novo }));
    DT.audit.registrar('Alterou parâmetro: Local do CD (mapa)', 'Configuração', 'localCD',
      antes.localCD ? antes.localCD.lat + ', ' + antes.localCD.lng : null, novo.lat + ', ' + novo.lng);
    pendente = null; editandoCD = false; escolhendoNoMapa = false; ajustado = false;
    ui.toast('Local do CD salvo.');
    desenhar();
  }
  function escolher(lat, lng, endereco) {
    pendente = { lat: lat, lng: lng, endereco: endereco || '' };
    escolhendoNoMapa = false;
    if (mapa) mapa.setView([lat, lng], Math.max(mapa.getZoom(), 16));
    desenharPainelCD();
    atualizarMapa();
  }
  function desenharPainelCD() {
    const box = el.querySelector('#mp-painel-cd');
    if (!box) return;
    box.innerHTML = painelCD();
    const q = s => box.querySelector(s);
    if (q('#mp-cd-cancelar')) q('#mp-cd-cancelar').addEventListener('click', () => { editandoCD = false; pendente = null; escolhendoNoMapa = false; desenhar(); });
    if (q('#mp-cd-salvar')) q('#mp-cd-salvar').addEventListener('click', salvarCD);
    if (q('#mp-cd-clique')) q('#mp-cd-clique').addEventListener('click', () => {
      escolhendoNoMapa = true; desenharPainelCD();
      el.querySelector('#mp-mapa').classList.add('escolhendo');
    });
    if (q('#mp-cd-gps')) q('#mp-cd-gps').addEventListener('click', () => {
      const msg = q('#mp-cd-msg');
      if (!navigator.geolocation) { msg.innerHTML = ui.notice('warn', 'Este navegador não informa a localização.'); return; }
      msg.innerHTML = '<div class="row"><span class="spinner"></span>Obtendo a localização…</div>';
      navigator.geolocation.getCurrentPosition(p => escolher(p.coords.latitude, p.coords.longitude, 'Localização deste aparelho (precisão ~' + Math.round(p.coords.accuracy) + ' m)'),
        () => { msg.innerHTML = ui.notice('warn', 'Não foi possível obter a localização. Libere a permissão de localização para este site ou use outra opção.'); },
        { enableHighAccuracy: true, timeout: 15000 });
    });
    if (q('#mp-cd-busca')) q('#mp-cd-busca').addEventListener('submit', async e => {
      e.preventDefault();
      const txt = q('#mp-cd-end').value.trim(), msg = q('#mp-cd-msg');
      if (!txt) return;
      msg.innerHTML = '<div class="row"><span class="spinner"></span>Buscando endereço…</div>';
      try {
        const resp = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&accept-language=pt-BR&q=' + encodeURIComponent(txt));
        const j = await resp.json();
        if (!j.length) { msg.innerHTML = ui.notice('warn', 'Endereço não encontrado. Tente com cidade e estado, ou clique no mapa.'); return; }
        msg.innerHTML = '';
        escolher(Number(j[0].lat), Number(j[0].lon), j[0].display_name);
      } catch (err) { msg.innerHTML = ui.notice('warn', 'Não foi possível buscar agora. Use "Clicar no mapa".'); }
    });
  }

  /* ---------------------------- mapa ---------------------------- */
  function iconeCD() {
    return L.divIcon({ className: 'mp-cd', html: '<div class="mp-cd-pin">' + ui.icon('truck') + '</div><div class="mp-lbl">Drive Thru</div>', iconSize: [38, 38], iconAnchor: [19, 19] });
  }
  function iconeCliente(i) {
    const cls = i.perdido ? 'lost' : i.noRaio ? 'near' : '';
    const nome = i.ag.pedido.cliente.split(' ').slice(0, 2).join(' ');
    return L.divIcon({ className: 'mp-cli', iconSize: [34, 34], iconAnchor: [17, 17],
      html: '<div class="mp-cli-pin ' + cls + '">' + ui.icon('car') + '</div><div class="mp-lbl">' + esc(nome) + (i.dist != null && !i.perdido ? ' · ' + R().fmtEta(i.eta) : '') + '</div>' });
  }
  function criarMapa() {
    if (mapa) { try { mapa.remove(); } catch (e) { /* ignora */ } }
    marcadores = {}; trilhas = {}; cdMarker = null; cdRaio = null;
    const box = el.querySelector('#mp-mapa');
    if (!box || typeof L === 'undefined') { if (box) box.innerHTML = ui.empty('Não foi possível carregar o mapa.', 'map'); mapa = null; return; }
    const c = R().cd();
    mapa = L.map(box, { zoomControl: true, attributionControl: true }).setView(c ? [c.lat, c.lng] : CENTRO_BR, c ? 13 : 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(mapa);
    camadas = L.layerGroup().addTo(mapa);
    mapa.on('click', e => {
      if (!escolhendoNoMapa) return;
      el.querySelector('#mp-mapa').classList.remove('escolhendo');
      escolher(e.latlng.lat, e.latlng.lng, '');
    });
    mapa.on('dragstart zoomstart', e => { if (e && e.hard !== true) ajustado = true; });
    ajustado = false;
    setTimeout(() => { if (mapa) { mapa.invalidateSize(); atualizarMapa(true); } }, 60);
  }
  function atualizarMapa(primeira) {
    if (!mapa) return;
    const c = pendente || R().cd();
    const cfg = DT.db.settings();
    if (c) {
      if (!cdMarker) { cdMarker = L.marker([c.lat, c.lng], { icon: iconeCD(), zIndexOffset: 500, keyboard: false }).addTo(camadas); }
      else cdMarker.setLatLng([c.lat, c.lng]);
      if (!cdRaio) cdRaio = L.circle([c.lat, c.lng], { radius: (cfg.raioChegadaKm || 2) * 1000, color: '#e8871e', weight: 1.5, dashArray: '6 6', fillOpacity: 0.05, interactive: false }).addTo(camadas);
      else { cdRaio.setLatLng([c.lat, c.lng]); cdRaio.setRadius((cfg.raioChegadaKm || 2) * 1000); }
    }
    const ativos = R().ativos();
    const vistos = new Set();
    ativos.forEach(i => {
      const id = i.ag.id;
      vistos.add(id);
      const pos = [i.r.lat, i.r.lng];
      if (!marcadores[id]) {
        marcadores[id] = L.marker(pos, { icon: iconeCliente(i), zIndexOffset: 800 }).addTo(camadas);
        marcadores[id].on('click', () => { view.foco = id; desenharListas(); });
      } else { marcadores[id].setLatLng(pos); marcadores[id].setIcon(iconeCliente(i)); }
      const linha = (i.r.trilha || []).map(p => [p.lat, p.lng]);
      if (!trilhas[id]) trilhas[id] = L.polyline(linha, { color: '#2f6fed', weight: 4, opacity: 0.55, interactive: false }).addTo(camadas);
      else trilhas[id].setLatLngs(linha);
    });
    Object.keys(marcadores).forEach(id => {
      if (!vistos.has(id)) { camadas.removeLayer(marcadores[id]); delete marcadores[id]; if (trilhas[id]) { camadas.removeLayer(trilhas[id]); delete trilhas[id]; } }
    });
    if (view.foco && marcadores[view.foco] && primeira !== true && view.seguir) {
      mapa.panTo(marcadores[view.foco].getLatLng(), { animate: true });
    } else if (!ajustado || primeira === true) enquadrar();
  }
  function enquadrar() {
    if (!mapa) return;
    const pts = [];
    const c = pendente || R().cd();
    if (c) pts.push([c.lat, c.lng]);
    Object.values(marcadores).forEach(m => { const p = m.getLatLng(); pts.push([p.lat, p.lng]); });
    if (pts.length === 1) mapa.setView(pts[0], pendente ? 16 : 13, { animate: false });
    else if (pts.length > 1) mapa.fitBounds(pts, { padding: [50, 50], maxZoom: 15, animate: false });
    ajustado = false;
  }

  /* ---------------------------- tela ---------------------------- */
  function desenharListas() {
    const ativos = R().ativos();
    const a = el.querySelector('#mp-lista'), b = el.querySelector('#mp-aguard'), n = el.querySelector('#mp-n');
    if (n) n.textContent = ativos.length;
    if (a) a.innerHTML = listaACaminho(ativos);
    if (b) b.innerHTML = listaAguardando(ativos);
    el.querySelectorAll('[data-foco]').forEach(x => x.addEventListener('click', () => {
      view.foco = x.dataset.foco; view.seguir = true;
      const m = marcadores[view.foco];
      if (m && mapa) mapa.setView(m.getLatLng(), Math.max(mapa.getZoom(), 14));
      desenharListas();
    }));
    el.querySelectorAll('[data-simular]').forEach(x => x.addEventListener('click', async () => {
      x.disabled = true; x.innerHTML = '<span class="spinner"></span>Preparando…';
      const r = await R().simular(x.dataset.simular);
      if (!r.ok) { ui.toast(r.erro, 'warn'); desenharListas(); return; }
      ui.toast('Simulação iniciada: cliente a ' + R().fmtKm(r.km) + ' do CD, percorrendo o trajeto em cerca de 1 minuto e meio.');
      ajustado = false;
    }));
    el.querySelectorAll('[data-parar]').forEach(x => x.addEventListener('click', async () => {
      x.disabled = true;
      await R().pararSimulacao(x.dataset.parar);
      ui.toast('Simulação encerrada e localização apagada.');
    }));
  }
  function desenhar() {
    const cfg = DT.db.settings();
    el.innerHTML =
      '<div id="mp-painel-cd"></div>' +
      (cfg.rastreioAtivo === false ? ui.notice('warn', 'O compartilhamento de localização pelos clientes está <b>desativado</b> em Configurações. Só a simulação funciona.') : '') +
      '<div class="grid-side-main">' +
        '<div class="stack">' +
          '<section class="card"><div class="card-head"><h3>A caminho</h3><span class="count-pill" id="mp-n">0</span><span class="spacer"></span><span class="subtle">raio de alerta ' + R().fmtKm(cfg.raioChegadaKm || 2) + '</span></div>' +
            '<div class="card-body" id="mp-lista"></div></section>' +
          '<section class="card"><div class="card-head"><h3>Aguardando hoje</h3></div><div class="card-body">' +
            '<p class="subtle" style="margin-bottom:8px">Para demonstração, "Simular" faz o cliente "dirigir" até o CD, como se estivesse com a página aberta no celular.</p>' +
            '<div id="mp-aguard"></div></div></section>' +
          ui.notice('info', 'A localização é enviada pelo cliente só depois que ele autoriza, e é apagada no check-in, no cancelamento ou ao fim do dia.', 'lock') +
        '</div>' +
        '<section class="card mp-card"><div class="card-head"><h3>Mapa</h3>' +
          '<span class="mp-leg"><i class="l-cd"></i>Drive Thru <i class="l-cli"></i>A caminho <i class="l-near"></i>Chegando <i class="l-lost"></i>Sem sinal</span><span class="spacer"></span>' +
          '<button type="button" class="btn ghost sm" id="mp-centro">' + ui.icon('refresh') + 'Enquadrar</button>' +
          (podeConfig() && R().cd() ? '<button type="button" class="btn ghost sm" id="mp-alt-cd">' + ui.icon('edit') + 'Local do CD</button>' : '') +
        '</div><div class="mp-box" id="mp-mapa"></div></section>' +
      '</div>';
    desenharPainelCD();
    desenharListas();
    criarMapa();
    el.querySelector('#mp-centro').addEventListener('click', () => { view.seguir = false; view.foco = null; enquadrar(); desenharListas(); });
    const alt = el.querySelector('#mp-alt-cd');
    if (alt) alt.addEventListener('click', () => { editandoCD = true; pendente = null; desenharPainelCD(); window.scrollTo(0, 0); });
  }

  view.render = function (c) { el = c; view.foco = null; view.seguir = false; editandoCD = false; pendente = null; escolhendoNoMapa = false; desenhar(); };
  view.refresh = function () {
    if (!naRota()) return;
    if (!mapa || !el.querySelector('#mp-mapa .leaflet-pane')) { desenhar(); return; }
    desenharListas();
    atualizarMapa();
  };
  // posições novas chegam em tempo real: atualiza só a lista e os marcadores
  DT.rastreio.aoMudar(() => { if (naRota()) view.refresh(); });

  return view;
})();
