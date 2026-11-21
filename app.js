// ==========================================
// 0. إعداد المزامنة السحابية عبر Firebase
// ==========================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCi7gomrbfG9KPYfD3DqPMO7ubJZXeE6wo",
  authDomain: "horooff-ceb81.firebaseapp.com",
  databaseURL: "https://horooff-ceb81-default-rtdb.firebaseio.com",
  projectId: "horooff-ceb81",
  storageBucket: "horooff-ceb81.firebasestorage.app",
  messagingSenderId: "815516093583",
  appId: "1:815516093583:web:8cbb3a42ccb0a32f7df4fa",
  measurementId: "G-X8NLBCCJVT"
};

let dbRef = null;
let serverOffsetMs = 0;
let isCloudConnected = false;

function initCloudSync() {
  const badge = document.getElementById('syncStatusBadge');
  try {
    if (FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL && window.firebase) {
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      const rtdb = firebase.database();
      isCloudConnected = true;

      rtdb.ref('.info/serverTimeOffset').on('value', (snap) => {
        serverOffsetMs = snap.val() || 0;
      });

      if (currentRoom) {
        attachCloudListeners();
      }

      if (badge) {
        badge.textContent = 'متصل بـ Firebase (الجرس والغرفة يعملان على جميع الأجهزة)';
        badge.className = 'sync-badge online';
      }
    } else if (badge) {
      badge.textContent = 'وضع الاختبار المحلي';
      badge.className = 'sync-badge offline';
    }
  } catch (err) {
    console.error('Firebase init error:', err);
    if (badge) {
      badge.textContent = 'تعذر الاتصال بـ Firebase - تحقق من قواعد قاعدة البيانات';
      badge.className = 'sync-badge offline';
    }
  }
}

function getAccurateNow() {
  return Date.now() + serverOffsetMs;
}

// ==========================================
// 1. محرك المؤثرات الصوتية للعبة (Web Audio API)
// ==========================================
const AudioFX = {
  ctx: null,
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },
  tone(freq, type, duration, delay = 0, vol = 0.25, slideTo = null) {
    this.init();
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    }
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  },
  playShuffle() {
    const notes = [440, 554.37, 659.25, 880, 587.33, 783.99, 987.77, 1046.5];
    notes.forEach((f, i) => {
      this.tone(f, 'triangle', 0.075, i * 0.055, 0.24, f * 1.06);
    });
  },
  playSelect() {
    this.tone(660, 'sine', 0.11, 0, 0.28, 880);
    this.tone(990, 'triangle', 0.16, 0.07, 0.22);
  },
  playGoldReveal() {
    const sparkle = [783.99, 987.77, 1174.66, 1567.98, 2093.0];
    sparkle.forEach((f, i) => {
      this.tone(f, 'triangle', 0.22, i * 0.07, 0.34, f * 1.04);
      this.tone(f * 0.5, 'sine', 0.2, i * 0.07, 0.16);
    });
  },
  playBuzz() {
    this.tone(1318.5, 'sine', 0.16, 0, 0.42, 1244.5);
    this.tone(2637, 'triangle', 0.14, 0.01, 0.26);
    this.tone(1396.9, 'sine', 0.24, 0.11, 0.45, 1318.5);
    this.tone(2793.8, 'triangle', 0.2, 0.12, 0.28);
  },
  playCorrect() {
    const chord = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    chord.forEach((f, i) => {
      this.tone(f, 'triangle', 0.24, i * 0.075, 0.32);
      this.tone(f * 1.5, 'sine', 0.16, i * 0.075 + 0.02, 0.14);
    });
  },
  playWrong() {
    this.tone(240, 'sawtooth', 0.24, 0, 0.3, 175);
    this.tone(175, 'sawtooth', 0.38, 0.2, 0.32, 115);
  },
  playWin() {
    const fanfare = [
      { f: 523.25, d: 0.14, t: 0 },
      { f: 659.25, d: 0.14, t: 0.13 },
      { f: 783.99, d: 0.14, t: 0.26 },
      { f: 1046.5, d: 0.26, t: 0.39 },
      { f: 783.99, d: 0.14, t: 0.66 },
      { f: 1046.5, d: 0.45, t: 0.80 }
    ];
    fanfare.forEach((n) => {
      this.tone(n.f, 'triangle', n.d, n.t, 0.34);
      this.tone(n.f * 0.5, 'sine', n.d, n.t, 0.2);
    });
  }
};

// ==========================================
// 2. إدارة حالة الغرفة والمزامنة
// ==========================================
let currentRoom = '';
let currentMode = 'setup';
let lastBuzzCount = 0;
let lastRevealedGoldIndex = null;

const IMAGE_COLUMNS_SPEC = [
  { col: 0, count: 5 },
  { col: 1, count: 5 },
  { col: 2, count: 5 },
  { col: 3, count: 5 },
  { col: 4, count: 5 }
];

const TOTAL_LETTER_CELLS = 25;

let state = {
  cells: [],
  activeIndex: null,
  questionIndex: 0,
  greenScore: 0,
  redScore: 0,
  timer: 15,
  buzzerLocked: false,
  buzzQueue: [],
  players: {}
};

const STORAGE_KEY = () => `horoof_room_${currentRoom}`;

function normalizeState(rawObj) {
  const base = {
    cells: [],
    activeIndex: null,
    questionIndex: 0,
    greenScore: 0,
    redScore: 0,
    timer: 15,
    buzzerLocked: false,
    buzzQueue: [],
    players: {}
  };
  const merged = { ...base, ...(rawObj || {}) };
  merged.buzzQueue = Array.isArray(merged.buzzQueue) ? merged.buzzQueue : Object.values(merged.buzzQueue || {});
  merged.buzzQueue.sort((a, b) => a.ts - b.ts);
  merged.players = merged.players && typeof merged.players === 'object' ? merged.players : {};
  merged.cells = Array.isArray(merged.cells)
    ? merged.cells
    : Object.values(merged.cells || {});

  merged.cells = merged.cells.map((c, idx) => ({
    index: typeof c.index === 'number' ? c.index : idx,
    col: Number(c.col),
    row: Number(c.row),
    letter: c.letter || 'أ',
    owner: c.owner || null,
    hasGoldBar: Boolean(c.hasGoldBar),
    goldRevealed: Boolean(c.goldRevealed)
  }));

  return merged;
}

function saveState() {
  state = normalizeState(state);
  if (currentRoom) {
    localStorage.setItem(STORAGE_KEY(), JSON.stringify(state));
    if (isCloudConnected && dbRef) {
      dbRef.set(state).catch((e) => console.error('Cloud save error:', e));
    }
  }
  renderAll();
}

function loadState() {
  if (!currentRoom) return;
  const raw = localStorage.getItem(STORAGE_KEY());
  if (raw) {
    state = normalizeState(JSON.parse(raw));
  }
}

function attachCloudListeners() {
  if (!isCloudConnected || !currentRoom) return;
  dbRef = firebase.database().ref(`horoof_rooms/${currentRoom}`);
  dbRef.off();
  dbRef.on('value', (snapshot) => {
    const cloudData = snapshot.val();
    if (!cloudData) return;

    const incoming = normalizeState(cloudData);
    const newBuzzLen = incoming.buzzQueue.length;
    if (newBuzzLen > lastBuzzCount && currentMode !== 'player') {
      AudioFX.playBuzz();
    }
    lastBuzzCount = newBuzzLen;
    state = incoming;
    localStorage.setItem(STORAGE_KEY(), JSON.stringify(state));
    renderAll();
  });
}

window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY() && e.newValue) {
    const incoming = normalizeState(JSON.parse(e.newValue));
    if (incoming.buzzQueue.length > lastBuzzCount && currentMode !== 'player') {
      AudioFX.playBuzz();
    }
    lastBuzzCount = incoming.buzzQueue.length;
    state = incoming;
    renderAll();
  }
});

// ==========================================
// 3. تهيئة الروابط والأوضاع + زر الرجوع
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const modeParam = params.get('mode');
  const roomParam = params.get('room');

  document.getElementById('genRoomBtn').onclick = () => {
    document.getElementById('roomCodeInput').value = Math.random().toString(36).substring(2, 6).toUpperCase();
  };

  if (roomParam) {
    document.getElementById('roomCodeInput').value = roomParam.toUpperCase();
  } else {
    document.getElementById('genRoomBtn').click();
  }

  initCloudSync();

  if (modeParam && roomParam) {
    launchMode(modeParam, roomParam.toUpperCase());
  } else {
    showSetupScreen();
  }
});

function showSetupScreen() {
  currentMode = 'setup';
  GameController.stopTimer();
  const cleanUrl = `${window.location.pathname}`;
  window.history.replaceState({}, '', cleanUrl);
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const setupEl = document.getElementById('setupScreen');
  if (setupEl) setupEl.classList.add('active');
}

function goBack() {
  AudioFX.init();
  showSetupScreen();
}

function launchMode(mode, forcedRoom = null) {
  AudioFX.init();
  currentRoom = (forcedRoom || document.getElementById('roomCodeInput').value || 'YAM1').toUpperCase();
  currentMode = mode;

  const newUrl = `${window.location.pathname}?mode=${mode}&room=${currentRoom}`;
  window.history.replaceState({}, '', newUrl);

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

  loadState();
  if (!state.cells || state.cells.length !== TOTAL_LETTER_CELLS) {
    GameController.initBoard(false);
  }

  if (isCloudConnected) {
    attachCloudListeners();
  }

  if (mode === 'board') {
    document.getElementById('boardScreen').classList.add('active');
    document.getElementById('boardRoomLabel').textContent = currentRoom;
  } else if (mode === 'host') {
    document.getElementById('hostScreen').classList.add('active');
    document.getElementById('hostRoomLabel').textContent = currentRoom;
  } else if (mode === 'player') {
    document.getElementById('playerScreen').classList.add('active');
    document.getElementById('playerRoomLabel').textContent = currentRoom;
    document.getElementById('playerJoinForm').classList.remove('hidden');
    document.getElementById('playerBuzzerPad').classList.add('hidden');
  }

  renderAll();
}

// ==========================================
// 4. منطق اللعبة وخوارزمية الفوز (BFS) + السبيكة الذهبية
// ==========================================
const GameController = {
  timerInterval: null,

  assignHiddenGoldBars(cells) {
    const goldCount = Math.floor(Math.random() * 2) + 3;
    const indices = cells.map((_, i) => i).sort(() => Math.random() - 0.5);
    const chosen = new Set(indices.slice(0, goldCount));

    return cells.map((cell, i) => ({
      ...cell,
      hasGoldBar: chosen.has(i),
      goldRevealed: false
    }));
  },

  initBoard(playSound = true) {
    const shuffled = [...ARABIC_LETTERS].sort(() => Math.random() - 0.5).slice(0, TOTAL_LETTER_CELLS);
    const rawCells = [];
    let poolIdx = 0;

    IMAGE_COLUMNS_SPEC.forEach((colSpec) => {
      for (let r = 0; r < colSpec.count; r++) {
        const index = rawCells.length;
        rawCells.push({
          index,
          col: colSpec.col,
          row: r,
          letter: shuffled[poolIdx++] || 'أ',
          owner: null,
          hasGoldBar: false,
          goldRevealed: false
        });
      }
    });

    state.cells = this.assignHiddenGoldBars(rawCells);
    state.activeIndex = null;
    state.buzzQueue = [];
    state.buzzerLocked = false;
    lastBuzzCount = 0;
    lastRevealedGoldIndex = null;
    if (playSound) AudioFX.playShuffle();
    saveState();
  },

  newRound() {
    this.stopTimer();
    state.timer = 15;
    this.initBoard(true);
  },

  pickRandomLetter() {
    const availableCells = state.cells.filter(c => !c.owner);
    const pool = availableCells.length > 0 ? availableCells : state.cells;
    if (!pool.length) return;

    const randomCell = pool[Math.floor(Math.random() * pool.length)];
    this.selectCell(randomCell.index);
  },

  selectCell(index) {
    const cell = state.cells[index];
    if (!cell) return;

    state.activeIndex = index;
    state.questionIndex = 0;
    state.buzzQueue = [];
    state.buzzerLocked = false;
    lastBuzzCount = 0;

    let revealedNow = false;
    if (cell.hasGoldBar && !cell.goldRevealed) {
      cell.goldRevealed = true;
      revealedNow = true;
    }

    if (revealedNow) {
      AudioFX.playGoldReveal();
    } else {
      AudioFX.playSelect();
    }

    saveState();
  },

  nextQuestion() {
    if (state.activeIndex === null || !state.cells[state.activeIndex]) return;
    const letter = state.cells[state.activeIndex].letter;
    const list = QUESTIONS_DB[letter] || [];
    if (list.length > 0) {
      state.questionIndex = (state.questionIndex + 1) % list.length;
      saveState();
    }
  },

  awardCell(team) {
    if (state.activeIndex === null || !state.cells[state.activeIndex]) return;
    const targetCell = state.cells[state.activeIndex];
    targetCell.owner = team;
    if (targetCell.hasGoldBar) {
      targetCell.goldRevealed = true;
    }

    state.activeIndex = null;
    state.buzzQueue = [];
    state.buzzerLocked = false;
    lastBuzzCount = 0;
    this.stopTimer();
    AudioFX.playCorrect();
    saveState();

    const winPath = this.checkWin(team);
    if (winPath) {
      if (team === 'green') state.greenScore++;
      else state.redScore++;
      AudioFX.playWin();
      saveState();
      showWinModal(team);
    }
  },

  passTurn() {
    state.buzzQueue = [];
    state.buzzerLocked = false;
    lastBuzzCount = 0;
    AudioFX.playWrong();
    saveState();
  },

  replaceLetter() {
    if (state.activeIndex === null || !state.cells[state.activeIndex]) return;
    const used = new Set(state.cells.map(c => c.letter));
    const available = ARABIC_LETTERS.filter(l => !used.has(l));
    if (available.length > 0) {
      state.cells[state.activeIndex].letter = available[Math.floor(Math.random() * available.length)];
      state.questionIndex = 0;
      AudioFX.playShuffle();
      saveState();
    }
  },

  unlockBuzzer() {
    state.buzzQueue = [];
    state.buzzerLocked = false;
    lastBuzzCount = 0;
    saveState();
  },

  startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      if (state.timer > 0) {
        state.timer--;
        if (state.timer <= 5 && state.timer > 0) AudioFX.tone(980, 'sine', 0.09, 0, 0.24);
        if (state.timer === 0) AudioFX.playWrong();
        saveState();
      } else {
        this.stopTimer();
      }
    }, 1000);
  },

  stopTimer() {
    clearInterval(this.timerInterval);
  },

  resetTimer() {
    this.stopTimer();
    state.timer = 15;
    saveState();
  },

  checkWin(team) {
    const visited = new Set();
    const queue = [];

    for (const cell of state.cells) {
      if (!cell || cell.owner !== team) continue;
      const isStart = (team === 'green' && cell.row === 0) || (team === 'red' && cell.col === 0);
      if (isStart) {
        queue.push([cell.index]);
        visited.add(cell.index);
      }
    }

    while (queue.length > 0) {
      const path = queue.shift();
      const currIdx = path[path.length - 1];
      const currCell = state.cells[currIdx];

      const colSpec = IMAGE_COLUMNS_SPEC[currCell.col];
      const isGoal =
        (team === 'green' && currCell.row === colSpec.count - 1) ||
        (team === 'red' && currCell.col === IMAGE_COLUMNS_SPEC.length - 1);

      if (isGoal) {
        return path;
      }

      for (const nxtIdx of this.getNeighbors(currIdx)) {
        if (!visited.has(nxtIdx) && state.cells[nxtIdx] && state.cells[nxtIdx].owner === team) {
          visited.add(nxtIdx);
          queue.push([...path, nxtIdx]);
        }
      }
    }
    return null;
  },

  getNeighbors(cellIndex) {
    const target = state.cells[cellIndex];
    if (!target) return [];
    const neighbors = [];

    for (const candidate of state.cells) {
      if (candidate.index === target.index) continue;
      const colDiff = Math.abs(candidate.col - target.col);
      if (colDiff === 0 && Math.abs(candidate.row - target.row) === 1) {
        neighbors.push(candidate.index);
      } else if (colDiff === 1 && Math.abs(candidate.row - target.row) <= 1) {
        neighbors.push(candidate.index);
      }
    }
    return neighbors;
  }
};

// ==========================================
// 5. جرس اللاعب: إدخال الاسم واختيار الفريق والمزامنة الفورية
// ==========================================
const PlayerClient = {
  id: 'p_' + Math.random().toString(36).substr(2, 9),
  name: '',
  team: 'green',

  join() {
    AudioFX.init();
    const nameInput = document.getElementById('playerNameInput').value.trim();
    if (!nameInput) return alert('الرجاء كتابة اسمك أولاً');

    const selectedTeamEl = document.querySelector('input[name="playerTeam"]:checked');
    this.name = nameInput;
    this.team = selectedTeamEl ? selectedTeamEl.value : 'green';

    loadState();
    state.players[this.id] = {
      id: this.id,
      name: this.name,
      team: this.team,
      joinedAt: getAccurateNow()
    };
    saveState();

    document.getElementById('playerJoinForm').classList.add('hidden');
    document.getElementById('playerBuzzerPad').classList.remove('hidden');
    document.getElementById('pDisplayName').textContent = this.name;
    document.getElementById('pDisplayTeam').textContent = this.team === 'green' ? 'الفريق الأخضر 🟢' : 'الفريق الأحمر 🔴';
  },

  buzz() {
    AudioFX.init();
    loadState();
    if (state.buzzQueue.some(b => b.id === this.id)) return;

    const exactTimestamp = getAccurateNow();

    state.buzzQueue.push({
      id: this.id,
      name: this.name,
      team: this.team,
      ts: exactTimestamp
    });

    state.buzzQueue.sort((a, b) => a.ts - b.ts);
    state.buzzerLocked = true;

    AudioFX.playBuzz();
    saveState();
  }
};

// ==========================================
// 6. رسم الواجهات وتحديثها لحظياً
// ==========================================
function renderAll() {
  document.getElementById('boardGreenScore').textContent = state.greenScore;
  document.getElementById('boardRedScore').textContent = state.redScore;
  document.getElementById('boardTimer').textContent = state.timer;

  document.getElementById('hostGreenScore').textContent = state.greenScore;
  document.getElementById('hostRedScore').textContent = state.redScore;
  document.getElementById('hostTimer').textContent = state.timer;

  renderSvgHexBoard('hexGrid');
  renderSvgHexBoard('hostMiniGrid');

  const activeCell = state.activeIndex !== null ? state.cells[state.activeIndex] : null;
  const goldShowcase = document.getElementById('goldBarShowcase');
  const goldShowcaseLetter = document.getElementById('goldShowcaseLetter');
  const hostGoldAlert = document.getElementById('hostGoldAlert');

  if (activeCell && activeCell.letter) {
    const qList = QUESTIONS_DB[activeCell.letter] || [{ q: 'سؤال حر من المقدم', a: '---' }];
    const currentQ = qList[state.questionIndex % qList.length];

    document.getElementById('hostSelectedLetter').textContent = activeCell.letter;
    document.getElementById('hostQuestionText').textContent = currentQ.q;
    document.getElementById('hostAnswerText').textContent = currentQ.a;

    if (activeCell.hasGoldBar && activeCell.goldRevealed) {
      if (goldShowcase) {
        goldShowcase.classList.remove('hidden');
        if (goldShowcaseLetter) goldShowcaseLetter.textContent = activeCell.letter;
      }
      if (hostGoldAlert) hostGoldAlert.classList.remove('hidden');
      if (lastRevealedGoldIndex !== activeCell.index && currentMode !== 'player') {
        lastRevealedGoldIndex = activeCell.index;
        AudioFX.playGoldReveal();
      }
    } else {
      if (goldShowcase) goldShowcase.classList.add('hidden');
      if (hostGoldAlert) hostGoldAlert.classList.add('hidden');
    }
  } else {
    document.getElementById('hostSelectedLetter').textContent = '-';
    document.getElementById('hostQuestionText').textContent = 'اختر حرفاً من اللوحة لعرض السؤال';
    document.getElementById('hostAnswerText').textContent = '---';
    if (goldShowcase) goldShowcase.classList.add('hidden');
    if (hostGoldAlert) hostGoldAlert.classList.add('hidden');
  }

  const banner = document.getElementById('boardBuzzBanner');
  if (state.buzzQueue.length > 0) {
    const first = state.buzzQueue[0];
    banner.classList.remove('hidden');
    document.getElementById('boardBuzzName').textContent = first.name;
    document.getElementById('boardBuzzDetails').textContent =
      `${first.team === 'green' ? 'الفريق الأخضر 🟢' : 'الفريق الأحمر 🔴'} • الأسرع!`;
  } else {
    banner.classList.add('hidden');
  }

  const queueEl = document.getElementById('hostBuzzQueue');
  if (state.buzzQueue.length === 0) {
    queueEl.innerHTML = '<p class="muted">بانتظار ضغط اللاعبين على الجرس...</p>';
  } else {
    const baseTs = state.buzzQueue[0].ts;
    queueEl.innerHTML = state.buzzQueue.map((item, idx) => {
      const diffSec = ((item.ts - baseTs) / 1000).toFixed(3);
      const timeBadge = idx === 0 ? '⚡ الأسرع' : `+${diffSec} ث`;
      return `
        <div class="buzz-item ${item.team}">
          <span><b>#${idx + 1}</b> ${item.name}</span>
          <span>${timeBadge}</span>
        </div>
      `;
    }).join('');
  }

  const greenList = document.getElementById('boardGreenPlayers');
  const redList = document.getElementById('boardRedPlayers');
  const topPlayersBar = document.getElementById('boardTopPlayersBar');
  const hostPlayers = document.getElementById('hostPlayersList');

  const playersArr = Object.values(state.players || {});
  const greenPlayers = playersArr.filter(p => p.team === 'green');
  const redPlayers = playersArr.filter(p => p.team === 'red');

  const greenMarkup = `<span class="strip-label">🟢 الأخضر (${greenPlayers.length}):</span>` +
    (greenPlayers.length
      ? greenPlayers.map(p => `<span class="player-chip green-chip">${p.name}</span>`).join('')
      : '<span class="muted">لا يوجد لاعبون</span>');

  const redMarkup = `<span class="strip-label">🔴 الأحمر (${redPlayers.length}):</span>` +
    (redPlayers.length
      ? redPlayers.map(p => `<span class="player-chip red-chip">${p.name}</span>`).join('')
      : '<span class="muted">لا يوجد لاعبون</span>');

  if (greenList) greenList.innerHTML = greenMarkup;
  if (redList) redList.innerHTML = redMarkup;

  if (topPlayersBar) {
    topPlayersBar.innerHTML = `
      <div class="top-team-group green-group">
        <span class="top-team-badge">🟢 الفريق الأخضر (${greenPlayers.length})</span>
        <div class="top-chips-wrap">
          ${greenPlayers.length
            ? greenPlayers.map(p => `<span class="top-player-pill green-pill">${p.name}</span>`).join('')
            : '<span class="top-empty-text">بانتظار اللاعبين</span>'}
        </div>
      </div>
      <div class="top-team-group red-group">
        <span class="top-team-badge">🔴 الفريق الأحمر (${redPlayers.length})</span>
        <div class="top-chips-wrap">
          ${redPlayers.length
            ? redPlayers.map(p => `<span class="top-player-pill red-pill">${p.name}</span>`).join('')
            : '<span class="top-empty-text">بانتظار اللاعبين</span>'}
        </div>
      </div>
    `;
  }

  hostPlayers.innerHTML = `
    <div class="host-team-box green-box">
      <div class="host-team-title">🟢 الفريق الأخضر (${greenPlayers.length})</div>
      ${greenPlayers.length
        ? greenPlayers.map(p => `<div class="host-player-name">${p.name}</div>`).join('')
        : '<div class="muted">بانتظار انضمام اللاعبين...</div>'}
    </div>
    <div class="host-team-box red-box">
      <div class="host-team-title">🔴 الفريق الأحمر (${redPlayers.length})</div>
      ${redPlayers.length
        ? redPlayers.map(p => `<div class="host-player-name">${p.name}</div>`).join('')
        : '<div class="muted">بانتظار انضمام اللاعبين...</div>'}
    </div>
  `;

  const bigBtn = document.getElementById('bigBuzzerBtn');
  const statusMsg = document.getElementById('playerStatusMsg');
  if (bigBtn) {
    if (state.buzzQueue.length > 0) {
      bigBtn.classList.add('locked');
      const winner = state.buzzQueue[0];
      statusMsg.textContent = winner.id === PlayerClient.id
        ? '🎉 أنت الأسرع! تفضل بالإجابة'
        : `سبقك (${winner.name}) بالضغط على الجرس!`;
    } else {
      bigBtn.classList.remove('locked');
      statusMsg.textContent = 'الجرس جاهز.. كن الأسرع!';
    }
  }
}

function hexPointsSvg(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

function renderSvgHexBoard(containerId) {
  const container = document.getElementById(containerId);
  if (!container || !state.cells || state.cells.length === 0) return;

  const R = 50;
  const dx = 1.5 * R;
  const dy = Math.sqrt(3) * R;
  const centerX = 420;
  const centerY = 360;

  const columnsCount = 5;
  const rowsCount = 5;
  const allHexes = [];
  const baseBottomY = centerY + ((rowsCount - 1) * dy) / 2 + dy;

  for (let visualCol = 0; visualCol < columnsCount; visualCol++) {
    const specCol = columnsCount - 1 - visualCol;
    const cx = centerX + (2 - visualCol) * dx;
    const stagger = (visualCol % 2 === 1) ? (dy * 0.5) : 0;
    const startY = centerY - ((rowsCount - 1) * dy) / 2 + stagger;

    allHexes.push({ type: 'border', color: '#077e36', cx, cy: startY - dy });

    const colCells = state.cells
      .filter(c => Number(c.col) === specCol)
      .sort((a, b) => Number(a.row) - Number(b.row))
      .slice(0, rowsCount);

    colCells.forEach((cell, rIdx) => {
      allHexes.push({
        type: 'letter',
        cell,
        cx,
        cy: startY + rIdx * dy
      });
    });

    const flippedBottomY = baseBottomY - stagger;
    allHexes.push({ type: 'border', color: '#077e36', cx, cy: flippedBottomY });
  }

  const leftColX = centerX + 2 * dx;
  const rightColX = centerX - 2 * dx;
  const leftStagger = (0 % 2 === 1) ? (dy * 0.5) : 0;
  const rightStagger = (4 % 2 === 1) ? (dy * 0.5) : 0;
  const leftStartY = centerY - ((rowsCount - 1) * dy) / 2 + leftStagger;
  const rightStartY = centerY - ((rowsCount - 1) * dy) / 2 + rightStagger;

  allHexes.push({
    type: 'border',
    color: '#c41620',
    cx: leftColX + dx,
    cy: leftStartY - dy * 0.5
  });

  for (let r = 0; r < rowsCount; r++) {
    allHexes.push({
      type: 'border',
      color: '#c41620',
      cx: leftColX + dx,
      cy: leftStartY + r * dy + dy * 0.5
    });
    allHexes.push({
      type: 'border',
      color: '#c41620',
      cx: rightColX - dx,
      cy: rightStartY + r * dy - dy * 0.5
    });
  }

  allHexes.push({
    type: 'border',
    color: '#c41620',
    cx: rightColX - dx,
    cy: rightStartY + (rowsCount - 1) * dy + dy * 0.5
  });

  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', '0 0 840 720');

  const defs = document.createElementNS(svgNs, 'defs');

  const createGrad = (id, topColor, bottomColor) => {
    const grad = document.createElementNS(svgNs, 'linearGradient');
    grad.setAttribute('id', `${id}_${containerId}`);
    grad.setAttribute('x1', '0%');
    grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '0%');
    grad.setAttribute('y2', '100%');

    const s1 = document.createElementNS(svgNs, 'stop');
    s1.setAttribute('offset', '0%');
    s1.setAttribute('stop-color', topColor);

    const s2 = document.createElementNS(svgNs, 'stop');
    s2.setAttribute('offset', '100%');
    s2.setAttribute('stop-color', bottomColor);

    grad.appendChild(s1);
    grad.appendChild(s2);
    defs.appendChild(grad);
  };

  createGrad('gradDefault', '#ffffff', '#e8e0b5');
  createGrad('gradGreen', '#22e572', '#09873d');
  createGrad('gradRed', '#ff5964', '#b81420');
  createGrad('gradActive', '#fef08a', '#d97706');
  createGrad('gradGoldRevealed', '#fde047', '#ca8a04');
  createGrad('gradBorderGreen', '#12a84c', '#045724');
  createGrad('gradBorderRed', '#e02430', '#8f0d15');

  svg.appendChild(defs);

  const bgRect = document.createElementNS(svgNs, 'rect');
  bgRect.setAttribute('x', '0');
  bgRect.setAttribute('y', '0');
  bgRect.setAttribute('width', '840');
  bgRect.setAttribute('height', '720');
  bgRect.setAttribute('fill', '#050505');
  svg.appendChild(bgRect);

  allHexes.forEach((item) => {
    if (item.type === 'border') {
      const gradRef = item.color === '#077e36'
        ? `url(#gradBorderGreen_${containerId})`
        : `url(#gradBorderRed_${containerId})`;

      const poly = document.createElementNS(svgNs, 'polygon');
      poly.setAttribute('points', hexPointsSvg(item.cx, item.cy, R));
      poly.setAttribute('fill', gradRef);
      poly.setAttribute('stroke', '#111827');
      poly.setAttribute('stroke-width', '3.5');
      poly.setAttribute('stroke-linejoin', 'round');
      poly.setAttribute('class', 'hex-poly');
      svg.appendChild(poly);
      return;
    }

    const { cell, cx, cy } = item;
    const showGold = Boolean(cell.hasGoldBar && cell.goldRevealed);

    const g = document.createElementNS(svgNs, 'g');
    let cls = 'hex-letter-cell';
    if (cell.owner === 'green') cls += ' owned-green';
    else if (cell.owner === 'red') cls += ' owned-red';
    if (state.activeIndex === cell.index) cls += ' active-cell';
    if (showGold) cls += ' revealed-gold';
    g.setAttribute('class', cls);

    let fillRef = `url(#gradDefault_${containerId})`;
    let strokeColor = '#1f2937';
    let strokeWidth = '3.5';

    if (cell.owner === 'green') {
      fillRef = `url(#gradGreen_${containerId})`;
      strokeColor = '#053b1b';
    } else if (cell.owner === 'red') {
      fillRef = `url(#gradRed_${containerId})`;
      strokeColor = '#5e0a10';
    }

    if (showGold) {
      fillRef = `url(#gradGoldRevealed_${containerId})`;
      strokeColor = '#fef9c3';
      strokeWidth = '4.2';
    }

    if (state.activeIndex === cell.index) {
      fillRef = `url(#gradActive_${containerId})`;
      strokeColor = '#ffffff';
      strokeWidth = '4.5';
    }

    const poly = document.createElementNS(svgNs, 'polygon');
    poly.setAttribute('points', hexPointsSvg(cx, cy, R));
    poly.setAttribute('fill', fillRef);
    poly.setAttribute('stroke', strokeColor);
    poly.setAttribute('stroke-width', strokeWidth);
    poly.setAttribute('stroke-linejoin', 'round');
    poly.setAttribute('class', 'hex-poly');

    const shinePoly = document.createElementNS(svgNs, 'polygon');
    shinePoly.setAttribute('points', hexPointsSvg(cx, cy - 2, R * 0.84));
    shinePoly.setAttribute('fill', 'none');
    shinePoly.setAttribute('stroke', 'rgba(255,255,255,0.42)');
    shinePoly.setAttribute('stroke-width', '1.5');
    shinePoly.setAttribute('pointer-events', 'none');

    const text = document.createElementNS(svgNs, 'text');
    text.setAttribute('x', cx);
    text.setAttribute('y', showGold ? cy - 8 : cy + 2);
    text.setAttribute('class', 'hex-letter-text');
    text.textContent = cell.letter || '';

    g.appendChild(poly);
    g.appendChild(shinePoly);
    g.appendChild(text);

    if (showGold) {
      const goldIcon = document.createElementNS(svgNs, 'text');
      goldIcon.setAttribute('x', cx);
      goldIcon.setAttribute('y', cy + 22);
      goldIcon.setAttribute('text-anchor', 'middle');
      goldIcon.setAttribute('dominant-baseline', 'central');
      goldIcon.setAttribute('font-size', '18');
      goldIcon.setAttribute('pointer-events', 'none');
      goldIcon.textContent = '🏅';
      g.appendChild(goldIcon);
    }

    g.addEventListener('click', () => GameController.selectCell(cell.index));
    svg.appendChild(g);
  });

  container.innerHTML = '';
  container.appendChild(svg);
}

// ==========================================
// 7. أدوات الباركود QR والنوافذ
// ==========================================
function getPlayerUrl() {
  const room = (currentRoom || document.getElementById('roomCodeInput').value || 'YAM1').toUpperCase();
  const baseUrl = window.location.href.split('?')[0];
  return `${baseUrl}?mode=player&room=${room}`;
}

function openQRModal() {
  const url = getPlayerUrl();
  document.getElementById('qrModal').classList.remove('hidden');
  document.getElementById('qrDirectLink').textContent = url;
  const container = document.getElementById('qrcodeContainer');
  container.innerHTML = '';
  new QRCode(container, { text: url, width: 200, height: 200 });
}

function closeQRModal() {
  document.getElementById('qrModal').classList.add('hidden');
}

function copyPlayerLink() {
  navigator.clipboard.writeText(getPlayerUrl());
  alert('تم نسخ رابط جرس اللاعبين!');
}

function openBoardWindow() {
  const baseUrl = window.location.href.split('?')[0];
  window.open(`${baseUrl}?mode=board&room=${currentRoom}`, '_blank');
}

function showWinModal(team) {
  document.getElementById('winTitle').textContent =
    team === 'green' ? '🏆 مبروك للفريق الأخضر!' : '🏆 مبروك للفريق الأحمر!';
  document.getElementById('winModal').classList.remove('hidden');
}

function closeWinModal() {
  document.getElementById('winModal').classList.add('hidden');
  GameController.newRound();
}
