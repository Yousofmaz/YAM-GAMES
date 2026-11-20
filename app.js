// ==========================================
// 1. محرك المؤثرات الصوتية الأصلية (Web Audio API)
// ==========================================
const AudioFX = {
  ctx: null,
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  },
  tone(freq, type, duration, delay = 0, vol = 0.25) {
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(this.ctx.currentTime + delay);
    osc.stop(this.ctx.currentTime + delay + duration);
  },
  playShuffle() {
    for (let i = 0; i < 14; i++) {
      this.tone(300 + (i * 45), 'triangle', 0.08, i * 0.05, 0.2);
    }
  },
  playSelect() {
    this.tone(587.33, 'sine', 0.15, 0, 0.3);
    this.tone(880, 'sine', 0.25, 0.1, 0.3);
  },
  playBuzz() {
    this.tone(180, 'sawtooth', 0.45, 0, 0.4);
    this.tone(240, 'square', 0.45, 0.05, 0.3);
  },
  playCorrect() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 'triangle', 0.25, i * 0.09, 0.35));
  },
  playWrong() {
    this.tone(150, 'sawtooth', 0.5, 0, 0.35);
  },
  playWin() {
    const notes = [523, 659, 783, 1046, 783, 1046];
    notes.forEach((n, i) => this.tone(n, 'square', 0.3, i * 0.14, 0.3));
  }
};

// ==========================================
// 2. إدارة حالة الغرفة والمزامنة
// ==========================================
let currentRoom = '';
let currentMode = 'setup';
let state = {
  cells: [], // 25 خلية: { letter, owner: null | 'green' | 'red' }
  activeIndex: null,
  questionIndex: 0,
  greenScore: 0,
  redScore: 0,
  timer: 15,
  buzzerLocked: false,
  buzzQueue: [], // { id, name, team, ts }
  players: {}    // { id: { name, team } }
};

const STORAGE_KEY = () => `horoof_room_${currentRoom}`;

function saveState() {
  localStorage.setItem(STORAGE_KEY(), JSON.stringify(state));
  renderAll();
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY());
  if (raw) {
    state = JSON.parse(raw);
  }
}

// الاستماع للتحديثات الفورية بين التبويبات/النوافذ
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY() && e.newValue) {
    const prevBuzzLen = state.buzzQueue.length;
    state = JSON.parse(e.newValue);
    if (state.buzzQueue.length > prevBuzzLen && currentMode !== 'player') {
      AudioFX.playBuzz();
    }
    renderAll();
  }
});

// ==========================================
// 3. تهيئة الروابط والأوضاع
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

  if (modeParam && roomParam) {
    launchMode(modeParam, roomParam.toUpperCase());
  }
});

function launchMode(mode, forcedRoom = null) {
  currentRoom = (forcedRoom || document.getElementById('roomCodeInput').value || 'YAM1').toUpperCase();
  currentMode = mode;

  // تحديث الرابط بدون إعادة تحميل
  const newUrl = `${window.location.pathname}?mode=${mode}&room=${currentRoom}`;
  window.history.replaceState({}, '', newUrl);

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

  loadState();
  if (state.cells.length === 0) {
    GameController.initBoard(false);
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
  }

  renderAll();
}

// ==========================================
// 4. منطق اللعبة وخوارزمية الفوز (BFS)
// ==========================================
const GameController = {
  timerInterval: null,

  initBoard(playSound = true) {
    const shuffled = [...ARABIC_LETTERS].sort(() => Math.random() - 0.5).slice(0, 25);
    state.cells = shuffled.map(letter => ({ letter, owner: null }));
    state.activeIndex = null;
    state.buzzQueue = [];
    state.buzzerLocked = false;
    if (playSound) AudioFX.playShuffle();
    saveState();
  },

  newRound() {
    this.stopTimer();
    state.timer = 15;
    this.initBoard(true);
  },

  selectCell(index) {
    state.activeIndex = index;
    state.questionIndex = 0;
    state.buzzQueue = [];
    state.buzzerLocked = false;
    AudioFX.playSelect();
    saveState();
  },

  nextQuestion() {
    if (state.activeIndex === null) return;
    const letter = state.cells[state.activeIndex].letter;
    const list = QUESTIONS_DB[letter] || [];
    if (list.length > 0) {
      state.questionIndex = (state.questionIndex + 1) % list.length;
      saveState();
    }
  },

  awardCell(team) {
    if (state.activeIndex === null) return;
    state.cells[state.activeIndex].owner = team;
    state.activeIndex = null;
    state.buzzQueue = [];
    state.buzzerLocked = false;
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
    AudioFX.playWrong();
    saveState();
  },

  replaceLetter() {
    if (state.activeIndex === null) return;
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
    saveState();
  },

  startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      if (state.timer > 0) {
        state.timer--;
        if (state.timer <= 5 && state.timer > 0) AudioFX.tone(800, 'sine', 0.1, 0, 0.2);
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

  // خوارزمية البحث بالعرض (BFS) للتحقق من توصيل المسار
  checkWin(team) {
    const visited = new Set();
    const queue = [];

    for (let i = 0; i < 25; i++) {
      const r = Math.floor(i / 5);
      const c = i % 5;
      if (state.cells[i].owner === team) {
        if ((team === 'green' && r === 0) || (team === 'red' && c === 0)) {
          queue.push([i]);
          visited.add(i);
        }
      }
    }

    while (queue.length > 0) {
      const path = queue.shift();
      const curr = path[path.length - 1];
      const r = Math.floor(curr / 5);
      const c = curr % 5;

      if ((team === 'green' && r === 4) || (team === 'red' && c === 4)) {
        return path;
      }

      for (const nxt of this.getNeighbors(r, c)) {
        if (!visited.has(nxt) && state.cells[nxt].owner === team) {
          visited.add(nxt);
          queue.push([...path, nxt]);
        }
      }
    }
    return null;
  },

  getNeighbors(r, c) {
    const evenOffsets = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]];
    const oddOffsets  = [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
    const offsets = (r % 2 === 0) ? evenOffsets : oddOffsets;
    const res = [];
    for (const [dr, dc] of offsets) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) res.push(nr * 5 + nc);
    }
    return res;
  }
};

// ==========================================
// 5. جرس اللاعب بدقة أجزاء الثانية
// ==========================================
const PlayerClient = {
  id: 'p_' + Math.random().toString(36).substr(2, 9),
  name: '',
  team: 'green',

  join() {
    const nameInput = document.getElementById('playerNameInput').value.trim();
    if (!nameInput) return alert('الرجاء كتابة اسمك أولاً');
    this.name = nameInput;
    this.team = document.querySelector('input[name="playerTeam"]:checked').value;

    loadState();
    state.players[this.id] = { name: this.name, team: this.team };
    saveState();

    document.getElementById('playerJoinForm').classList.add('hidden');
    document.getElementById('playerBuzzerPad').classList.remove('hidden');
    document.getElementById('pDisplayName').textContent = this.name;
    document.getElementById('pDisplayTeam').textContent = this.team === 'green' ? 'الفريق الأخضر 🟢' : 'الفريق الأحمر 🔴';
  },

  buzz() {
    loadState();
    // تسجيل الطابع الزمني عالي الدقة بالميلي ثانية
    const exactTimestamp = performance.timeOrigin + performance.now();

    if (state.buzzQueue.some(b => b.id === this.id)) return;

    state.buzzQueue.push({
      id: this.id,
      name: this.name,
      team: this.team,
      ts: exactTimestamp
    });

    // ترتيب تلقائي حسب أسرع ضغطة بأجزاء الثانية
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
  // تحديث النقاط والمؤقت
  document.getElementById('boardGreenScore').textContent = state.greenScore;
  document.getElementById('boardRedScore').textContent = state.redScore;
  document.getElementById('boardTimer').textContent = state.timer;

  document.getElementById('hostGreenScore').textContent = state.greenScore;
  document.getElementById('hostRedScore').textContent = state.redScore;
  document.getElementById('hostTimer').textContent = state.timer;

  // رسم اللوحة السداسية (شاشة العرض + شاشة المقدم)
  renderHexGrid('hexGrid', false);
  renderHexGrid('hostMiniGrid', true);

  // تحديث سؤال المقدم
  if (state.activeIndex !== null && state.cells[state.activeIndex]) {
    const letter = state.cells[state.activeIndex].letter;
    const qList = QUESTIONS_DB[letter] || [{ q: 'سؤال حر من المقدم', a: '---' }];
    const currentQ = qList[state.questionIndex % qList.length];

    document.getElementById('hostSelectedLetter').textContent = letter;
    document.getElementById('hostQuestionText').textContent = currentQ.q;
    document.getElementById('hostAnswerText').textContent = currentQ.a;
  } else {
    document.getElementById('hostSelectedLetter').textContent = '-';
    document.getElementById('hostQuestionText').textContent = 'اختر حرفاً من اللوحة لعرض السؤال';
    document.getElementById('hostAnswerText').textContent = '---';
  }

  // تحديث الجرس على شاشة اللوحة
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

  // تحديث قائمة ترتيب السرعة لدى المقدم
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

  // تحديث قائمة اللاعبين المتصلين
  const greenList = document.getElementById('boardGreenPlayers');
  const redList = document.getElementById('boardRedPlayers');
  const hostPlayers = document.getElementById('hostPlayersList');
  greenList.innerHTML = '';
  redList.innerHTML = '';
  hostPlayers.innerHTML = '';

  Object.values(state.players).forEach(p => {
    const chip = `<span class="player-chip">${p.name}</span>`;
    if (p.team === 'green') greenList.innerHTML += chip;
    else redList.innerHTML += chip;
    hostPlayers.innerHTML += `<div>${p.team === 'green' ? '🟢' : '🔴'} ${p.name}</div>`;
  });

  // تحديث حالة زر الجرس في جوال اللاعب
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

function renderHexGrid(containerId, isHost) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  for (let r = 0; r < 5; r++) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'hex-row';

    for (let c = 0; c < 5; c++) {
      const idx = r * 5 + c;
      const cell = state.cells[idx];
      if (!cell) continue;

      const cellDiv = document.createElement('div');
      cellDiv.className = 'hex-cell';
      if (cell.owner) cellDiv.classList.add(cell.owner);
      if (state.activeIndex === idx) cellDiv.classList.add('active-cell');
      cellDiv.textContent = cell.letter;

      cellDiv.onclick = () => GameController.selectCell(idx);
      rowDiv.appendChild(cellDiv);
    }
    container.appendChild(rowDiv);
  }
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
