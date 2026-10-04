/* =====================================================================
   DRIVE THRU — Leitor de QR Code pela câmera (check-in por QR)
   Usa o leitor nativo do navegador quando existe (BarcodeDetector) e,
   nos demais, a biblioteca jsQR (js/vendor/jsqr.min.js).
   ===================================================================== */
DT.leitorQR = (function () {
  /* Extrai o código de acompanhamento de um texto lido (link ou o próprio código) */
  function codigoDe(texto) {
    const t = String(texto || '').trim();
    const m = t.match(/acompanhar-([A-Za-z0-9]{6,12})/i);
    if (m) return m[1].toUpperCase();
    const c = t.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return /^[A-Z0-9]{8}$/.test(t.toUpperCase()) ? c : null;
  }
  function disponivel() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

  function abrir(aoLer) {
    const ui = DT.ui;
    let stream = null, parado = false, detector = null, canvas = null, ctx = null;
    const m = ui.modal({
      title: 'Ler QR de chegada',
      body: '<div class="qr-leitor"><video id="qr-video" playsinline muted></video><div class="qr-mira"></div></div>' +
        '<p class="muted" id="qr-msg" style="margin-top:10px">Aponte a câmera para o QR Code da página do cliente.</p>',
      actions: [{ label: 'Fechar', cls: 'ghost' }],
      onClose: parar
    });
    const root = m.root;
    const video = root.querySelector('#qr-video'), msg = root.querySelector('#qr-msg');
    function parar() {
      parado = true;
      if (stream) stream.getTracks().forEach(t => t.stop());
    }
    function fechar() { parar(); m.close(); }
    async function ciclo() {
      if (parado) return;
      if (video.readyState >= 2) {
        let texto = null;
        try {
          if (detector) {
            const r = await detector.detect(video);
            if (r && r.length) texto = r[0].rawValue;
          } else if (window.jsQR) {
            canvas = canvas || document.createElement('canvas');
            const w = video.videoWidth, h = video.videoHeight;
            if (w && h) {
              canvas.width = w; canvas.height = h;
              ctx = ctx || canvas.getContext('2d', { willReadFrequently: true });
              ctx.drawImage(video, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              const r = window.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
              if (r) texto = r.data;
            }
          }
        } catch (e) { /* quadro inválido */ }
        if (texto) {
          const cod = codigoDe(texto);
          if (cod) { try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { /* sem vibração */ } fechar(); aoLer(cod); return; }
          msg.textContent = 'Este QR Code não é de um agendamento do Drive Thru.';
        }
      }
      setTimeout(() => requestAnimationFrame(ciclo), 120);
    }
    (async () => {
      try {
        if ('BarcodeDetector' in window) {
          try { const f = await window.BarcodeDetector.getSupportedFormats(); if (f.indexOf('qr_code') >= 0) detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (parado) { parar(); return; }
        video.srcObject = stream;
        await video.play();
        ciclo();
      } catch (e) {
        msg.innerHTML = '<b>Não foi possível abrir a câmera.</b> Permita o uso da câmera no navegador ou digite/bipe o código no campo de busca.';
      }
    })();
    return m;
  }
  return { abrir, codigoDe, disponivel };
})();
