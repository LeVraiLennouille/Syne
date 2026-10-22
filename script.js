(() => {
  'use strict';

  /* ======================================================================
     Constantes
     ====================================================================== */

  const STORAGE_KEY = 'duo-code-state-v1';
  const SETTINGS_KEY = 'duo-code-settings-v1';
  const STATS_KEY = 'duo-code-stats-v1';
  const LEGACY_THEME_KEY = 'duo-code-theme-v1';
  const GRID_SIZE = 25;
  const TARGET = 15;
  const MAX_GAMES = 500;

  // Assassins par clé et jetons de tours selon la difficulté (Duet officiel : 3 et 9)
  const DIFFICULTIES = {
    easy: { label: 'Facile', assassins: 2, tokens: 11 },
    normal: { label: 'Normal', assassins: 3, tokens: 9 },
    hard: { label: 'Difficile', assassins: 4, tokens: 8 }
  };

  const PROXIMITIES = {
    far: {
      label: 'Éloignés',
      hint: 'Les mots sont répartis à parts égales entre les thèmes choisis : peu d’ambiguïtés, indices plus faciles.'
    },
    random: {
      label: 'Au hasard',
      hint: 'Tirage au hasard parmi tous les mots des thèmes choisis.'
    },
    close: {
      label: 'Proches',
      hint: 'Tous les mots viennent d’un seul des thèmes choisis (tiré au sort) : beaucoup d’ambiguïtés, indices plus difficiles.'
    }
  };

  /* ======================================================================
     Utilitaires
     ====================================================================== */

  const $ = (id) => document.getElementById(id);
  const h = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const mq = (q) => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} });
  const other = (p) => (p === 1 ? 2 : 1);

  // Taille de police d'une carte selon la longueur du mot (unités du plateau : cqw),
  // pour que les mots tiennent sur une ligne sans être coupés en pleine lettre
  function fitFont(el, word) {
    const f = Math.min(3.5, 15.5 / (0.72 * Math.max(word.length, 1)));
    el.style.fontSize = 'clamp(7px, ' + f.toFixed(2) + 'cqw, 26px)';
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* stockage indisponible */ }
  }

  /* ======================================================================
     Réglages (persistants)
     ====================================================================== */

  const DEFAULTS = {
    themes: null, // null = pas encore choisi (premier thème par défaut)
    difficulty: 'normal',
    proximity: 'random',
    appearance: 'auto', // auto | light | dark
    colorblind: false,
    layout: 'auto', // auto | portrait | landscape
    anim: !mq('(prefers-reduced-motion: reduce)').matches,
    flip: false,
    sound: true,
    volume: 0.6,
    vibrate: true
  };

  let settings = Object.assign({}, DEFAULTS, (() => {
    const s = readJSON(SETTINGS_KEY);
    return s && typeof s === 'object' ? s : {};
  })());
  const saveSettings = () => writeJSON(SETTINGS_KEY, settings);

  /* ======================================================================
     Éléments du DOM
     ====================================================================== */

  const els = {
    app: $('app'),
    board: $('board'),
    score: $('score'),
    bar: $('progress-bar'),
    tokens: $('tokens'),
    tokensLabel: $('tokens-label'),
    turnCount: $('turn-count'),
    turnLabel: $('turn-label'),
    configSummary: $('config-summary'),
    btnConfig: $('btn-config'),
    btnFlip: $('btn-flip'),
    btnStats: $('btn-stats'),
    btnSettings: $('btn-settings'),
    btnP1: $('btn-p1'),
    btnP2: $('btn-p2'),
    btnEnd: $('btn-end-turn'),
    btnNew: $('btn-new'),
    secret: $('secret'),
    secretTitle: $('secret-title'),
    secretCover: $('secret-cover'),
    secretContent: $('secret-content'),
    secretBoard: $('secret-board'),
    legendG: $('legend-g'),
    legendB: $('legend-b'),
    btnReveal: $('btn-reveal'),
    btnHide: $('btn-hide'),
    result: $('result'),
    resultIcon: $('result-icon'),
    resultTitle: $('result-title'),
    resultText: $('result-text'),
    resultMeta: $('result-meta'),
    btnShareText: $('btn-share-text'),
    btnShareImage: $('btn-share-image'),
    btnReplay: $('btn-replay'),
    btnViewBoard: $('btn-view-board'),
    settings: $('settings'),
    btnSettingsClose: $('btn-settings-close'),
    chips: $('theme-chips'),
    btnThemesAll: $('btn-themes-all'),
    btnThemesNone: $('btn-themes-none'),
    themeHint: $('theme-hint'),
    segDifficulty: $('seg-difficulty'),
    difficultyHint: $('difficulty-hint'),
    segProximity: $('seg-proximity'),
    proximityHint: $('proximity-hint'),
    btnApplyNew: $('btn-apply-new'),
    segAppearance: $('seg-appearance'),
    optColorblind: $('opt-colorblind'),
    segLayout: $('seg-layout'),
    optFlip: $('opt-flip'),
    optAnim: $('opt-anim'),
    optSound: $('opt-sound'),
    optVolume: $('opt-volume'),
    optVibrate: $('opt-vibrate'),
    stats: $('stats'),
    statsBody: $('stats-body'),
    btnStatsClose: $('btn-stats-close'),
    btnStatsReset: $('btn-stats-reset'),
    toast: $('toast'),
    metaTheme: $('meta-theme')
  };

  let THEMES = {}; // chargés depuis words.json
  let state = null;
  let secretPlayer = 1;
  let toastTimer = null;
  const fx = { reveal: -1, kind: 'flip', deal: false }; // animation à jouer au prochain rendu

  /* ======================================================================
     Affichage : apparence, daltonisme, disposition, rotation
     ====================================================================== */

  const mqDark = mq('(prefers-color-scheme: dark)');
  const mqLandscape = mq('(orientation: landscape) and (min-width: 640px)');

  function applyDisplay() {
    const root = document.documentElement;
    const dark = settings.appearance === 'dark' || (settings.appearance === 'auto' && mqDark.matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.cb = settings.colorblind ? '1' : '0';
    root.dataset.anim = settings.anim ? '1' : '0';
    root.dataset.flip = settings.flip ? '1' : '0';
    const landscape = settings.layout === 'landscape' || (settings.layout === 'auto' && mqLandscape.matches);
    root.dataset.layout = landscape ? 'landscape' : 'portrait';
    if (els.metaTheme) els.metaTheme.setAttribute('content', dark ? '#121513' : '#f4f1ea');
  }
  [mqDark, mqLandscape].forEach((m) => {
    if (m.addEventListener) m.addEventListener('change', applyDisplay);
  });

  /* ======================================================================
     Sons (WebAudio, aucun fichier) et vibrations
     ====================================================================== */

  const Sound = (() => {
    let ctx = null;

    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch (e) { return null; }
      }
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return ctx;
    }

    function beep(c, t, freq, dur, type, vol, freqEnd) {
      const o = c.createOscillator();
      const g = c.createGain();
      const peak = Math.max(0.0002, vol * settings.volume * 0.45);
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.03);
    }

    const SOUNDS = {
      tap: (c, t) => beep(c, t, 520, 0.07, 'sine', 0.6),
      turn: (c, t) => beep(c, t, 400, 0.1, 'sine', 0.5),
      agent: (c, t) => { beep(c, t, 660, 0.12, 'triangle', 0.8); beep(c, t + 0.1, 990, 0.22, 'triangle', 0.8); },
      neutral: (c, t) => beep(c, t, 230, 0.25, 'sine', 0.8, 150),
      assassin: (c, t) => { beep(c, t, 190, 0.55, 'sawtooth', 0.7, 40); beep(c, t + 0.05, 95, 0.65, 'square', 0.5, 35); },
      win: (c, t) => [523, 659, 784, 1047].forEach((f, i) => beep(c, t + i * 0.12, f, 0.32, 'triangle', 0.8)),
      lose: (c, t) => [392, 311, 262, 196].forEach((f, i) => beep(c, t + i * 0.16, f, 0.36, 'sawtooth', 0.5)),
      sudden: (c, t) => { for (let i = 0; i < 3; i++) beep(c, t + i * 0.18, 880, 0.12, 'square', 0.4); }
    };

    return {
      play(name) {
        if (!settings.sound || settings.volume <= 0 || !SOUNDS[name]) return;
        const c = ensure();
        if (c) SOUNDS[name](c, c.currentTime + 0.01);
      }
    };
  })();

  function buzz(pattern) {
    if (settings.vibrate && navigator.vibrate) navigator.vibrate(pattern);
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1900);
  }

  /* ======================================================================
     Thèmes (words.json)
     ====================================================================== */

  async function loadThemes() {
    const res = await fetch('words.json');
    if (!res.ok) throw new Error('words.json : HTTP ' + res.status);
    const data = await res.json();
    const themes = {};
    Object.entries(data.themes || {}).forEach(([id, t]) => {
      // Normalisation : majuscules, espaces retirés, doublons supprimés
      const words = [...new Set((t.words || []).map((w) => String(w).trim().toUpperCase()).filter(Boolean))];
      if (words.length >= GRID_SIZE) themes[id] = { label: t.label || id, words };
    });
    if (!Object.keys(themes).length) throw new Error('words.json : aucun thème valide');
    return themes;
  }

  const themeIds = () => Object.keys(THEMES);
  const validThemes = (ids) => (ids || []).filter((id) => THEMES[id]);
  const poolSize = (ids) => new Set(ids.flatMap((id) => THEMES[id].words)).size;
  const themeLabels = (ids) => ids.map((id) => (THEMES[id] ? THEMES[id].label : id));

  function themeSummary(ids) {
    const labels = themeLabels(ids);
    if (ids.length > 2 && ids.length === themeIds().length) return 'Tous les thèmes';
    return labels.length <= 2 ? labels.join(' + ') : labels.length + ' thèmes';
  }

  // Tire 25 mots dans les thèmes choisis selon la proximité voulue
  function pickWords(ids, proximity) {
    const union = () => [...new Set(ids.flatMap((id) => THEMES[id].words))];

    if (ids.length > 1 && proximity === 'far') {
      // Tour de rôle entre les thèmes : répartition la plus équilibrée possible
      const pools = ids.map((id) => shuffle(THEMES[id].words));
      const out = [];
      const seen = new Set();
      for (let r = 0; out.length < GRID_SIZE && pools.some((p) => r < p.length); r++) {
        for (const p of pools) {
          if (out.length >= GRID_SIZE) break;
          const w = p[r];
          if (w !== undefined && !seen.has(w)) { seen.add(w); out.push(w); }
        }
      }
      return shuffle(out);
    }

    if (ids.length > 1 && proximity === 'close') {
      // Tous les mots d'un seul thème tiré au sort
      const big = ids.filter((id) => THEMES[id].words.length >= GRID_SIZE);
      const pool = big.length ? big : ids;
      const main = pool[Math.floor(Math.random() * pool.length)];
      const out = shuffle(THEMES[main].words).slice(0, GRID_SIZE);
      if (out.length < GRID_SIZE) {
        const have = new Set(out);
        out.push(...shuffle(union().filter((w) => !have.has(w))).slice(0, GRID_SIZE - out.length));
      }
      return shuffle(out);
    }

    return shuffle(union()).slice(0, GRID_SIZE);
  }

  /* ======================================================================
     Clés secrètes (règle Duet)
     ====================================================================== */

  // Paires [clé Joueur 1, clé Joueur 2] : g = agent, n = passant innocent, b = assassin.
  // Chaque clé : 9 agents (dont 3 communs → 15 agents uniques) et A assassins.
  const rep = (a, b, n) => Array.from({ length: n }, () => [a, b]);

  function buildLayout(assassins) {
    const shared = assassins >= 3 ? 1 : 0; // assassins communs aux deux clés
    const solo = assassins - 1 - shared; // assassins « à sens unique » par clé
    const layout = [
      ...rep('g', 'g', 3),
      ...rep('g', 'n', 5),
      ...rep('g', 'b', 1),
      ...rep('n', 'g', 5),
      ...rep('b', 'g', 1),
      ...rep('b', 'b', shared),
      ...rep('b', 'n', solo),
      ...rep('n', 'b', solo)
    ];
    while (layout.length < GRID_SIZE) layout.push(['n', 'n']);
    return layout;
  }

  /* ======================================================================
     État de la partie
     ====================================================================== */

  const foundCount = () => state.status.filter((s) => s === 'green').length;
  // Agents de la clé k pas encore trouvés
  const remaining = (k) => state.keys[k].filter((t, i) => t === 'g' && state.status[i] !== 'green').length;
  // Carte « morte » : trouvée, assassin, ou passant innocent pour les deux clés
  const isDead = (i) =>
    state.status[i] === 'green' || state.status[i] === 'black' || (state.marks[1][i] && state.marks[2][i]);

  function newGame() {
    let ids = validThemes(settings.themes);
    if (!ids.length || poolSize(ids) < GRID_SIZE) ids = themeIds();
    const diff = DIFFICULTIES[settings.difficulty] ? settings.difficulty : 'normal';
    const prox = PROXIMITIES[settings.proximity] ? settings.proximity : 'random';
    const d = DIFFICULTIES[diff];
    const pairs = shuffle(buildLayout(d.assassins));
    state = {
      themes: ids,
      difficulty: diff,
      proximity: prox,
      assassins: d.assassins,
      words: pickWords(ids, prox),
      keys: { 1: pairs.map((p) => p[0]), 2: pairs.map((p) => p[1]) },
      status: Array(GRID_SIZE).fill('hidden'), // hidden | green | black
      // marks[k][i] : carte révélée comme passant innocent avec la clé du Joueur k
      marks: { 1: Array(GRID_SIZE).fill(false), 2: Array(GRID_SIZE).fill(false) },
      giver: 1, // joueur qui donne l'indice (= clé utilisée pour évaluer les cartes)
      turn: 1,
      totalTokens: d.tokens,
      tokens: d.tokens, // jetons de tours restants
      suddenDeath: false,
      over: null, // null | 'win' | 'lose'
      reason: null // 'assassin' | 'suddenDeath'
    };
    save();
  }

  const save = () => writeJSON(STORAGE_KEY, state);

  function load() {
    const s = readJSON(STORAGE_KEY);
    const ok = s && s.words && s.words.length === GRID_SIZE &&
      s.keys && s.keys[1] && s.keys[1].length === GRID_SIZE &&
      s.keys[2] && s.keys[2].length === GRID_SIZE &&
      s.status && s.status.length === GRID_SIZE &&
      typeof s.tokens === 'number' &&
      s.marks && s.marks[1] && s.marks[1].length === GRID_SIZE &&
      s.marks[2] && s.marks[2].length === GRID_SIZE;
    if (!ok) return null;
    // Parties enregistrées avant l'ajout des niveaux de difficulté
    s.totalTokens = s.totalTokens || 9;
    s.assassins = s.assassins || 3;
    s.difficulty = DIFFICULTIES[s.difficulty] ? s.difficulty : 'normal';
    s.proximity = PROXIMITIES[s.proximity] ? s.proximity : 'random';
    if (!Array.isArray(s.themes)) s.themes = s.theme && THEMES[s.theme] ? [s.theme] : themeIds();
    return s;
  }

  /* ======================================================================
     Statistiques
     ====================================================================== */

  let stats = (() => {
    const s = readJSON(STATS_KEY);
    return s && Array.isArray(s.games) ? s : { games: [] };
  })();
  const saveStats = () => writeJSON(STATS_KEY, stats);

  function recordGame() {
    stats.games.push({
      ts: Date.now(),
      themes: state.themes.slice(),
      difficulty: state.difficulty,
      result: state.over,
      reason: state.reason,
      turns: state.turn,
      sudden: !!state.suddenDeath,
      found: foundCount()
    });
    if (stats.games.length > MAX_GAMES) stats.games = stats.games.slice(-MAX_GAMES);
    saveStats();
  }

  function aggregate(games) {
    const wins = games.filter((g) => g.result === 'win');
    const avg = (arr, f) => (arr.length ? arr.reduce((a, x) => a + f(x), 0) / arr.length : null);
    return {
      games: games.length,
      wins: wins.length,
      losses: games.length - wins.length,
      rate: games.length ? wins.length / games.length : null,
      avgTurns: avg(wins, (g) => g.turns),
      best: wins.length ? Math.min(...wins.map((g) => g.turns)) : null,
      avgFound: avg(games, (g) => g.found),
      suddenWins: wins.filter((g) => g.sudden).length
    };
  }

  const fmt = (x) => (x == null ? '–' : (Math.round(x * 10) / 10).toString().replace('.', ','));
  const pct = (x) => (x == null ? '–' : Math.round(x * 100) + ' %');

  function statsTable(title, rows) {
    const block = h('section', 'stats-block');
    block.appendChild(h('h3', '', title));
    const table = h('table', 'stats');
    const head = h('tr');
    ['', 'Parties', 'V', 'D', 'Tours moy.'].forEach((t) => head.appendChild(h('th', '', t)));
    head.firstChild.scope = 'col';
    table.appendChild(h('thead')).appendChild(head);
    const tbody = h('tbody');
    rows.forEach(([label, a]) => {
      const tr = h('tr');
      [label, a.games, a.wins, a.losses, fmt(a.avgTurns)].forEach((v) => tr.appendChild(h('td', '', String(v))));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    block.appendChild(table);
    return block;
  }

  function renderStats() {
    const body = els.statsBody;
    body.textContent = '';
    const all = stats.games;
    els.btnStatsReset.hidden = !all.length;
    if (!all.length) {
      body.appendChild(h('p', 'empty',
        'Aucune partie terminée pour l’instant. Les statistiques apparaîtront ici après votre première victoire ou défaite.'));
      return;
    }

    const g = aggregate(all);
    const tiles = h('div', 'tiles');
    [[g.games, 'Parties'], [g.wins, 'Victoires'], [pct(g.rate), 'Taux de victoire'], [fmt(g.avgTurns), 'Tours moyens (victoires)']]
      .forEach(([v, label]) => {
        const t = h('div', 'tile');
        t.appendChild(h('strong', '', String(v)));
        t.appendChild(h('span', '', label));
        tiles.appendChild(t);
      });
    body.appendChild(tiles);

    const facts = h('ul', 'facts');
    const fact = (label, value) => {
      const li = h('li');
      li.append(label + ' : ');
      li.appendChild(h('b', '', value));
      facts.appendChild(li);
    };
    fact('Défaites', String(g.losses));
    fact('Meilleure victoire', g.best == null ? '–' : g.best + ' tour' + (g.best > 1 ? 's' : ''));
    fact('Victoires en mort subite', String(g.suddenWins));
    fact('Agents trouvés en moyenne', fmt(g.avgFound) + ' / ' + TARGET);
    body.appendChild(facts);

    // Par thème (une partie multi-thèmes compte pour chacun de ses thèmes)
    const ids = [...new Set(all.flatMap((x) => x.themes || []))];
    const byTheme = ids
      .map((id) => [THEMES[id] ? THEMES[id].label : id, aggregate(all.filter((x) => (x.themes || []).includes(id)))])
      .sort((a, b) => b[1].games - a[1].games);
    body.appendChild(statsTable('Par thème', byTheme));

    const byDiff = Object.entries(DIFFICULTIES)
      .map(([id, d]) => [d.label, aggregate(all.filter((x) => x.difficulty === id))])
      .filter(([, a]) => a.games > 0);
    body.appendChild(statsTable('Par difficulté', byDiff));

    body.appendChild(h('p', 'note',
      'Une partie jouée avec plusieurs thèmes est comptée dans chacun d’eux. « Tours moyens » ne porte que sur les victoires.'));
  }

  /* ======================================================================
     Rendu
     ====================================================================== */

  function cardLabel(i) {
    const w = state.words[i];
    if (state.status[i] === 'green') return w + ', agent trouvé';
    if (state.status[i] === 'black') return w + ', assassin';
    const by = [1, 2].filter((p) => state.marks[p][i]);
    if (by.length === 2) return w + ', passant innocent pour les deux joueurs';
    if (by.length === 1) return w + ', passant innocent pour le Joueur ' + by[0];
    return w;
  }

  function render() {
    const sd = !!state.suddenDeath;
    const g = state.giver;
    els.app.classList.toggle('sudden', sd);

    // En-tête
    if (sd) {
      els.turnCount.textContent = 'Mort subite';
      els.turnLabel.innerHTML =
        '<span class="p' + other(g) + '">Joueur ' + other(g) + '</span> devine · sans indice';
    } else {
      els.turnCount.textContent = 'Tour ' + state.turn + ' / ' + state.totalTokens;
      els.turnLabel.innerHTML =
        '<span class="p' + g + '">Joueur ' + g + '</span> donne l’indice · ' +
        '<span class="p' + other(g) + '">Joueur ' + other(g) + '</span> devine';
    }
    const found = foundCount();
    els.score.textContent = found;
    els.bar.style.width = (found / TARGET) * 100 + '%';
    els.configSummary.textContent =
      themeSummary(state.themes) + ' · ' + DIFFICULTIES[state.difficulty].label + ' (' + state.assassins + ' assassins, ' + state.totalTokens + ' tours)';

    // Jetons de tours
    els.tokens.textContent = '';
    for (let t = 0; t < state.totalTokens; t++) {
      els.tokens.appendChild(h('i', 'token' + (t < state.tokens ? '' : ' used')));
    }
    els.tokensLabel.textContent = sd ? 'Plus de tours' : 'Tours restants';
    els.tokens.setAttribute('aria-label',
      sd ? 'Aucun tour restant, mort subite' : state.tokens + ' tour' + (state.tokens > 1 ? 's' : '') + ' restant' + (state.tokens > 1 ? 's' : ''));

    // Plateau (on conserve le focus clavier sur la même carte)
    const ae = document.activeElement;
    const focusIdx = ae && ae.classList && ae.classList.contains('card') && ae.dataset ? Number(ae.dataset.index) : -1;

    els.board.textContent = '';
    state.words.forEach((word, i) => {
      const b = h('button', 'card');
      b.type = 'button';
      fitFont(b, word);
      const st = state.status[i];
      const m1 = state.marks[1][i];
      const m2 = state.marks[2][i];
      if (st === 'green' || st === 'black') {
        b.classList.add(st);
      } else if (m1 || m2) {
        b.classList.add('neutral');
        if (m1 && m2) b.classList.add('dead');
      }
      b.appendChild(document.createTextNode(word));
      if (st === 'hidden') {
        [1, 2].forEach((p) => {
          if (state.marks[p][i]) b.appendChild(h('i', 'mk p' + p));
        });
      }
      if (fx.deal) { b.classList.add('deal'); b.style.setProperty('--i', i); }
      if (i === fx.reveal) b.classList.add(fx.kind);
      b.dataset.index = i;
      b.disabled = !!state.over || isDead(i);
      b.setAttribute('aria-label', cardLabel(i));
      els.board.appendChild(b);
    });
    fx.reveal = -1;
    fx.deal = false;
    if (focusIdx >= 0) {
      const el = els.board.children[focusIdx];
      if (el && !el.disabled && el.focus) el.focus({ preventScroll: true });
    }

    // Bouton d'action : fin du tour, ou changement de joueur en mort subite
    if (sd) {
      els.btnEnd.textContent = 'Changer de joueur';
      els.btnEnd.disabled = !!state.over || remaining(other(g)) === 0;
    } else {
      els.btnEnd.textContent = 'Fin du tour';
      els.btnEnd.disabled = !!state.over;
    }
  }

  function showResult() {
    if (!state.over) { els.result.hidden = true; return; }
    const win = state.over === 'win';
    const n = foundCount();
    const plural = n > 1 ? 's' : '';
    els.resultIcon.className = 'result-icon ' + (win ? 'win' : 'lose');
    els.resultTitle.textContent = win ? 'Victoire !' : 'Défaite';
    if (win) {
      els.resultText.textContent = state.suddenDeath
        ? 'Les ' + TARGET + ' agents sont trouvés, en mort subite.'
        : 'Les ' + TARGET + ' agents sont trouvés en ' + state.turn + ' tour' + (state.turn > 1 ? 's' : '') + '.';
    } else if (state.reason === 'suddenDeath') {
      els.resultText.textContent = 'Mort subite : un passant innocent a été touché. ' + n + ' agent' + plural + ' trouvé' + plural + ' sur ' + TARGET + '.';
    } else {
      els.resultText.textContent = 'Un assassin a été touché. ' + n + ' agent' + plural + ' trouvé' + plural + ' sur ' + TARGET + '.';
    }
    els.resultMeta.textContent = DIFFICULTIES[state.difficulty].label + ' · ' + themeLabels(state.themes).join(', ');
    els.result.hidden = false;
  }

  /* ======================================================================
     Jeu
     ====================================================================== */

  function finish(over, reason, sound) {
    state.over = over;
    state.reason = reason || null;
    clearTimeout(toastTimer);
    els.toast.classList.remove('show'); // pas de message qui traîne sur l'écran de résultat
    recordGame();
    save();
    render();
    Sound.play(sound || (over === 'win' ? 'win' : 'lose'));
    buzz(over === 'win' ? [40, 40, 40, 40, 120] : [80, 60, 200]);
    // Laisse le temps de voir la carte se retourner avant d'afficher le résultat
    setTimeout(showResult, settings.anim ? 750 : 0);
  }

  // Fin d'un tour : un jeton retourne dans la boîte. Plus de jeton = mort subite.
  function endTurn(quiet) {
    state.tokens = Math.max(0, state.tokens - 1);
    let entered = false;
    if (state.tokens === 0) {
      state.suddenDeath = true;
      entered = true;
      toast('Plus de tours : mort subite !');
    } else {
      state.turn += 1;
    }
    // Le joueur suivant donne l'indice, sauf s'il n'a plus d'agents à faire trouver
    const next = other(state.giver);
    if (remaining(next) > 0) state.giver = next;
    save();
    render();
    if (entered) { Sound.play('sudden'); buzz([40, 40, 40]); }
    else if (!quiet) Sound.play('turn');
  }

  function guess(i) {
    if (state.over || isDead(i)) return;

    // La carte est évaluée avec la clé du joueur qui a donné l'indice
    const k = state.giver;
    const type = state.keys[k][i];

    // Assassin : défaite immédiate
    if (type === 'b') {
      state.status[i] = 'black';
      fx.reveal = i; fx.kind = 'flip';
      finish('lose', 'assassin', 'assassin');
      return;
    }

    // Agent : on continue
    if (type === 'g') {
      state.status[i] = 'green';
      fx.reveal = i; fx.kind = 'flip';
      if (foundCount() >= TARGET) {
        finish('win', null, 'win');
        return;
      }
      // En mort subite, si cette clé n'a plus d'agents, l'autre joueur prend le relais
      if (state.suddenDeath && remaining(k) === 0) state.giver = other(k);
      save();
      render();
      Sound.play('agent');
      buzz(30);
      toast(state.suddenDeath ? 'Agent trouvé ! Continuez.' : 'Agent trouvé ! Vous pouvez continuer.');
      return;
    }

    // Passant innocent pour cette clé : la carte est déjà écartée pour ce joueur
    if (state.marks[k][i]) {
      const btn = els.board.querySelector('[data-index="' + i + '"]');
      if (btn) {
        btn.classList.add('shake');
        btn.addEventListener('animationend', () => btn.classList.remove('shake'), { once: true });
      }
      toast('Le Joueur ' + k + ' l’a déjà écartée.');
      return;
    }

    state.marks[k][i] = true;
    fx.reveal = i; fx.kind = 'pop';
    if (state.suddenDeath) {
      // Mort subite : la moindre erreur est fatale
      finish('lose', 'suddenDeath', 'lose');
      return;
    }
    Sound.play('neutral');
    buzz(60);
    toast('Passant innocent — fin du tour.');
    endTurn(true);
  }

  /* ======================================================================
     Vue secrète
     ====================================================================== */

  function openSecret(p) {
    secretPlayer = p;
    els.secret.className = 'overlay secret-overlay p' + p;
    els.secretTitle.textContent = 'Joueur ' + p;
    els.secretCover.hidden = false;
    els.secretContent.hidden = true;
    els.secretBoard.textContent = '';
    els.btnReveal.textContent = 'Révéler la vue du Joueur ' + p;
    els.secret.hidden = false;
    els.btnReveal.focus();
  }

  function revealSecret() {
    const key = state.keys[secretPlayer];
    els.secretBoard.textContent = '';
    state.words.forEach((word, i) => {
      const c = h('div', 'cell', word);
      fitFont(c, word);
      if (key[i] === 'g') c.classList.add('g');
      if (key[i] === 'b') c.classList.add('b');
      if (state.status[i] === 'green') c.classList.add('done');
      els.secretBoard.appendChild(c);
    });
    const nG = key.filter((t) => t === 'g').length;
    const nB = key.filter((t) => t === 'b').length;
    els.legendG.textContent = nG + ' à trouver';
    els.legendB.textContent = nB + ' mortelle' + (nB > 1 ? 's' : '');
    els.secretCover.hidden = true;
    els.secretContent.hidden = false;
  }

  function hideSecret() {
    // On vide le DOM pour qu'aucune information ne reste affichée
    els.secretBoard.textContent = '';
    els.secretContent.hidden = true;
    els.secret.hidden = true;
  }

  /* ======================================================================
     Partage du résultat (texte et image)
     ====================================================================== */

  function shareHeader() {
    const win = state.over === 'win';
    const n = foundCount();
    let when;
    if (state.suddenDeath) when = 'mort subite';
    else when = (win ? '' : 'tour ') + state.turn + (win ? ' tour' + (state.turn > 1 ? 's' : '') : '');
    return {
      title: 'Duo Code · ' + (win ? 'Victoire 🎉' : 'Défaite 💀'),
      line: n + '/' + TARGET + ' agents · ' + when + ' · ' + DIFFICULTIES[state.difficulty].label,
      themes: 'Thèmes : ' + themeLabels(state.themes).join(', ')
    };
  }

  function buildShareText() {
    const hd = shareHeader();
    const rows = [];
    for (let r = 0; r < 5; r++) {
      let row = '';
      for (let c = 0; c < 5; c++) {
        const i = r * 5 + c;
        if (state.status[i] === 'green') row += '🟩';
        else if (state.status[i] === 'black') row += '⬛';
        else if (state.marks[1][i] || state.marks[2][i]) row += '🟨';
        else row += '⬜';
      }
      rows.push(row);
    }
    return [hd.title, hd.line, hd.themes, '', ...rows].join('\n');
  }

  function roundRect(x, px, py, w, hgt, r) {
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + hgt, r);
    x.arcTo(px + w, py + hgt, px, py + hgt, r);
    x.arcTo(px, py + hgt, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }

  function fitText(x, text, maxW, size, weight, min) {
    let s = size;
    x.font = weight + ' ' + s + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    while (x.measureText(text).width > maxW && s > min) {
      s -= 1;
      x.font = weight + ' ' + s + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    }
    return s;
  }

  function drawShareImage() {
    const W = 1080;
    const H = 1460;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const x = cv.getContext('2d');
    const cb = !!settings.colorblind;
    const col = {
      bg: '#f4f1ea', ink: '#1d2420', muted: '#666c64', line: '#e1dccf',
      green: cb ? '#0072b2' : '#2e9e5b', black: '#17191a', neutral: '#d8ceb5', neutralInk: '#7a725e'
    };
    const win = state.over === 'win';
    const hd = shareHeader();
    const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

    x.fillStyle = col.bg;
    x.fillRect(0, 0, W, H);
    x.textAlign = 'center';
    x.textBaseline = 'alphabetic';

    x.fillStyle = col.muted;
    x.font = '700 34px ' + FONT;
    if ('letterSpacing' in x) x.letterSpacing = '8px';
    x.fillText('DUO CODE', W / 2, 110);
    if ('letterSpacing' in x) x.letterSpacing = '0px';

    x.fillStyle = win ? col.green : col.black;
    x.font = '800 130px ' + FONT;
    x.fillText(win ? 'Victoire !' : 'Défaite', W / 2, 270);

    x.fillStyle = col.ink;
    fitText(x, hd.line, W - 140, 46, 600, 24);
    x.fillText(hd.line, W / 2, 345);

    x.fillStyle = col.muted;
    fitText(x, hd.themes, W - 140, 36, 500, 20);
    x.fillText(hd.themes, W / 2, 405);

    // Grille
    const cell = 164;
    const gap = 12;
    const gx = (W - (5 * cell + 4 * gap)) / 2;
    const gy = 450;
    state.words.forEach((word, i) => {
      const px = gx + (i % 5) * (cell + gap);
      const py = gy + Math.floor(i / 5) * (cell + gap);
      const st = state.status[i];
      const marked = state.marks[1][i] || state.marks[2][i];
      let bg = '#ffffff';
      let ink = col.muted;
      let border = col.line;
      if (st === 'green') { bg = col.green; ink = '#fff'; border = col.green; }
      else if (st === 'black') { bg = col.black; ink = '#fff'; border = col.black; }
      else if (marked) { bg = col.neutral; ink = col.neutralInk; border = col.neutral; }
      roundRect(x, px, py, cell, cell, 18);
      x.fillStyle = bg;
      x.fill();
      x.lineWidth = 2;
      x.strokeStyle = border;
      x.stroke();
      x.fillStyle = ink;
      x.textBaseline = 'middle';
      fitText(x, word, cell - 18, 28, 700, 11);
      x.fillText(word, px + cell / 2, py + cell / 2 + 1);
      x.textBaseline = 'alphabetic';
      if (cb && (st === 'green' || st === 'black')) {
        x.font = '800 26px ' + FONT;
        x.textAlign = 'left';
        x.fillText(st === 'green' ? '✓' : '✕', px + 12, py + 32);
        x.textAlign = 'center';
      }
    });

    x.fillStyle = col.muted;
    x.font = '500 30px ' + FONT;
    x.fillText(new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), W / 2, H - 50);
    return cv;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) { /* repli ci-dessous */ }
    try {
      const ta = h('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  async function shareResultText() {
    if (!state.over) return;
    const text = buildShareText();
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    toast((await copyText(text)) ? 'Résultat copié dans le presse-papiers' : 'Copie impossible sur cet appareil');
  }

  async function shareResultImage() {
    if (!state.over) return;
    const blob = await new Promise((resolve) => drawShareImage().toBlob(resolve, 'image/png'));
    if (!blob) { toast('Création de l’image impossible'); return; }
    const file = new File([blob], 'duo-code-resultat.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: shareHeader().title });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    // Repli : téléchargement du fichier
    const url = URL.createObjectURL(blob);
    const a = h('a');
    a.href = url;
    a.download = 'duo-code-resultat.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Image enregistrée');
  }

  /* ======================================================================
     Fenêtres (réglages, statistiques)
     ====================================================================== */

  let lastFocus = null;
  function openDialog(el) {
    lastFocus = document.activeElement;
    el.hidden = false;
    const f = el.querySelector('button');
    if (f && f.focus) f.focus({ preventScroll: true });
  }
  function closeDialog(el) {
    el.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  function makeSeg(container, options, current, onPick) {
    container.textContent = '';
    container.setAttribute('role', 'radiogroup');
    options.forEach(([id, label]) => {
      const b = h('button', '', label);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(id === current));
      b.addEventListener('click', () => onPick(id));
      container.appendChild(b);
    });
  }

  function refreshSettingsUI() {
    const sel = new Set(validThemes(settings.themes));

    // Thèmes
    els.chips.textContent = '';
    Object.entries(THEMES).forEach(([id, t]) => {
      const b = h('button', 'chip');
      b.type = 'button';
      b.dataset.id = id;
      b.setAttribute('aria-pressed', String(sel.has(id)));
      b.appendChild(h('span', '', t.label));
      b.appendChild(h('span', 'n', String(t.words.length)));
      els.chips.appendChild(b);
    });

    const ids = [...sel];
    const n = ids.length ? poolSize(ids) : 0;
    let ok = true;
    if (!ids.length) { els.themeHint.textContent = 'Choisissez au moins un thème.'; ok = false; }
    else if (n < GRID_SIZE) { els.themeHint.textContent = 'Seulement ' + n + ' mots : il en faut au moins ' + GRID_SIZE + '.'; ok = false; }
    else els.themeHint.textContent = ids.length + ' thème' + (ids.length > 1 ? 's' : '') + ' · ' + n + ' mots disponibles.';
    els.themeHint.classList.toggle('warn', !ok);
    els.btnApplyNew.disabled = !ok;

    // Difficulté
    makeSeg(els.segDifficulty, Object.entries(DIFFICULTIES).map(([id, d]) => [id, d.label]), settings.difficulty, (id) => {
      settings.difficulty = id; saveSettings(); refreshSettingsUI();
    });
    const d = DIFFICULTIES[settings.difficulty] || DIFFICULTIES.normal;
    els.difficultyHint.textContent = d.assassins + ' assassins par clé · ' + d.tokens + ' tours avant la mort subite.';

    // Proximité des mots
    makeSeg(els.segProximity, Object.entries(PROXIMITIES).map(([id, p]) => [id, p.label]), settings.proximity, (id) => {
      settings.proximity = id; saveSettings(); refreshSettingsUI();
    });
    els.proximityHint.textContent = (PROXIMITIES[settings.proximity] || PROXIMITIES.random).hint +
      (ids.length < 2 && settings.proximity !== 'random' ? ' Sans effet avec un seul thème.' : '');

    // Affichage
    makeSeg(els.segAppearance, [['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']], settings.appearance, (id) => {
      settings.appearance = id; saveSettings(); applyDisplay(); refreshSettingsUI();
    });
    makeSeg(els.segLayout, [['auto', 'Auto'], ['portrait', 'Portrait'], ['landscape', 'Paysage']], settings.layout, (id) => {
      settings.layout = id; saveSettings(); applyDisplay(); refreshSettingsUI();
    });
    els.optColorblind.checked = !!settings.colorblind;
    els.optFlip.checked = !!settings.flip;
    els.optAnim.checked = !!settings.anim;
    els.optSound.checked = !!settings.sound;
    els.optVibrate.checked = !!settings.vibrate;
    els.optVolume.value = Math.round(settings.volume * 100);
    els.optVolume.disabled = !settings.sound;
  }

  function requestNewGame() {
    const inProgress = !state.over && (state.tokens < state.totalTokens || state.status.some((s) => s !== 'hidden'));
    if (inProgress && !window.confirm('Abandonner la partie en cours ?')) return false;
    restart();
    return true;
  }

  function restart() {
    if (!themeIds().length) { toast('Liste de mots indisponible.'); return; }
    hideSecret();
    newGame();
    fx.deal = true;
    els.result.hidden = true;
    render();
  }

  /* ======================================================================
     Événements
     ====================================================================== */

  els.board.addEventListener('click', (e) => {
    const btn = e.target.closest('.card');
    if (!btn || btn.disabled) return;
    guess(Number(btn.dataset.index));
  });

  els.btnP1.addEventListener('click', () => openSecret(1));
  els.btnP2.addEventListener('click', () => openSecret(2));
  els.btnReveal.addEventListener('click', revealSecret);
  els.btnHide.addEventListener('click', hideSecret);

  els.btnEnd.addEventListener('click', () => {
    if (state.over) return;
    if (state.suddenDeath) {
      // Mort subite : on choisit quel joueur devine (l'autre sert de clé)
      if (remaining(other(state.giver)) > 0) {
        state.giver = other(state.giver);
        save();
        render();
        Sound.play('tap');
      }
      return;
    }
    endTurn();
  });

  els.btnNew.addEventListener('click', requestNewGame);
  els.btnReplay.addEventListener('click', restart);
  els.btnViewBoard.addEventListener('click', () => { els.result.hidden = true; });
  els.btnShareText.addEventListener('click', shareResultText);
  els.btnShareImage.addEventListener('click', shareResultImage);

  // Barre d'icônes
  els.btnFlip.addEventListener('click', () => {
    settings.flip = !settings.flip;
    saveSettings();
    applyDisplay();
    Sound.play('tap');
  });
  els.btnSettings.addEventListener('click', () => { refreshSettingsUI(); openDialog(els.settings); });
  els.btnConfig.addEventListener('click', () => { refreshSettingsUI(); openDialog(els.settings); });
  els.btnStats.addEventListener('click', () => { renderStats(); openDialog(els.stats); });
  els.btnSettingsClose.addEventListener('click', () => closeDialog(els.settings));
  els.btnStatsClose.addEventListener('click', () => closeDialog(els.stats));
  [els.settings, els.stats].forEach((ov) => {
    ov.addEventListener('click', (e) => { if (e.target === ov) closeDialog(ov); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!els.settings.hidden) closeDialog(els.settings);
    else if (!els.stats.hidden) closeDialog(els.stats);
  });

  // Réglages : thèmes
  els.chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const set = new Set(validThemes(settings.themes));
    if (set.has(chip.dataset.id)) set.delete(chip.dataset.id); else set.add(chip.dataset.id);
    settings.themes = themeIds().filter((id) => set.has(id));
    saveSettings();
    refreshSettingsUI();
    const again = els.chips.querySelector('[data-id="' + chip.dataset.id + '"]');
    if (again && again.focus) again.focus({ preventScroll: true });
  });
  els.btnThemesAll.addEventListener('click', () => { settings.themes = themeIds(); saveSettings(); refreshSettingsUI(); });
  els.btnThemesNone.addEventListener('click', () => { settings.themes = []; saveSettings(); refreshSettingsUI(); });
  els.btnApplyNew.addEventListener('click', () => {
    if (requestNewGame()) closeDialog(els.settings);
  });

  // Réglages : affichage, sons, vibrations
  const bindSwitch = (input, key, after) => {
    input.addEventListener('change', () => {
      settings[key] = input.checked;
      saveSettings();
      applyDisplay();
      if (after) after();
    });
  };
  bindSwitch(els.optColorblind, 'colorblind');
  bindSwitch(els.optFlip, 'flip');
  bindSwitch(els.optAnim, 'anim');
  bindSwitch(els.optSound, 'sound', () => { refreshSettingsUI(); Sound.play('agent'); });
  bindSwitch(els.optVibrate, 'vibrate', () => buzz(40));
  els.optVolume.addEventListener('input', () => {
    settings.volume = Number(els.optVolume.value) / 100;
    saveSettings();
  });
  els.optVolume.addEventListener('change', () => Sound.play('agent'));

  els.btnStatsReset.addEventListener('click', () => {
    if (!window.confirm('Effacer toutes les statistiques ?')) return;
    stats = { games: [] };
    saveStats();
    renderStats();
  });

  // Si l'app passe en arrière-plan, on masque la vue secrète
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !els.secret.hidden) hideSecret();
  });

  /* ======================================================================
     Démarrage
     ====================================================================== */

  async function init() {
    applyDisplay();
    try {
      THEMES = await loadThemes();
    } catch (e) {
      console.error(e);
    }

    const ids = themeIds();
    // Premier lancement (ou ancienne version) : thème choisi précédemment, sinon le premier
    if (!Array.isArray(settings.themes)) {
      let legacy = null;
      try { legacy = localStorage.getItem(LEGACY_THEME_KEY); } catch (e) { /* ignoré */ }
      if (legacy === 'mix') settings.themes = ids;
      else if (legacy && THEMES[legacy]) settings.themes = [legacy];
      else settings.themes = ids.slice(0, 1);
      saveSettings();
    }

    state = load();
    if (!state) {
      if (!ids.length) {
        els.turnLabel.textContent = 'Impossible de charger words.json';
        return;
      }
      newGame();
      fx.deal = true;
    }
    render();
    showResult();
  }

  init();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne indisponible */ });
    });
  }
})();