(() => {
  'use strict';

  const STORAGE_KEY = 'duo-code-state-v1';
  const GRID_SIZE = 25;
  const TARGET = 15;

  const WORDS = [
    'ABEILLE','AIGLE','AIGUILLE','ANCRE','ANGE','ARBRE','ARGENT','ARMURE','ASSIETTE','ATLAS',
    'AVION','BALEINE','BALLON','BANQUE','BARRE','BATEAU','BEURRE','BIBLIOTHÈQUE','BOMBE','BOUCHE',
    'BOUGIE','BOUTEILLE','BRANCHE','BRIQUE','BUREAU','CABANE','CADRE','CAFÉ','CAMP','CANAL',
    'CANON','CARTE','CASQUE','CHAÎNE','CHAMPION','CHÂTEAU','CHAT','CHEF','CHEVAL','CIEL',
    'CINÉMA','CIRQUE','CLEF','CLOCHE','COEUR','COFFRE','COLLIER','COURONNE','COUTEAU','CRAYON',
    'CROIX','CUISINE','DÉ','DENT','DIAMANT','DRAGON','ÉCOLE','ÉCRAN','ÉLÉPHANT','ÉPÉE',
    'ÉTOILE','FANTÔME','FÉE','FENÊTRE','FEUILLE','FILET','FLÈCHE','FLEUR','FORÊT','FOUR',
    'FROMAGE','GANT','GÂTEAU','GLACE','GOMME','GRILLE','GUITARE','HÔPITAL','HÔTEL','HUILE',
    'ÎLE','JARDIN','JOKER','JUPE','LAC','LAIT','LAMPE','LANGUE','LAPIN','LETTRE',
    'LIMONADE','LION','LIVRE','LOUP','LUNE','LUNETTES','MAGICIEN','MAIN','MARCHÉ','MASQUE',
    'MÉDECIN','MIEL','MINE','MIROIR','MOMIE','MONTAGNE','MONTRE','MOTEUR','MOUCHE','MUSÉE',
    'NAGE','NEIGE','NOEUD','NUIT','OEIL','OEUF','OMBRE','ONDE','OPÉRA','ORAGE',
    'ORGUE','OURS','PAIN','PALAIS','PANTALON','PAPIER','PARACHUTE','PARC','PASSE','PATTE',
    'PEINTURE','PERLE','PHARE','PIANO','PIED','PIERRE','PILE','PINCE','PIRATE','PISCINE',
    'PLAGE','PLANÈTE','PLOMB','PLUME','POISSON','POMME','PONT','PORTE','POSTE','POUDRE',
    'PRISE','PRINCE','PUCE','PYRAMIDE','RADIO','RAISIN','RAT','REINE','RÈGLE','ROBE',
    'ROBOT','ROCHE','ROI','ROSE','ROUE','SABLE','SAC','SAISON','SALLE','SATELLITE',
    'SERPENT','SINGE','SOLEIL','SORCIÈRE','SOURIS','STADE','STATUE','TABLE','TAMBOUR','TÊTE',
    'THÉÂTRE','TIGRE','TIMBRE','TOIT','TONNERRE','TORTUE','TOUR','TRAIN','TRÉSOR','TROMPETTE',
    'VAGUE','VAISSEAU','VENT','VER','VERRE','VILLE','VIN','VIOLON','VOILE','VOLCAN',
    'ZÈBRE','ZÉRO'
  ];

  // Clé Duet : paires [clé Joueur 1, clé Joueur 2]
  // g = agent à trouver (vert), n = passant innocent (neutre), b = assassin (noir)
  // Joueur 1 : 9 verts, 3 noirs, 13 neutres. Joueur 2 : idem.
  // Verts uniques = 9 + 9 - 3 communs = 15.
  const rep = (a, b, n) => Array.from({ length: n }, () => [a, b]);
  const LAYOUT = [
    ...rep('g', 'g', 3),
    ...rep('g', 'n', 5),
    ...rep('g', 'b', 1),
    ...rep('n', 'g', 5),
    ...rep('b', 'g', 1),
    ...rep('b', 'b', 1),
    ...rep('b', 'n', 1),
    ...rep('n', 'b', 1),
    ...rep('n', 'n', 7)
  ];

  const $ = (id) => document.getElementById(id);
  const els = {
    board: $('board'),
    score: $('score'),
    bar: $('progress-bar'),
    turnCount: $('turn-count'),
    turnLabel: $('turn-label'),
    btnP1: $('btn-p1'),
    btnP2: $('btn-p2'),
    btnEnd: $('btn-end-turn'),
    btnNew: $('btn-new'),
    secret: $('secret'),
    secretTitle: $('secret-title'),
    secretCover: $('secret-cover'),
    secretContent: $('secret-content'),
    secretBoard: $('secret-board'),
    btnReveal: $('btn-reveal'),
    btnHide: $('btn-hide'),
    result: $('result'),
    resultIcon: $('result-icon'),
    resultTitle: $('result-title'),
    resultText: $('result-text'),
    btnReplay: $('btn-replay'),
    btnViewBoard: $('btn-view-board'),
    toast: $('toast')
  };

  let state = null;
  let secretPlayer = 1;
  let toastTimer = null;

  /* ---------- Utilitaires ---------- */

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1800);
  }

  function vibrate(p) {
    if (navigator.vibrate) navigator.vibrate(p);
  }

  const other = (p) => (p === 1 ? 2 : 1);
  const foundCount = () => state.status.filter((s) => s === 'green').length;

  /* ---------- État ---------- */

  function newGame() {
    const pairs = shuffle(LAYOUT);
    state = {
      words: shuffle(WORDS).slice(0, GRID_SIZE),
      keys: { 1: pairs.map((p) => p[0]), 2: pairs.map((p) => p[1]) },
      status: Array(GRID_SIZE).fill('hidden'), // hidden | green | neutral | black
      giver: 1,
      turn: 1,
      over: null // null | 'win' | 'lose'
    };
    save();
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignoré */ }
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const ok = s && s.words && s.words.length === GRID_SIZE &&
        s.keys && s.keys[1] && s.keys[1].length === GRID_SIZE &&
        s.keys[2] && s.keys[2].length === GRID_SIZE &&
        s.status && s.status.length === GRID_SIZE;
      return ok ? s : null;
    } catch (e) {
      return null;
    }
  }

  /* ---------- Rendu ---------- */

  function render() {
    // En-tête
    els.turnCount.textContent = 'Tour ' + state.turn;
    const g = state.giver;
    els.turnLabel.innerHTML =
      '<span class="p' + g + '">Joueur ' + g + '</span> donne l\u2019indice · ' +
      '<span class="p' + other(g) + '">Joueur ' + other(g) + '</span> devine';
    const found = foundCount();
    els.score.textContent = found;
    els.bar.style.width = (found / TARGET) * 100 + '%';

    // Plateau
    els.board.textContent = '';
    state.words.forEach((word, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'card';
      if (word.length > 8) b.classList.add('long');
      const st = state.status[i];
      if (st !== 'hidden') b.classList.add(st);
      b.textContent = word;
      b.dataset.index = i;
      b.disabled = !!state.over || st === 'green' || st === 'black';
      b.setAttribute('role', 'gridcell');
      els.board.appendChild(b);
    });

    els.btnEnd.disabled = !!state.over;
    els.btnEnd.style.opacity = state.over ? .4 : 1;
  }

  function showResult() {
    if (!state.over) { els.result.hidden = true; return; }
    const win = state.over === 'win';
    els.resultIcon.className = 'result-icon ' + (win ? 'win' : 'lose');
    els.resultTitle.textContent = win ? 'Victoire !' : 'Défaite';
    els.resultText.textContent = win
      ? 'Vous avez trouvé les ' + TARGET + ' agents en ' + state.turn + ' tour' + (state.turn > 1 ? 's' : '') + '.'
      : 'Un assassin a été touché. Vous aviez trouvé ' + foundCount() + ' agent' + (foundCount() > 1 ? 's' : '') + ' sur ' + TARGET + '.';
    els.result.hidden = false;
  }

  /* ---------- Jeu ---------- */

  function endTurn() {
    state.giver = other(state.giver);
    state.turn += 1;
    save();
    render();
  }

  function guess(i) {
    if (state.over) return;
    const status = state.status[i];
    if (status === 'green' || status === 'black') return;

    // La carte est évaluée avec la clé du joueur qui a donné l'indice
    const type = state.keys[state.giver][i];

    if (type === 'b') {
      state.status[i] = 'black';
      state.over = 'lose';
      vibrate([80, 60, 200]);
      save();
      render();
      showResult();
      return;
    }

    if (type === 'g') {
      state.status[i] = 'green';
      vibrate(30);
      if (foundCount() >= TARGET) {
        state.over = 'win';
        save();
        render();
        showResult();
        return;
      }
      save();
      render();
      toast('Agent trouvé ! Vous pouvez continuer.');
      return;
    }

    // Passant innocent
    if (status === 'neutral') {
      const btn = els.board.querySelector('[data-index="' + i + '"]');
      if (btn) { btn.classList.add('shake'); }
      toast('Déjà joué : passant innocent.');
      return;
    }
    state.status[i] = 'neutral';
    vibrate(60);
    toast('Passant innocent — fin du tour.');
    endTurn();
  }

  /* ---------- Vue secrète ---------- */

  function openSecret(p) {
    secretPlayer = p;
    els.secret.className = 'overlay secret-overlay p' + p;
    els.secretTitle.textContent = 'Joueur ' + p;
    els.secretCover.hidden = false;
    els.secretContent.hidden = true;
    els.secretBoard.textContent = '';
    els.btnReveal.textContent = 'Révéler la vue du Joueur ' + p;
    els.secret.hidden = false;
  }

  function revealSecret() {
    const key = state.keys[secretPlayer];
    els.secretBoard.textContent = '';
    state.words.forEach((word, i) => {
      const c = document.createElement('div');
      c.className = 'cell';
      if (word.length > 8) c.classList.add('long');
      if (key[i] === 'g') c.classList.add('g');
      if (key[i] === 'b') c.classList.add('b');
      if (state.status[i] === 'green') c.classList.add('done');
      c.textContent = word;
      els.secretBoard.appendChild(c);
    });
    els.secretCover.hidden = true;
    els.secretContent.hidden = false;
  }

  function hideSecret() {
    // On vide le DOM pour qu'aucune information ne reste affichée
    els.secretBoard.textContent = '';
    els.secretContent.hidden = true;
    els.secret.hidden = true;
  }

  /* ---------- Événements ---------- */

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
    if (!state.over) endTurn();
  });

  function restart() {
    hideSecret();
    newGame();
    els.result.hidden = true;
    render();
  }

  els.btnNew.addEventListener('click', () => {
    const inProgress = !state.over && state.status.some((s) => s !== 'hidden');
    if (inProgress && !window.confirm('Abandonner la partie en cours ?')) return;
    restart();
  });
  els.btnReplay.addEventListener('click', restart);
  els.btnViewBoard.addEventListener('click', () => { els.result.hidden = true; });

  // Si l'app passe en arrière-plan, on masque la vue secrète
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !els.secret.hidden) hideSecret();
  });

  /* ---------- Démarrage ---------- */

  state = load();
  if (!state) newGame();
  render();
  showResult();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne indisponible */ });
    });
  }
})();
