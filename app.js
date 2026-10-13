/* Odometer Logbook — offline phone app.
 * All trips are stored on this phone only (browser storage). Nothing is uploaded.
 * "Export" builds an Excel (.xlsx) file on the phone.
 */
(function () {
  'use strict';

  var KEY = 'odo.v1';
  var TESS_JS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  var app = document.getElementById('app');
  var D = loadData();   // { trips: [...], active: {...}|null }
  var V = 'home';       // current screen
  var F = null;         // form / flow state for the current screen
  var showN = 20;
  var confirmCancel = false;

  var CAM = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>';
  var XL = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>';

  /* ================================================================ */
  /* Storage                                                           */
  /* ================================================================ */
  function loadData() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY));
      if (d && Array.isArray(d.trips)) return d;
    } catch (e) {}
    return { trips: [], active: null };
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(D));
      return true;
    } catch (e) {
      toast('Could not save on this phone: ' + e.message);
      return false;
    }
  }
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(function () {});
  }

  function sorted() {
    return D.trips.slice().sort(function (a, b) {
      return (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')) || a.startOdo - b.startOdo;
    });
  }
  function lastTrip() { var s = sorted(); return s.length ? s[s.length - 1] : null; }
  function newestFirst() { return sorted().reverse(); }
  function uniq(list, max) {
    var seen = {}, out = [];
    list.forEach(function (x) {
      var s = String(x || '').trim(), k = s.toLowerCase();
      if (s && !seen[k] && out.length < max) { seen[k] = 1; out.push(s); }
    });
    return out;
  }
  function reasons() { return uniq(newestFirst().map(function (t) { return t.reason; }), 6); }
  function places() {
    var l = [];
    newestFirst().forEach(function (t) { l.push(t.to, t.from); });
    return uniq(l, 8);
  }

  /* ================================================================ */
  /* Helpers                                                           */
  /* ================================================================ */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function timeStr(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function niceDate(s) {
    var p = String(s || '').split('-');
    if (p.length !== 3) return s || '';
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function digits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function fmtKm(n) {
    if (n === '' || n == null || isNaN(n)) return '';
    return String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 200); }
  var toastT;
  function toast(t) {
    var el = document.getElementById('toast');
    el.textContent = t; el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('on'); }, 2800);
  }
  function chips(list, key, current) {
    if (!list || !list.length) return '';
    return '<div class="chips">' + list.map(function (v) {
      var on = current != null && String(current) === String(v);
      return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-chip="' + key + '" data-v="' + esc(v) + '">' + esc(v) + '</button>';
    }).join('') + '</div>';
  }
  function go(view, state) {
    V = view; F = state || null; confirmCancel = false;
    render();
    window.scrollTo(0, 0);
  }

  /* ================================================================ */
  /* Screens                                                           */
  /* ================================================================ */
  function render() {
    document.getElementById('exportBtn').classList.toggle('hidden', V !== 'home');
    document.getElementById('remBtn').classList.toggle('hidden', V !== 'home');
    if (V === 'home') return home();
    if (V === 'odo') return odoScreen();
    if (V === 'details') return detailsScreen();
    if (V === 'edit') return editScreen();
    if (V === 'export') return exportScreen();
    if (V === 'reminders') return remindersScreen();
  }

  function home() {
    var h = '', last = lastTrip();
    if (D.active) {
      var a = D.active;
      h += '<div class="card"><span class="pill live">Trip in progress</span>' +
        '<div class="muted" style="margin-top:12px">Started ' + esc(niceDate(a.date)) + ', ' + esc(a.startTime) + ' from ' + esc(a.from) + '</div>' +
        '<div class="big">' + fmtKm(a.startOdo) + '<small>km</small></div>' +
        '<div class="stack" style="margin-top:14px">' +
        '<button class="primary" data-act="end">' + CAM + 'End trip</button>' +
        '<button class="text danger" data-act="cancel">' + (confirmCancel ? 'Tap again to discard this trip' : 'Cancel this trip') + '</button>' +
        '</div></div>';
    } else {
      h += '<div class="card"><span class="pill">Ready</span>' +
        (last ? '<div class="muted" style="margin-top:12px">Last odometer reading</div><div class="big">' + fmtKm(last.endOdo) + '<small>km</small></div>'
              : '<p class="muted" style="margin:12px 0 4px">No trips yet. Tap below when you get in the car.</p>') +
        '<div style="margin-top:14px"><button class="primary" data-act="start">' + CAM + 'Start trip</button></div></div>';
    }

    h += remBanner();
    var list = newestFirst();
    h += '<div class="card"><div class="row"><strong>Trips (' + list.length + ')</strong>' +
      '<button class="text small" data-act="add" style="padding:0 4px;min-height:32px">+ Add missed trip</button></div>';
    if (!list.length) {
      h += '<p class="muted" style="margin:8px 0 0">Finished trips appear here. Tap a trip to fix or delete it. Use <b>Export</b> to get an Excel file.</p>';
    } else {
      h += '<div style="margin-top:8px">' + list.slice(0, showN).map(function (t) {
        return '<button class="trip" data-act="edit" data-id="' + esc(t.id) + '"><div class="row"><span>' + esc(t.from) + ' → ' + esc(t.to) + '</span>' +
          '<span class="km">' + fmtKm(t.endOdo - t.startOdo) + ' km</span></div>' +
          '<div class="muted">' + esc(niceDate(t.date)) + (t.reason ? ' · ' + esc(t.reason) : '') + '</div></button>';
      }).join('') + '</div>';
      if (list.length > showN) h += '<button class="text" data-act="more">Show more</button>';
    }
    h += '</div>';
    h += '<p class="muted" style="text-align:center;margin:18px 8px 0">Trips are stored only on this phone. Export to Excel regularly as a backup.</p>';
    app.innerHTML = h;
  }

  function odoScreen() {
    var isEnd = F.mode === 'end', last = lastTrip();
    var h = '<div class="card">' +
      '<div class="step">' + (isEnd ? 'End trip · step 1 of 2' : 'Start trip') + '</div>' +
      '<h2>' + (isEnd ? 'Odometer at the end' : 'Odometer at the start') + '</h2>' +
      '<p class="muted" style="margin:0 0 14px">Take a clear, close photo of the odometer and the app reads the number. Or just type it.</p>' +
      '<label class="btn ' + (F.preview ? 'secondary' : 'primary') + '">' + CAM + (F.preview ? 'Retake photo' : 'Take photo') +
      '<input id="cam" type="file" accept="image/*" capture="environment" class="hidden"></label>' +
      (F.preview ? '<img class="photo" src="' + F.preview + '" alt="Odometer photo">' : '');

    if (F.busy) {
      h += '<div class="msg info" style="display:flex;gap:10px;align-items:center"><div class="spin"></div><span id="busyLabel">' + esc(F.busyLabel) + '</span></div>';
    } else if (F.note) {
      h += '<div class="msg ' + (F.noteKind || 'info') + '">' + esc(F.note) + '</div>';
    }

    h += '<label class="f" for="odo">Odometer reading (km)</label>' +
      '<input id="odo" class="in odo" data-k="reading" inputmode="numeric" autocomplete="off" placeholder="e.g. 123456" value="' + esc(F.reading) + '">';
    var sugg = (F.candidates || []).filter(function (c) { return String(c) !== digits(F.reading); });
    if (sugg.length) h += '<div class="muted" style="margin-top:10px">Other numbers in the photo:</div>' + chips(sugg, 'reading');
    if (!isEnd && last && digits(F.reading) !== String(last.endOdo)) {
      h += '<div class="muted" style="margin-top:10px">Same as where the last trip ended?</div>' + chips([last.endOdo], 'reading');
    }

    if (!isEnd) {
      h += '<label class="f" for="from">Where are you leaving from?</label>' +
        '<input id="from" class="in" data-k="from" autocomplete="off" placeholder="e.g. Home" value="' + esc(F.from) + '">' +
        chips(places(), 'from', F.from);
    }

    if (F.warn) h += '<div class="msg warn">' + esc(F.warn) + '</div>';
    if (F.error) h += '<div class="msg err">' + esc(F.error) + '</div>';

    h += '<div class="stack" style="margin-top:20px">' +
      '<button class="primary" data-act="odoNext"' + (F.busy ? ' disabled' : '') + '>' +
      (isEnd ? 'Next' : (F.warn ? 'Start trip anyway' : 'Start trip')) + '</button>' +
      '<button class="text" data-act="home">Back</button></div></div>';
    app.innerHTML = h;
  }

  function detailsScreen() {
    var a = D.active, end = Number(digits(F.reading)), km = end - a.startOdo;
    var h = '<div class="card">' +
      '<div class="step">End trip · step 2 of 2</div>' +
      '<h2>' + fmtKm(km) + ' km trip</h2>' +
      '<p class="muted" style="margin:0">From ' + esc(a.from) + ' · ' + fmtKm(a.startOdo) + ' → ' + fmtKm(end) + ' km</p>' +
      '<label class="f" for="reason">What was this trip for?</label>' +
      '<input id="reason" class="in" data-k="reason" autocomplete="off" placeholder="e.g. Client meeting" value="' + esc(F.reason) + '">' +
      chips(reasons(), 'reason', F.reason) +
      '<label class="f" for="to">Where did you go?</label>' +
      '<input id="to" class="in" data-k="to" autocomplete="off" placeholder="e.g. Sandton office" value="' + esc(F.to) + '">' +
      chips(places(), 'to', F.to);
    if (F.error) h += '<div class="msg err">' + esc(F.error) + '</div>';
    h += '<div class="stack" style="margin-top:20px">' +
      '<button class="primary" data-act="saveTrip">Save trip</button>' +
      '<button class="text" data-act="toOdo">Back</button></div></div>';
    app.innerHTML = h;
  }

  function editScreen() {
    var isNew = !F.id;
    var h = '<div class="card">' +
      '<div class="step">' + (isNew ? 'Add a missed trip' : 'Edit trip') + '</div>' +
      '<h2>' + (isNew ? 'New trip' : esc(F.from || '') + ' → ' + esc(F.to || '')) + '</h2>' +
      '<div class="two">' +
        '<div><label class="f" for="e-date">Date</label><input id="e-date" class="in" type="date" data-k="date" value="' + esc(F.date) + '"></div>' +
        '<div></div>' +
        '<div><label class="f" for="e-st">Start time</label><input id="e-st" class="in" type="time" data-k="startTime" value="' + esc(F.startTime) + '"></div>' +
        '<div><label class="f" for="e-et">End time</label><input id="e-et" class="in" type="time" data-k="endTime" value="' + esc(F.endTime) + '"></div>' +
        '<div><label class="f" for="e-so">Odometer start</label><input id="e-so" class="in" inputmode="numeric" data-k="startOdo" value="' + esc(F.startOdo) + '"></div>' +
        '<div><label class="f" for="e-eo">Odometer end</label><input id="e-eo" class="in" inputmode="numeric" data-k="endOdo" value="' + esc(F.endOdo) + '"></div>' +
      '</div>' +
      '<label class="f" for="e-from">From</label><input id="e-from" class="in" data-k="from" value="' + esc(F.from) + '">' +
      '<label class="f" for="e-to">To</label><input id="e-to" class="in" data-k="to" value="' + esc(F.to) + '">' +
      '<label class="f" for="e-r">Reason for trip</label><input id="e-r" class="in" data-k="reason" value="' + esc(F.reason) + '">' +
      chips(reasons(), 'reason', F.reason);
    if (F.error) h += '<div class="msg err">' + esc(F.error) + '</div>';
    h += '<div class="stack" style="margin-top:20px">' +
      '<button class="primary" data-act="saveEdit">' + (isNew ? 'Add trip' : 'Save changes') + '</button>' +
      (isNew ? '' : '<button class="secondary danger" data-act="delete">' + (F.confirmDelete ? 'Tap again to delete this trip' : 'Delete trip') + '</button>') +
      '<button class="text" data-act="home">Back</button></div></div>';
    app.innerHTML = h;
  }

  /* ---------------- export ---------------- */
  function presets() {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth();
    var tyStart = m >= 2 ? y : y - 1; // SA tax year: 1 March – end of February
    return [
      ['This month', dateStr(new Date(y, m, 1)), dateStr(new Date(y, m + 1, 0))],
      ['Last month', dateStr(new Date(y, m - 1, 1)), dateStr(new Date(y, m, 0))],
      ['This tax year', dateStr(new Date(tyStart, 2, 1)), dateStr(new Date(tyStart + 1, 2, 0))],
      ['Last tax year', dateStr(new Date(tyStart - 1, 2, 1)), dateStr(new Date(tyStart, 2, 0))],
      ['All trips', '', '']
    ];
  }
  function tripsInRange(from, to) {
    return sorted().filter(function (t) {
      return (!from || t.date >= from) && (!to || t.date <= to);
    });
  }
  function exportScreen() {
    var list = tripsInRange(F.from, F.to);
    var km = list.reduce(function (s, t) { return s + (t.endOdo - t.startOdo); }, 0);
    var h = '<div class="card"><h2>Export to Excel</h2>' +
      '<p class="muted" style="margin:0">Creates an Excel file on your phone with the trips in the dates you choose.</p>' +
      '<div class="chips" style="margin-top:14px">' + presets().map(function (p, i) {
        return '<button type="button" class="chip' + (F.preset === i ? ' on' : '') + '" data-preset="' + i + '">' + p[0] + '</button>';
      }).join('') + '</div>' +
      '<div class="two">' +
        '<div><label class="f" for="x-from">From</label><input id="x-from" class="in" type="date" data-k="from" value="' + esc(F.from) + '"></div>' +
        '<div><label class="f" for="x-to">To</label><input id="x-to" class="in" type="date" data-k="to" value="' + esc(F.to) + '"></div>' +
      '</div>' +
      '<div class="sum"><div><b id="x-n">' + list.length + '</b><span class="muted">trips</span></div>' +
      '<div><b id="x-km">' + fmtKm(km) + '</b><span class="muted">km</span></div></div>';
    if (F.error) h += '<div class="msg err">' + esc(F.error) + '</div>';
    h += '<div class="stack" style="margin-top:20px">' +
      '<button class="primary" data-act="download"' + (list.length ? '' : ' disabled') + '>' + XL + 'Save Excel file</button>' +
      (F.canShare ? '<button class="secondary" data-act="share"' + (list.length ? '' : ' disabled') + '>Share Excel file…</button>' : '') +
      '<button class="text" data-act="home">Back</button></div></div>' +
      '<p class="muted" style="text-align:center;margin:0 8px">The file goes to your phone’s Downloads folder. Open it with Excel or Google Sheets, or send it by email/WhatsApp.</p>';
    app.innerHTML = h;
  }
  function exportFile() {
    var list = tripsInRange(F.from, F.to);
    var name = 'Odometer logbook ' + (F.from || F.to ? (F.from || 'start') + ' to ' + (F.to || dateStr(new Date())) : 'all trips ' + dateStr(new Date())) + '.xlsx';
    var blob = buildXlsx(list);
    return { blob: blob, name: name, count: list.length };
  }

  /* ================================================================ */
  /* Actions                                                           */
  /* ================================================================ */
  function beginTrip(mode) {
    var last = lastTrip();
    go('odo', {
      mode: mode, reading: '', from: mode === 'start' ? (last ? last.to : '') : '',
      to: '', reason: '', preview: '', candidates: []
    });
  }

  function odoNext() {
    F.error = '';
    var n = Number(digits(F.reading)), last = lastTrip();
    if (!n) { F.error = 'Please enter the odometer reading.'; return render(); }
    if (F.mode === 'end') {
      var a = D.active;
      if (n < a.startOdo) { F.error = 'End reading is lower than the start reading (' + fmtKm(a.startOdo) + ' km).'; return render(); }
      if (n - a.startOdo > 2000 && !F.bigOk) {
        F.bigOk = true;
        F.error = 'That is a ' + fmtKm(n - a.startOdo) + ' km trip. Check the reading, or tap Next again if it is right.';
        return render();
      }
      V = 'details'; render(); window.scrollTo(0, 0);
      return;
    }
    if (!clean(F.from)) { F.error = 'Please enter where you are leaving from.'; return render(); }
    if (last && n < last.endOdo && !F.warn) {
      F.warn = 'This is lower than your last reading (' + fmtKm(last.endOdo) + ' km). Check it, or tap the button again to use it.';
      return render();
    }
    var now = new Date();
    D.active = { startOdo: n, from: clean(F.from), date: dateStr(now), startTime: timeStr(now) };
    if (save()) { go('home'); toast('Trip started. Drive safe!'); remSync(0); }
  }

  function saveTrip() {
    F.error = '';
    if (!clean(F.reason)) { F.error = 'Please say what the trip was for.'; return render(); }
    if (!clean(F.to)) { F.error = 'Please say where you went.'; return render(); }
    var a = D.active;
    D.trips.push({
      id: uid(), date: a.date, startTime: a.startTime, endTime: timeStr(new Date()),
      from: a.from, to: clean(F.to), reason: clean(F.reason),
      startOdo: a.startOdo, endOdo: Number(digits(F.reading))
    });
    D.active = null;
    if (save()) { go('home'); toast('Trip saved'); remSync(0); }
  }

  function openEdit(id) {
    var t = id ? D.trips.filter(function (x) { return x.id === id; })[0] : null;
    var last = lastTrip();
    go('edit', t ? {
      id: t.id, date: t.date, startTime: t.startTime || '', endTime: t.endTime || '',
      startOdo: String(t.startOdo), endOdo: String(t.endOdo), from: t.from, to: t.to, reason: t.reason
    } : {
      id: null, date: dateStr(new Date()), startTime: '', endTime: '',
      startOdo: last ? String(last.endOdo) : '', endOdo: '', from: last ? last.to : '', to: '', reason: ''
    });
  }

  function saveEdit() {
    F.error = '';
    var so = Number(digits(F.startOdo)), eo = Number(digits(F.endOdo));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(F.date || '')) F.error = 'Please enter the date.';
    else if (!so || !eo) F.error = 'Please enter both odometer readings.';
    else if (eo < so) F.error = 'The end reading must be the same as or higher than the start reading.';
    else if (!clean(F.from) || !clean(F.to)) F.error = 'Please fill in From and To.';
    else if (!clean(F.reason)) F.error = 'Please enter the reason for the trip.';
    if (F.error) return render();
    var rec = {
      id: F.id || uid(), date: F.date, startTime: F.startTime || '', endTime: F.endTime || '',
      from: clean(F.from), to: clean(F.to), reason: clean(F.reason), startOdo: so, endOdo: eo
    };
    var i = D.trips.findIndex(function (x) { return x.id === rec.id; });
    if (i >= 0) D.trips[i] = rec; else D.trips.push(rec);
    if (save()) { go('home'); toast(i >= 0 ? 'Trip updated' : 'Trip added'); }
  }

  function deleteTrip() {
    if (!F.confirmDelete) { F.confirmDelete = true; return render(); }
    D.trips = D.trips.filter(function (x) { return x.id !== F.id; });
    if (save()) { go('home'); toast('Trip deleted'); }
  }

  function openExport() {
    var p = presets()[0];
    var st = { preset: 0, from: p[1], to: p[2], canShare: false };
    try {
      var probe = new File([new Blob(['x'])], 'x.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      st.canShare = !!(navigator.canShare && navigator.canShare({ files: [probe] }));
    } catch (e) {}
    go('export', st);
  }

  function download() {
    var f = exportFile();
    var url = URL.createObjectURL(f.blob);
    var a = document.createElement('a');
    a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    toast('Saved “' + f.name + '”');
  }
  function share() {
    var f = exportFile();
    var file = new File([f.blob], f.name, { type: f.blob.type });
    navigator.share({ files: [file], title: f.name }).catch(function (e) {
      if (e && e.name !== 'AbortError') { F.error = 'Sharing failed: ' + e.message + ' Use Save Excel file instead.'; render(); }
    });
  }

  /* ================================================================ */
  /* Photo → reading (runs on the phone with Tesseract OCR)            */
  /* ================================================================ */
  var ocrWorker = null, ocrLoading = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not download the photo reader (are you offline?).')); };
      document.head.appendChild(s);
    });
  }
  function getOcr() {
    if (ocrWorker) return Promise.resolve(ocrWorker);
    if (!ocrLoading) {
      ocrLoading = (window.Tesseract ? Promise.resolve() : loadScript(TESS_JS)).then(function () {
        return window.Tesseract.createWorker('eng', 1, {
          workerPath: 'ocr-worker.js',
          workerBlobURL: false,
          logger: onOcrProgress
        });
      }).then(function (w) {
        return w.setParameters({ tessedit_char_whitelist: '0123456789.,', tessedit_pageseg_mode: '11' })
          .then(function () {
            ocrWorker = w;
            try { localStorage.setItem('odo.ocrReady', '1'); } catch (e) {}
            return w;
          });
      }).catch(function (e) { ocrLoading = null; throw e; });
    }
    return ocrLoading;
  }
  function onOcrProgress(m) {
    if (!F || !F.busy) return;
    var el = document.getElementById('busyLabel');
    if (!el) return;
    var pct = m.progress ? ' ' + Math.round(m.progress * 100) + '%' : '';
    if (/load|initializ/i.test(m.status) && localStorage.getItem('odo.ocrReady') !== '1') {
      el.textContent = 'Downloading the photo reader (one time only)…' + pct;
    } else if (/recogniz/i.test(m.status)) {
      el.textContent = 'Reading the odometer…' + pct;
    }
  }
  function withTimeout(p, ms, msg) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error(msg)); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  /** Loads a photo into a canvas (max 1600px), returns {preview, canvas}. */
  function prepPhoto(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, h = img.naturalHeight;
        var k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var preview = c.toDataURL('image/jpeg', 0.7);
        // grayscale + stretch contrast for better OCR
        var id = ctx.getImageData(0, 0, c.width, c.height), px = id.data, lo = 255, hi = 0, i, g;
        for (i = 0; i < px.length; i += 4) {
          g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          px[i] = g;
          if (g < lo) lo = g; if (g > hi) hi = g;
        }
        var range = Math.max(1, hi - lo);
        for (i = 0; i < px.length; i += 4) {
          g = (px[i] - lo) * 255 / range;
          px[i] = px[i + 1] = px[i + 2] = g;
        }
        ctx.putImageData(id, 0, 0);
        resolve({ preview: preview, canvas: c });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not open that photo.')); };
      img.src = url;
    });
  }
  function inverted(src) {
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    var ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    var id = ctx.getImageData(0, 0, c.width, c.height), px = id.data;
    for (var i = 0; i < px.length; i += 4) { px[i] = 255 - px[i]; px[i + 1] = 255 - px[i + 1]; px[i + 2] = 255 - px[i + 2]; }
    ctx.putImageData(id, 0, 0);
    return c;
  }

  function onPhoto(file) {
    if (!file || !F) return;
    var flow = F;
    flow.note = ''; flow.error = ''; flow.warn = '';
    var hint = flow.mode === 'end' ? D.active.startOdo : (lastTrip() ? lastTrip().endOdo : null);
    var canvas;
    prepPhoto(file).then(function (p) {
      flow.preview = p.preview; canvas = p.canvas;
      flow.busy = true;
      flow.busyLabel = localStorage.getItem('odo.ocrReady') === '1' ? 'Reading the odometer…' : 'Downloading the photo reader (one time only)…';
      if (F === flow) render();
      return withTimeout(getOcr(), 120000, 'The photo reader took too long to download.');
    }).then(function (w) {
      return w.recognize(canvas).then(function (r) {
        var pick = pickReading(r.data.text, hint);
        if (pick.best) return pick;
        return w.recognize(inverted(canvas)).then(function (r2) { return pickReading(r2.data.text, hint); });
      });
    }).then(function (pick) {
      flow.candidates = pick.candidates;
      if (pick.best) {
        flow.reading = String(pick.best);
        flow.note = 'Check that this matches your odometer. Tap the number to fix it if needed.';
        flow.noteKind = 'info';
      } else {
        flow.note = 'Couldn’t read the number from the photo. Please type it in, or retake the photo closer.';
        flow.noteKind = 'warn';
      }
    }).catch(function (e) {
      flow.note = (e && e.message ? e.message : 'Photo problem.') + ' Please type the reading instead.';
      flow.noteKind = 'warn';
    }).then(function () {
      flow.busy = false;
      if (F === flow) render();
    });
  }

  /** Picks the most likely odometer number from OCR text, using the last reading as a hint. */
  function pickReading(text, hint) {
    var FIX = { O: '0', o: '0', D: '0', Q: '0', U: '0', I: '1', l: '1', '|': '1', i: '1', L: '1',
                S: '5', s: '5', B: '8', Z: '2', z: '2', G: '6', b: '6', g: '9', q: '9', T: '7' };
    var scores = {};
    function score(v, len, kmLine) {
      var s = 0;
      if (len === 5 || len === 6) s += 20; else if (len === 4 || len === 7) s += 10;
      if (kmLine) s += 15;
      if (hint) {
        if (v >= hint && v - hint <= 3000) s += 100 - (v - hint) / 30;
        else if (v >= hint && v - hint <= 20000) s += 40;
        else if (v < hint) s -= 30;
      }
      return s;
    }
    function add(d, bonus, kmLine) {
      d = String(d).replace(/^0+(?=\d)/, '');
      if (d.length < 3 || d.length > 7) return;
      var v = parseInt(d, 10);
      if (!v) return;
      var s = bonus + score(v, d.length, kmLine);
      if (!(v in scores) || scores[v] < s) scores[v] = s;
    }
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var kmLine = /km|odo|total/i.test(line);
      var toks = line.split(/\s+/).filter(Boolean).map(function (t) {
        var dg = (t.match(/\d/g) || []).length, an = t.replace(/[^A-Za-z0-9|]/g, '').length;
        if (dg >= 2 && dg * 2 >= an) t = t.replace(/[ODQUIl|iLSsBZzGbgqT]/g, function (c) { return FIX[c]; });
        return t;
      });
      toks.forEach(function (t, i) {
        var bare = t.replace(/km$/i, '');
        if (/^\d{1,3}([,.'’]\d{3})+$/.test(bare)) add(bare.replace(/\D/g, ''), 5, kmLine);
        else if (/^\d+[.,]\d$/.test(t)) add(t.split(/[.,]/)[0], -30, kmLine);
        else (t.match(/\d+/g) || []).forEach(function (d) { add(d, 0, kmLine); });
        var nx = toks[i + 1];
        if (/^\d{1,3}$/.test(t) && nx && /^\d{3}$/.test(nx.replace(/km$/i, ''))) add(t + nx.replace(/km$/i, ''), 5, kmLine);
      });
      var run = '';
      toks.concat(['|end|']).forEach(function (t) {
        if (/^\d$/.test(t)) { run += t; return; }
        if (run.length >= 4) add(run, 5, kmLine);
        run = '';
      });
    });
    var ranked = Object.keys(scores).map(function (k) { return { v: Number(k), s: scores[k] }; })
      .sort(function (a, b) { return b.s - a.s || b.v - a.v; });
    return { best: ranked.length ? ranked[0].v : null, candidates: ranked.slice(0, 5).map(function (x) { return x.v; }) };
  }

  /* ================================================================ */
  /* Excel (.xlsx) writer — no internet or libraries needed            */
  /* ================================================================ */
  function xmlEsc(s) {
    return String(s == null ? '' : s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function colName(i) { return String.fromCharCode(65 + i); }
  function excelDate(s) {
    var p = s.split('-');
    return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(1899, 11, 30)) / 86400000);
  }
  function excelTime(s) {
    var m = /^(\d{1,2}):(\d{2})/.exec(s || '');
    return m ? (+m[1] * 60 + +m[2]) / 1440 : null;
  }

  function buildXlsx(trips) {
    var HEAD = ['Date', 'From', 'To', 'Reason for trip', 'Odometer start (km)', 'Odometer end (km)', 'Distance (km)', 'Start time', 'End time'];
    var WIDTHS = [12, 24, 24, 30, 18, 18, 14, 11, 11];
    // style ids: 1 header, 2 date, 3 number, 4 time, 5 text, 6 bold label, 7 bold number
    function str(ref, v, st) { return '<c r="' + ref + '" t="inlineStr"' + (st ? ' s="' + st + '"' : '') + '><is><t xml:space="preserve">' + xmlEsc(v) + '</t></is></c>'; }
    function num(ref, v, st) { return v == null ? '' : '<c r="' + ref + '"' + (st ? ' s="' + st + '"' : '') + '><v>' + v + '</v></c>'; }
    function fml(ref, f, v, st) { return '<c r="' + ref + '" s="' + st + '"><f>' + f + '</f><v>' + v + '</v></c>'; }

    var rows = ['<row r="1" ht="30" customHeight="1">' + HEAD.map(function (h, i) { return str(colName(i) + '1', h, 1); }).join('') + '</row>'];
    var total = 0;
    trips.forEach(function (t, i) {
      var r = i + 2, km = t.endOdo - t.startOdo;
      total += km;
      rows.push('<row r="' + r + '">' +
        num('A' + r, excelDate(t.date), 2) +
        str('B' + r, t.from, 5) + str('C' + r, t.to, 5) + str('D' + r, t.reason, 5) +
        num('E' + r, t.startOdo, 3) + num('F' + r, t.endOdo, 3) +
        fml('G' + r, 'F' + r + '-E' + r, km, 3) +
        num('H' + r, excelTime(t.startTime), 4) + num('I' + r, excelTime(t.endTime), 4) +
        '</row>');
    });
    var lastRow = trips.length + 1, tr = lastRow + 2;
    rows.push('<row r="' + tr + '">' + str('F' + tr, 'Total km', 6) +
      fml('G' + tr, 'SUM(G2:G' + Math.max(2, lastRow) + ')', total, 7) + '</row>');

    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<dimension ref="A1:I' + tr + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      '<cols>' + WIDTHS.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' +
      '<sheetData>' + rows.join('') + '</sheetData>' +
      (trips.length ? '<autoFilter ref="A1:I' + lastRow + '"/>' : '') +
      '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
      '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
      '</worksheet>';

    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="hh:mm"/></numFmts>' +
      '<fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left/><right/><top style="thin"><color auto="1"/></top><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="8">' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
        '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>' +
        '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
        '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
        '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
        '<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>' +
        '<xf numFmtId="3" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';

    var files = [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Trips" sheetId="1" r:id="rId1"/></sheets>' +
        (trips.length ? '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Trips!$A$1:$I$' + lastRow + '</definedName></definedNames>' : '') +
        '<calcPr calcId="191029" fullCalcOnLoad="1"/>' +
        '</workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>'],
      ['xl/worksheets/sheet1.xml', sheet],
      ['xl/styles.xml', styles]
    ];
    return new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  var CRC_T = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  /** Minimal ZIP writer (no compression). files = [[name, string], ...] */
  function zipStore(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    var now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f[0]), data = enc.encode(f[1]), crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true);
      ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var cdSize = central.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true);
    end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
    var all = parts.concat(central, [new Uint8Array(end.buffer)]);
    var total = all.reduce(function (s, p) { return s + p.length; }, 0), out = new Uint8Array(total), pos = 0;
    all.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  /* ================================================================ */
  /* Reminders — push notifications sent by the app owner's            */
  /* Cloudflare Worker (address in config.js)                          */
  /* ================================================================ */
  var CFG = window.ODO_CONFIG || {};
  var SERVER = String(CFG.reminderServer || '').trim().replace(/\/+$/, '');
  var REM_KEY = 'odo.rem';
  var MAX_REM = 2;
  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  var WEEKDAYS = [1, 2, 3, 4, 5];
  var ALLDAYS = [0, 1, 2, 3, 4, 5, 6];
  var DEFAULT_REM = [
    { id: 'a', time: '07:00', days: WEEKDAYS, on: true, text: 'Remember to log your odometer today.' },
    { id: 'b', time: '18:00', days: WEEKDAYS, on: true, text: 'Have you logged today\u2019s trips?' }
  ];
  var R = loadRem();
  var remStatus = '', remBusy = false, remError = '', remDelConfirm = -1;
  var BELL = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

  function loadRem() {
    try {
      var r = JSON.parse(localStorage.getItem(REM_KEY));
      if (r && Array.isArray(r.reminders)) return r;
    } catch (e) {}
    return { reminders: JSON.parse(JSON.stringify(DEFAULT_REM)), tripAlert: true, pushOn: false, sub: null, dirty: false, bannerHidden: false };
  }
  function saveRem() { try { localStorage.setItem(REM_KEY, JSON.stringify(R)); } catch (e) {} }
  function deviceId() {
    var id = localStorage.getItem('odo.device');
    if (!id) {
      var a = new Uint8Array(16);
      crypto.getRandomValues(a);
      id = 'd' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      localStorage.setItem('odo.device', id);
    }
    return id;
  }
  function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function perm() { return 'Notification' in window ? Notification.permission : 'unsupported'; }
  function myTz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } }
  function remIsOn() { return !!(SERVER && R.pushOn && perm() === 'granted'); }

  function api(path, body) {
    return fetch(SERVER + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || j.ok === false) throw new Error(j.error || ('server error ' + r.status));
        return j;
      });
    });
  }

  var syncTimer = null;
  /** Sends this phone's reminder settings + "trip running yes/no" to the server. */
  function remSync(delay) {
    if (!SERVER || !R.pushOn) return;
    R.dirty = true; saveRem();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      setRemStatus('saving');
      api('/sync', { id: deviceId(), sub: R.sub, tz: myTz(), reminders: R.reminders, tripAlert: R.tripAlert, tripActive: !!D.active })
        .then(function () { R.dirty = false; saveRem(); setRemStatus('saved'); })
        .catch(function (e) { setRemStatus(navigator.onLine === false ? 'offline' : 'error:' + e.message); });
    }, delay || 0);
  }
  function setRemStatus(s) {
    remStatus = s;
    var el = document.getElementById('remStatus');
    if (el) el.innerHTML = remStatusHtml();
  }
  function remStatusHtml() {
    if (remStatus === 'saving') return 'Saving…';
    if (remStatus === 'saved') return 'Saved ✓';
    if (remStatus.indexOf('error:') === 0) return '<span class="danger">Could not save (' + esc(remStatus.slice(6)) + '). It will retry.</span>';
    if (remStatus === 'offline' || R.dirty) return 'Changes will be saved when you’re online.';
    return '';
  }

  function keyBytes(s) {
    var b = s.replace(/-/g, '+').replace(/_/g, '/'), bin = atob(b + '==='.slice((b.length + 3) % 4));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function sameKey(buf, bytes) {
    var a = new Uint8Array(buf);
    if (a.length !== bytes.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== bytes[i]) return false;
    return true;
  }
  /** Gets (or makes) this phone's push subscription for the server's key. */
  function subscribe() {
    var reg;
    return navigator.serviceWorker.ready.then(function (r) { reg = r; return api('/vapid'); }).then(function (v) {
      var key = keyBytes(v.publicKey);
      return reg.pushManager.getSubscription().then(function (s) {
        if (s && s.options && s.options.applicationServerKey && !sameKey(s.options.applicationServerKey, key)) {
          return s.unsubscribe().then(function () { return null; });
        }
        return s;
      }).then(function (s) {
        return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      });
    }).then(function (s) { R.sub = s.toJSON(); saveRem(); return s; });
  }

  function enableReminders() {
    remBusy = true; remError = ''; render();
    Notification.requestPermission().then(function (p) {
      if (p !== 'granted') throw new Error(p === 'denied' ? 'blocked' : 'Notifications were not allowed. Tap the button again and choose Allow.');
      return subscribe();
    }).then(function () {
      R.pushOn = true; R.bannerHidden = true; saveRem();
      return api('/sync', { id: deviceId(), sub: R.sub, tz: myTz(), reminders: R.reminders, tripAlert: R.tripAlert, tripActive: !!D.active });
    }).then(function () {
      R.dirty = false; saveRem(); remStatus = 'saved';
      toast('Reminders are on');
    }).catch(function (e) {
      if (e.message !== 'blocked') remError = navigator.onLine === false ? 'You’re offline. Connect to the internet and try again.' : 'Could not turn on reminders: ' + e.message;
      if (R.pushOn) { R.dirty = true; saveRem(); remError = ''; }
    }).then(function () { remBusy = false; if (V === 'reminders') render(); });
  }

  function disableReminders() {
    remBusy = true; render();
    var id = deviceId();
    navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); })
      .then(function (s) { return s && s.unsubscribe(); }).catch(function () {})
      .then(function () { return api('/remove', { id: id }).catch(function () {}); })
      .then(function () {
        R.pushOn = false; R.sub = null; R.dirty = false; saveRem();
        remBusy = false; remStatus = ''; render(); toast('Reminders turned off');
      });
  }

  function sendTest() {
    remError = '';
    api('/test', { id: deviceId() }).then(function () {
      toast('Test sent – it should arrive in a few seconds');
    }).catch(function (e) {
      toast(navigator.onLine === false ? 'You’re offline' : e.message);
    });
  }

  /** On app start: keep the subscription and server in step. */
  function remStartup() {
    if (!SERVER || !R.pushOn || !pushSupported()) return;
    if (perm() !== 'granted') return; // shown on the Reminders screen
    navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (s) {
      if (!s) return subscribe().then(function () { remSync(0); });
      var j = s.toJSON();
      if (!R.sub || R.sub.endpoint !== j.endpoint) { R.sub = j; saveRem(); remSync(0); }
      else if (R.dirty) remSync(0);
    }).catch(function () {});
  }
  window.addEventListener('online', function () { if (R.dirty) remSync(0); });

  var chimeAudio = null;
  function playChime() {
    try {
      if (!chimeAudio) chimeAudio = new Audio('sounds/odometer-chime.mp3');
      chimeAudio.currentTime = 0;
      chimeAudio.play().catch(function () {});
    } catch (e) {}
  }
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'chime' && document.visibilityState === 'visible') playChime();
    });
  }

  function remBanner() {
    if (!SERVER || !pushSupported() || R.pushOn || R.bannerHidden || perm() === 'denied') return '';
    return '<div class="card"><div class="row" style="align-items:center"><strong>Get reminders</strong>' +
      '<button class="text small" data-act="remBannerHide" style="min-height:32px;padding:0 4px">Not now</button></div>' +
      '<p class="muted" style="margin:4px 0 12px">A notification at 07:00 and 18:00 on weekdays, and at 18:00 if a trip is still running. You can change the times and days.</p>' +
      '<button class="secondary" data-act="reminders">' + BELL + 'Set up reminders</button></div>';
  }

  function remindersScreen() {
    var on = remIsOn();
    var h = '<div class="card"><div class="row" style="align-items:center"><h2 style="margin:0">Reminders</h2>' +
      '<span class="pill' + (on ? ' live' : '') + '">' + (on ? 'On' : 'Off') + '</span></div>';
    if (!SERVER) {
      h += '<div class="msg warn">Reminders are not set up in this copy of the app yet. (App owner: put the reminder server address in config.js.)</div>';
    } else if (!pushSupported()) {
      h += '<div class="msg warn">This browser can’t show reminders. Open the app in Chrome and install it to your home screen.</div>';
    } else if (perm() === 'denied') {
      h += '<div class="msg warn">Notifications are blocked for this app. Open your phone’s <b>Settings → Apps → Odometer</b> (or <b>Chrome</b>) <b>→ Notifications</b>, allow them, then come back here.</div>' +
        '<div style="margin-top:14px"><button class="secondary" data-act="remOn">Try again</button></div>';
    } else if (!on) {
      h += '<p class="muted" style="margin:6px 0 14px">Get a notification with two soft chimes at the times you choose – even when the app is closed.</p>' +
        '<button class="primary" data-act="remOn"' + (remBusy ? ' disabled' : '') + '>' + (remBusy ? '<div class="spin"></div>Turning on…' : BELL + 'Turn on reminders') + '</button>';
    } else {
      h += '<p class="muted" style="margin:8px 0 0">Notifications arrive even when the app is closed. <span id="remStatus">' + remStatusHtml() + '</span></p>' +
        '<div class="stack" style="margin-top:14px"><button class="secondary" data-act="remTest">Send a test notification</button>' +
        '<button class="text danger" data-act="remOff"' + (remBusy ? ' disabled' : '') + '>Turn off reminders</button></div>';
    }
    if (remError) h += '<div class="msg err">' + esc(remError) + '</div>';
    h += '</div>';

    R.reminders.forEach(function (r, i) {
      h += '<div class="card' + (r.on ? '' : ' off-card') + '"><div class="row" style="align-items:center"><strong>Reminder ' + (i + 1) + '</strong>' +
        '<button class="sw" role="switch" aria-checked="' + !!r.on + '" aria-label="Reminder ' + (i + 1) + ' on or off" data-act="remToggle" data-i="' + i + '"></button></div>' +
        '<label class="f" for="rt' + i + '">Time</label>' +
        '<input id="rt' + i + '" class="in time" type="time" data-rk="' + i + ':time" value="' + esc(r.time) + '">' +
        '<label class="f">Days</label><div class="days">' + DAY_ORDER.map(function (d) {
          var sel = r.days.indexOf(d) >= 0;
          return '<button type="button" class="day' + (sel ? ' on' : '') + '" data-day="' + i + ':' + d + '" aria-pressed="' + sel + '" aria-label="' + DAY_NAMES[d] + '">' + DAY_NAMES[d].slice(0, 2) + '</button>';
        }).join('') + '</div>' +
        '<div class="chips"><button type="button" class="chip" data-days="' + i + ':week">Weekdays</button>' +
        '<button type="button" class="chip" data-days="' + i + ':all">Every day</button></div>' +
        (r.days.length ? '' : '<div class="msg warn">No days chosen – this reminder won’t go off.</div>') +
        '<label class="f" for="rx' + i + '">Message</label>' +
        '<input id="rx' + i + '" class="in" data-rk="' + i + ':text" maxlength="120" value="' + esc(r.text) + '">' +
        '<button class="text danger" data-act="remDel" data-i="' + i + '" style="margin-top:8px">' +
        (remDelConfirm === i ? 'Tap again to remove' : 'Remove this reminder') + '</button></div>';
    });
    if (R.reminders.length < MAX_REM) h += '<button class="secondary" data-act="remAdd" style="margin-bottom:14px">+ Add a reminder</button>';
    else h += '<p class="muted" style="text-align:center;margin:0 0 14px">You can have up to ' + MAX_REM + ' reminders.</p>';

    h += '<div class="card"><div class="row" style="align-items:center"><div><strong>Trip still running</strong>' +
      '<div class="muted">At 18:00, remind me if I haven’t ended a trip yet.</div></div>' +
      '<button class="sw" role="switch" aria-checked="' + !!R.tripAlert + '" aria-label="Trip still running reminder on or off" data-act="tripAlert"></button></div></div>';

    h += '<div class="card"><strong>Sound</strong>' +
      '<p class="muted" style="margin:6px 0 12px">Reminders use two soft chimes. Your phone plays its normal notification sound until you choose the chime once (steps below).</p>' +
      '<div class="two"><button class="secondary" data-act="chime">▶ Play</button>' +
      '<a class="btn secondary" href="sounds/odometer-chime.mp3" download="Odometer chime.mp3">Download</a></div>' +
      '<details style="margin-top:10px"><summary>How to use the chime for reminders</summary><ol class="muted">' +
      '<li>Tap <b>Download</b> above. The sound is saved in your phone’s Downloads.</li>' +
      '<li>Tap <b>Send a test notification</b>. When it appears, <b>press and hold</b> it, then tap the ⚙ settings icon (or <b>Settings</b>).</li>' +
      '<li>Tap <b>Sound</b> and choose <b>Odometer chime</b>. If it isn’t listed, tap <b>+</b>, <b>Add sound</b> or <b>My sounds</b> and pick the file from Downloads.</li>' +
      '<li>Some phones only list sounds in the <b>Notifications</b> folder: open the <b>Files</b> app, move “Odometer chime.mp3” from Download to Notifications, then try step 3 again.</li>' +
      '</ol></details></div>' +
      '<p class="muted" style="text-align:center;margin:0 8px 6px">Only your reminder times and “trip running: yes/no” are sent to the reminder server. Your trips stay on this phone.</p>' +
      '<button class="text" data-act="home">Back</button>';
    app.innerHTML = h;
  }

  function remChanged(delay) { saveRem(); remSync(delay); }
  function remInput(e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-rk');
    if (!k) return false;
    var p = k.split(':'), r = R.reminders[+p[0]];
    if (!r) return true;
    if (p[1] === 'time') { if (!/^\d{2}:\d{2}$/.test(e.target.value)) return true; r.time = e.target.value; }
    else r.text = e.target.value.slice(0, 120);
    remChanged(900);
    return true;
  }
  function remClick(e) {
    var dayBtn = e.target.closest('[data-day]');
    if (dayBtn) {
      var p = dayBtn.getAttribute('data-day').split(':'), r = R.reminders[+p[0]], d = +p[1];
      var at = r.days.indexOf(d);
      if (at >= 0) r.days.splice(at, 1); else r.days.push(d);
      r.days.sort();
      remChanged(600); render();
      return true;
    }
    var setBtn = e.target.closest('[data-days]');
    if (setBtn) {
      var q = setBtn.getAttribute('data-days').split(':');
      R.reminders[+q[0]].days = (q[1] === 'all' ? ALLDAYS : WEEKDAYS).slice();
      remChanged(600); render();
      return true;
    }
    return false;
  }
  function remAction(act, btn) {
    var i = +btn.getAttribute('data-i');
    if (act !== 'remDel') remDelConfirm = -1;
    switch (act) {
      case 'reminders': remError = ''; go('reminders'); return true;
      case 'remBannerHide': R.bannerHidden = true; saveRem(); render(); return true;
      case 'remOn': enableReminders(); return true;
      case 'remOff': disableReminders(); return true;
      case 'remTest': sendTest(); return true;
      case 'chime': playChime(); return true;
      case 'tripAlert': R.tripAlert = !R.tripAlert; remChanged(300); render(); return true;
      case 'remToggle': R.reminders[i].on = !R.reminders[i].on; remChanged(300); render(); return true;
      case 'remAdd':
        if (R.reminders.length < MAX_REM) {
          var used = R.reminders.map(function (x) { return x.id; });
          var id = 'abcdefgh'.split('').filter(function (c) { return used.indexOf(c) < 0; })[0];
          R.reminders.push({ id: id, time: '12:00', days: WEEKDAYS.slice(), on: true, text: 'Remember to log your odometer.' });
          remChanged(300); render();
        }
        return true;
      case 'remDel':
        if (remDelConfirm !== i) { remDelConfirm = i; render(); return true; }
        R.reminders.splice(i, 1); remDelConfirm = -1;
        remChanged(300); render();
        return true;
    }
    return false;
  }

  /* ================================================================ */
  /* Events                                                            */
  /* ================================================================ */
  document.addEventListener('input', function (e) {
    if (remInput(e)) return;
    var k = e.target.getAttribute && e.target.getAttribute('data-k');
    if (!k || !F) return;
    F[k] = e.target.value;
    if (k === 'reading') { F.warn = ''; F.bigOk = false; }
    if (V === 'export') {
      F.preset = -1;
      var list = tripsInRange(F.from, F.to);
      document.getElementById('x-n').textContent = list.length;
      document.getElementById('x-km').textContent = fmtKm(list.reduce(function (s, t) { return s + (t.endOdo - t.startOdo); }, 0));
      document.querySelectorAll('[data-preset]').forEach(function (b) { b.classList.remove('on'); });
      document.querySelectorAll('[data-act=download],[data-act=share]').forEach(function (b) { b.disabled = !list.length; });
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'cam') { onPhoto(e.target.files && e.target.files[0]); e.target.value = ''; }
  });
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('[data-chip]');
    if (chip && F) {
      var k = chip.getAttribute('data-chip');
      F[k] = chip.getAttribute('data-v');
      if (k === 'reading') { F.warn = ''; F.bigOk = false; F.note = ''; }
      return render();
    }
    if (V === 'reminders' && remClick(e)) return;
    var pre = e.target.closest('[data-preset]');
    if (pre && F) {
      var p = presets()[+pre.getAttribute('data-preset')];
      F.preset = +pre.getAttribute('data-preset'); F.from = p[1]; F.to = p[2];
      return render();
    }
    var btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    var act = btn.getAttribute('data-act');
    if (remAction(act, btn)) return;
    if (act !== 'cancel') confirmCancel = false;
    switch (act) {
      case 'start': beginTrip('start'); break;
      case 'end': beginTrip('end'); break;
      case 'cancel':
        if (!confirmCancel) { confirmCancel = true; home(); }
        else { D.active = null; save(); go('home'); toast('Trip discarded'); remSync(0); }
        break;
      case 'home': go('home'); break;
      case 'odoNext': odoNext(); break;
      case 'toOdo': V = 'odo'; F.error = ''; render(); break;
      case 'saveTrip': saveTrip(); break;
      case 'add': openEdit(null); break;
      case 'edit': openEdit(btn.getAttribute('data-id')); break;
      case 'saveEdit': saveEdit(); break;
      case 'delete': deleteTrip(); break;
      case 'more': showN += 30; home(); break;
      case 'export': openExport(); break;
      case 'download': download(); break;
      case 'share': share(); break;
    }
  });

  /* Install button (Android Chrome) */
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); installEvt = e;
    document.getElementById('installBtn').classList.remove('hidden');
  });
  document.getElementById('installBtn').addEventListener('click', function () {
    if (!installEvt) return;
    installEvt.prompt();
    installEvt.userChoice.finally(function () {
      installEvt = null;
      document.getElementById('installBtn').classList.add('hidden');
    });
  });
  window.addEventListener('appinstalled', function () {
    document.getElementById('installBtn').classList.add('hidden');
    toast('Installed! Open it from your home screen.');
  });

  /* Offline support + pre-download the photo reader once, while online */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(function () {
      function warm() {
        if (navigator.onLine && localStorage.getItem('odo.ocrReady') !== '1') {
          setTimeout(function () { getOcr().catch(function () {}); }, 1500);
        }
      }
      if (navigator.serviceWorker.controller) warm();
      else navigator.serviceWorker.addEventListener('controllerchange', warm, { once: true });
    }).catch(function () {});
  }

  remStartup();

  // expose for testing
  window.__odo = { pickReading: pickReading, buildXlsx: buildXlsx };

  render();
})();
