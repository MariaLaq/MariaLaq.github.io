'use strict';

const canvas  = document.getElementById('c');
const ctx     = canvas.getContext('2d');
const isMobile = window.innerWidth < 600;
const W = isMobile ? window.innerWidth : 1000;
const H = isMobile ? window.innerHeight : 650;
canvas.width  = W;
canvas.height = H;

//  DOM REFS
const volDisplay = document.getElementById('vol-display');
const trackFill  = document.getElementById('track-fill');
const trackPos   = document.getElementById('track-pos');
const overlay    = document.getElementById('overlay');

//  AUDIO ENGINE
let audioCtx     = null;
let masterGain   = null;   
let bgGain       = null;
let bgOsc        = null;
let melInterval  = null;
let audioStarted = false;

function initAudio() {
  if (audioStarted) return;
  audioStarted = true;

  audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(audioCtx.destination);

  //  Bass drone 
  bgGain = audioCtx.createGain();
  bgGain.gain.value = 0;
  bgGain.connect(masterGain);

  const bass = audioCtx.createOscillator();
  bass.type = 'triangle';
  bass.frequency.value = 110;
  const bassGain = audioCtx.createGain();
  bassGain.gain.value = 0.6;
  bass.connect(bassGain);
  bassGain.connect(bgGain);
  bass.start();

  // Melody arpeggio 
  bgOsc = audioCtx.createOscillator();
  bgOsc.type = 'square';
  const melGain = audioCtx.createGain();
  melGain.gain.value = 0.18;
  bgOsc.connect(melGain);
  melGain.connect(bgGain);
  bgOsc.start();

  const melFreqs = [261, 329, 392, 523, 659, 523, 392, 329];
  let fi = 0;
  melInterval = setInterval(() => {
    if (!audioCtx) return;
    bgOsc.frequency.setValueAtTime(melFreqs[fi % melFreqs.length], audioCtx.currentTime);
    fi++;
  }, 220);
}

function setMusicVolume(vol) {
  if (!audioCtx) return;
  bgGain.gain.setTargetAtTime(vol * 0.6, audioCtx.currentTime, 0.3);
  masterGain.gain.setTargetAtTime(vol * 0.5, audioCtx.currentTime, 0.3);
}

function playFlap(backwards) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.frequency.value = backwards ? 180 : 460;
  o.type = 'sine';
  g.gain.setValueAtTime(0.15, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + 0.13);
}

function playScore() {
  if (!audioCtx) return;
  [523, 659, 784].forEach((freq, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    o.type = 'sine';
    const t = audioCtx.currentTime + i * 0.08;
    g.gain.setValueAtTime(0.12 * volume, t);           
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g);
    g.connect(masterGain);
    o.start(t);
    o.stop(t + 0.16);
  });
}

function playDeath() {
  if (!audioCtx) return;
  [300, 250, 180].forEach((freq, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    o.type = 'sawtooth';
    const t = audioCtx.currentTime + i * 0.1;
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t);
    o.stop(t + 0.21);
  });
}

//  CONSTANTS
const GRAVITY       = 0.38;
const JUMP_NORMAL   = -6.5;
const JUMP_MULTI    = 0.7;   // "heavy bird" multiplier for backwards mode
const PIPE_SPEED    = 2.2;
const PIPE_GAP      = 80;
const PIPE_INTERVAL = 145;   
const GAP_Y_MIN     = 60;
const GAP_Y_MAX     = H - 60 - PIPE_GAP;
const GROUND_Y      = H - 30;
const SONG_DURATION = 180;  

//  THE STATE
let volume      = 0;   
let lockedVolume= 0;   
let isBackwards = false;
let gameOver    = false;
let started     = false;

let bird, pipes, frame, pipeTimer, score, songTime;


function initGame() {
  bird = { x: 80, y: H / 2, vy: 0, w: 22, h: 18 };
  pipes       = [];
  frame       = 0;
  pipeTimer   = 0;
  score       = 0;
  songTime    = 0;
  volume      = lockedVolume;
  setMusicVolume(volume);
  gameOver    = false;
}

//  THE CONTROLLER — keyboard + touch
document.addEventListener('keydown', e => {
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(e.code)) {
    e.preventDefault();
  }
  if (!started || gameOver) return;
  if (e.code === 'Space' || e.code === 'ArrowUp') flap();
  // WITH:
  if (e.code === 'ArrowLeft')  setMode(true);
  if (e.code === 'ArrowRight' && volume < 1) setMode(false);
});

canvas.addEventListener('click', () => {
  if (started && !gameOver) flap();
});

let touchStartY = null;
canvas.addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
  if (started && !gameOver) flap();
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', e => {
  if (touchStartY === null) return;
  const dy = touchStartY - e.changedTouches[0].clientY;
  if (Math.abs(dy) > 28 && !(dy < 0 && volume >= 1)) setMode(dy < 0);
   // swipe down → heavy, up → normal
  touchStartY = null;
}, { passive: false });

const modeBtn = document.getElementById('mode-btn');
modeBtn.addEventListener('click', () => {
  if (volume >= 1) return; // locked into heavy at 100%
  setMode(!isBackwards);
});

function flap() {
  const power = isBackwards ? JUMP_NORMAL * JUMP_MULTI : JUMP_NORMAL;
  bird.vy = power;
  playFlap(isBackwards);
}

function setMode(backwards) {
  isBackwards = backwards;
  canvas.classList.toggle('inverted', isBackwards);
  modeBtn.textContent = isBackwards ? '🔊 Switch to Louder' : '🔉 Switch to Quieter';
  modeBtn.classList.toggle('heavy', isBackwards);
}

//  PIPE FACTORY
function spawnPipe() {
  const GAP_H = PIPE_GAP;   
  const SOLID = 50;          
  const TOTAL = 4 * GAP_H + 3 * SOLID; 

  const startY = Math.floor((GROUND_Y - TOTAL) / 2);

  const values = isBackwards
    ? [-1, -2, -3, -4].sort(() => Math.random() - 0.5)
    : [1, 2, 3, 4].sort(() => Math.random() - 0.5);
  
  const gaps = [];
  for (let i = 0; i < 4; i++) {
    gaps.push({
      y: startY + i * (GAP_H + SOLID),
      value: values[i]
    });
  }

  pipes.push({ x: W + 12, gaps, passed: false });
}

//  UPDATE — physics + game logic
function update() {
  if (!started || gameOver) return;

  frame++;
  pipeTimer++;
  songTime = Math.min(SONG_DURATION, songTime + 1 / 60);

  // ── Bird physics ──
  bird.vy += GRAVITY;
  bird.y  += bird.vy;

  if (bird.y < 0) { bird.y = 0; bird.vy = 0; }

  if (bird.y + bird.h >= GROUND_Y) {
    triggerDeath();
    return;
  }
  bird.onGround = false;

  if (pipeTimer >= PIPE_INTERVAL) {
    spawnPipe();
    pipeTimer = 0;
  }

  for (let i = pipes.length - 1; i >= 0; i--) {
    const p = pipes[i];
    const PW = 24;  
    p.x -= PIPE_SPEED;

    // Volume unlock — apply value of gap the bird flew through
    if (!p.passed && p.x + PW < bird.x) {
      p.passed = true;
      const birdCY = bird.y + bird.h / 2;
      const chosenGap = p.gaps.find(g => birdCY >= g.y && birdCY <= g.y + PIPE_GAP);
      const gainPct = chosenGap ? chosenGap.value : 0;

      volume = isBackwards
        ? Math.max(0, lockedVolume + gainPct / 100)
        : Math.min(1, lockedVolume + gainPct / 100);

      lockedVolume = volume;
      if (volume >= 1) {
        setMode(true);
      }
      score++;
      setMusicVolume(volume);
      playScore();
    }

    if (p.x < -PW - 6) { pipes.splice(i, 1); continue; }

    // Collision detection — safe only if inside one of the gaps
    const bx = bird.x, by = bird.y, bw = bird.w, bh = bird.h;
    if (bx + bw > p.x && bx < p.x + PW) {
      const inAGap = p.gaps.some(g => by >= g.y && by + bh <= g.y + PIPE_GAP);
      if (!inAGap) {
        triggerDeath();
        return;
      }
    }
  }

  const pct = Math.round(volume * 100);
  volDisplay.textContent = `VOL ${pct}%`;
  trackFill.style.width  = pct + '%';

  const elapsed = Math.floor(songTime * (pct / 100));
  trackPos.textContent   = `${fmtTime(elapsed)} / ${fmtTime(SONG_DURATION)}`;
}

//  THE RENDERER — draws everything each frame

// Colors
const COL = {
  skyTop  : '#87CEEB',
  skyBot  : '#c8e8f4',
  cloud   : 'rgba(255,255,255,0.72)',
  pipeG   : '#4a9f4a',
  pipeDark: '#2d6e2d',
  grass   : '#5a9e3a',
  dirt    : '#8B6914',
  birdNorm: '#f5d73c',
  birdHvy : '#e87c3a',
  birdDark: '#e8b800',
  birdHvyD: '#c05a20',
};

// Simple cloud offsets (static seed, shifted by frame)
const CLOUD_SEEDS = [
  { x: 60,  y: 38, r: 18, speed: 0.4 },
  { x: 190, y: 28, r: 14, speed: 0.25 },
  { x: 310, y: 45, r: 16, speed: 0.35 },
  { x: 420, y: 32, r: 13, speed: 0.2  },
];

function drawCloud(cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx,      cy,      r,          0, Math.PI * 2);
  ctx.arc(cx + r,  cy - r * 0.45, r * 0.8, 0, Math.PI * 2);
  ctx.arc(cx + r * 2, cy, r * 0.9,          0, Math.PI * 2);
  ctx.fill();
}

function drawPipe(p) {
  const PW = 36, CAPX = 3, CAP = 6;
  const cx = p.x + PW / 2;

  const solidSections = [];
  let cursor = 0;
  p.gaps.forEach(g => {
    if (g.y > cursor) solidSections.push({ y: cursor, h: g.y - cursor });
    cursor = g.y + PIPE_GAP;
  });

  if (cursor < GROUND_Y) solidSections.push({ y: cursor, h: GROUND_Y - cursor });

  solidSections.forEach(s => {
    ctx.fillStyle = COL.pipeG;
    ctx.fillRect(p.x, s.y, PW, s.h);
  });

  // Caps and labels for each gap
  p.gaps.forEach(g => {
    // Top cap
    ctx.fillStyle = COL.pipeDark;
    ctx.fillRect(p.x - CAPX, g.y - CAP, PW + CAPX * 2, CAP);
    // Bottom cap
    ctx.fillStyle = COL.pipeDark;
    ctx.fillRect(p.x - CAPX, g.y + PIPE_GAP, PW + CAPX * 2, CAP);

    // Label
    if (!p.passed && p.x > 0 && p.x < W) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 10px "Courier New"';
      ctx.textAlign = 'center';
      ctx.fillText(`${g.value > 0 ? '+' : ''}${g.value}%`, cx, g.y + PIPE_GAP / 2 + 4);    
    }
  });
}

function drawBird() {
  const { x, y, w, h, vy } = bird;
  const cx = x + w / 2, cy = y + h / 2;
  const bodyColor = isBackwards ? COL.birdHvy  : COL.birdNorm;
  const wingColor = isBackwards ? COL.birdHvyD : COL.birdDark;

  // Slight rotation based on velocity
  const angle = Math.max(-0.4, Math.min(0.55, vy * 0.04));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Body
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wing (animated bob)
  ctx.fillStyle = wingColor;
  ctx.beginPath();
  const wingBob = Math.sin(frame * 0.3) * 2.5;
  ctx.ellipse(-w * 0.12, wingBob, w * 0.26, h * 0.18, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eye white
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(w * 0.22, -h * 0.14, 4, 0, Math.PI * 2);
  ctx.fill();
  // Pupil
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(w * 0.24, -h * 0.12, 2, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = '#f07a1a';
  ctx.beginPath();
  ctx.moveTo(w * 0.5,       -h * 0.06);
  ctx.lineTo(w * 0.5 + 7,    h * 0.0);
  ctx.lineTo(w * 0.5,        h * 0.1);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawVolBar() {
  const bx = bird.x - 2, by = bird.y - 12, bw = bird.w + 4, bh = 5;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(bx, by, bw, bh);
  const col = volume > 0.6 ? '#4ade80' : volume > 0.3 ? '#facc15' : '#f87171';
  ctx.fillStyle = col;
  ctx.fillRect(bx, by, bw * volume, bh);
}

function render() {
  // Sky
  ctx.fillStyle = COL.skyTop;
  ctx.fillRect(0, 0, W, H);

  // Clouds
  ctx.fillStyle = COL.cloud;
  CLOUD_SEEDS.forEach(c => {
    const ox = ((frame * c.speed) % (W + 80));
    // Wrap: two copies to fill seamlessly
    drawCloud(((c.x - ox) % (W + 80) + W + 80) % (W + 80) - 40, c.y, c.r);
  });

  // Pipes
  pipes.forEach(drawPipe);

  // Ground
  ctx.fillStyle = COL.grass;
  ctx.fillRect(0, GROUND_Y, W, 10);
  ctx.fillStyle = COL.dirt;
  ctx.fillRect(0, GROUND_Y + 10, W, H - GROUND_Y - 10);

  // Bird
  drawBird();

  // Vol bar above bird
  drawVolBar();

  // Score (top-right)
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.font = '700 13px "Courier New"';
  ctx.textAlign = 'right';
  ctx.fillText(`${score} pts`, W - 10, 22);
}

//  GAME OVER
function triggerDeath() {
  gameOver = true;
  playDeath();
  setMusicVolume(0);

  overlay.innerHTML = `
      <h2>Crashed!</h2>
      <p class="score-line">Volume locked at ${Math.round(lockedVolume * 100)}%</p>
      <p>Score: ${score} pipe${score !== 1 ? 's' : ''} passed</p>
      <p>Choose your goal:</p>
      <div style="display:flex; gap:12px; margin-top:4px;">
        <button class="restart-btn" id="btn-louder-restart">🔊 Louder</button>
        <button class="restart-btn" id="btn-quieter-restart">🔉 Quieter</button>
      </div>
    `;
    overlay.style.display = 'flex';

    document.getElementById('btn-louder-restart').addEventListener('click', () => {
      overlay.style.display = 'none';
      setMode(false);
      initGame();
      started = true;
    });

    document.getElementById('btn-quieter-restart').addEventListener('click', () => {
      overlay.style.display = 'none';
      setMode(true);
      initGame();
      started = true;
    });
}

//  MAIN LOOP
function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}

//  START
document.getElementById('btn-louder').addEventListener('click', () => {
  initAudio();
  overlay.style.display = 'none';
  setMode(false);
  initGame();
  started = true;
  loop();
});

document.getElementById('btn-quieter').addEventListener('click', () => {
  initAudio();
  overlay.style.display = 'none';
  setMode(true);
  initGame();
  started = true;
  loop();
});

// Draw a static first frame while waiting
initGame();
render();

//  UTILITY
function fmtTime(totalSeconds) {
  const s = Math.floor(Math.max(0, totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
