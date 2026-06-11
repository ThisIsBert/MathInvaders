"use strict";

const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.querySelector("#score");
const levelEl = document.querySelector("#level");
const shieldEl = document.querySelector("#shield");
const streakEl = document.querySelector("#streak");
const fireButton = document.querySelector("#fireButton");
const startOverlay = document.querySelector("#startOverlay");
const pauseOverlay = document.querySelector("#pauseOverlay");
const gameOverOverlay = document.querySelector("#gameOverOverlay");
const finalScoreEl = document.querySelector("#finalScore");
const pauseButton = document.querySelector("#pauseButton");

const state = {
  running: false,
  paused: false,
  lastTime: 0,
  score: 0,
  level: 1,
  shield: 100,
  streak: 0,
  answer: "",
  spawnTimer: 0,
  missionTime: 0,
  waveTime: 0,
  drones: [],
  shots: [],
  explosions: [],
  stars: [],
  stationHits: [],
  stationDamage: [],
  facts: [],
  audio: null,
};

for (let a = 1; a <= 10; a += 1) {
  for (let b = 1; b <= 10; b += 1) {
    state.facts.push({ a, b, misses: 0, hits: 0, streak: 0 });
  }
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  seedStars(rect.width, rect.height);
}

function seedStars(width, height) {
  const count = Math.floor((width * height) / 8500);
  while (state.stars.length < count) {
    state.stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.7 + 0.4,
      speed: Math.random() * 18 + 8,
      alpha: Math.random() * 0.55 + 0.25,
    });
  }
  state.stars.length = count;
}

function resetGame() {
  ensureAudio();
  sound("start");
  state.running = true;
  state.paused = false;
  state.lastTime = performance.now();
  state.score = 0;
  state.level = 1;
  state.shield = 100;
  state.streak = 0;
  state.answer = "";
  state.spawnTimer = 5.2;
  state.missionTime = 0;
  state.waveTime = 0;
  state.drones = [];
  state.shots = [];
  state.explosions = [];
  state.stationHits = [];
  state.stationDamage = [];
  state.facts.forEach((fact) => {
    fact.misses = 0;
    fact.hits = 0;
    fact.streak = 0;
  });
  updateHud();
  setOverlay(startOverlay, false);
  setOverlay(pauseOverlay, false);
  setOverlay(gameOverOverlay, false);
  requestAnimationFrame(loop);
}

function setOverlay(element, visible) {
  element.classList.toggle("is-visible", visible);
}

function updateHud() {
  scoreEl.textContent = state.score.toString();
  levelEl.textContent = state.level.toString();
  shieldEl.textContent = `${Math.max(0, Math.ceil(state.shield))}%`;
  streakEl.textContent = state.streak.toString();
  fireButton.textContent = state.answer ? `Feuer ${state.answer}` : "Feuer";
  pauseButton.setAttribute("aria-label", state.paused ? "Weiter" : "Pause");
}

function ensureAudio() {
  if (state.audio) return state.audio;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  state.audio = new AudioContext();
  return state.audio;
}

function tone(frequency, duration, type = "square", gain = 0.045, delay = 0) {
  const audio = ensureAudio();
  if (!audio) return;
  if (audio.state === "suspended") audio.resume();
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  const start = audio.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope);
  envelope.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noise(duration, gain = 0.055, delay = 0) {
  const audio = ensureAudio();
  if (!audio) return;
  if (audio.state === "suspended") audio.resume();
  const sampleRate = audio.sampleRate;
  const buffer = audio.createBuffer(1, Math.max(1, sampleRate * duration), sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const source = audio.createBufferSource();
  const envelope = audio.createGain();
  const start = audio.currentTime + delay;
  envelope.gain.setValueAtTime(gain, start);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.buffer = buffer;
  source.connect(envelope);
  envelope.connect(audio.destination);
  source.start(start);
}

function sound(name) {
  if (name === "start") {
    tone(196, 0.08);
    tone(392, 0.09, "square", 0.05, 0.08);
    tone(784, 0.12, "square", 0.045, 0.17);
  }
  if (name === "tap") tone(660, 0.035, "square", 0.025);
  if (name === "fire") tone(520, 0.055, "sawtooth", 0.04);
  if (name === "hit") {
    noise(0.22, 0.08);
    tone(96, 0.14, "sawtooth", 0.065);
    tone(52, 0.2, "square", 0.04, 0.04);
    tone(1180, 0.045, "square", 0.035, 0.02);
  }
  if (name === "miss") tone(170, 0.12, "sawtooth", 0.045);
  if (name === "damage") {
    tone(90, 0.16, "sawtooth", 0.055);
    tone(65, 0.2, "square", 0.035, 0.06);
  }
}

function weightedFact() {
  let total = 0;
  const weights = state.facts.map((fact) => {
    const difficulty = Math.max(fact.a, fact.b) / 10;
    const missBias = fact.misses * 3.2;
    const successDiscount = Math.min(3, fact.streak * 0.7 + fact.hits * 0.12);
    const weight = Math.max(0.45, 1 + difficulty + missBias - successDiscount);
    total += weight;
    return weight;
  });
  let pick = Math.random() * total;
  for (let i = 0; i < weights.length; i += 1) {
    pick -= weights[i];
    if (pick <= 0) return state.facts[i];
  }
  return state.facts[state.facts.length - 1];
}

function spawnDrone() {
  const width = canvas.clientWidth;
  const fact = weightedFact();
  const size = Math.min(76, Math.max(54, width * 0.115));
  const x = Math.random() * (width - size * 1.4) + size * 0.7;
  const speed = 6 + state.level * 2.6 + Math.random() * 3.5;
  state.drones.push({
    x,
    y: -size,
    size,
    speed,
    fact,
    wobble: Math.random() * Math.PI * 2,
    answer: fact.a * fact.b,
  });
}

function loop(now) {
  if (!state.running) return;
  const dt = Math.min(0.04, (now - state.lastTime) / 1000 || 0);
  state.lastTime = now;
  if (!state.paused) update(dt);
  draw();
  requestAnimationFrame(loop);
}

function update(dt) {
  const height = canvas.clientHeight;
  state.missionTime += dt;
  state.waveTime += dt;
  state.level = Math.max(1, Math.floor(state.score / 450) + 1);
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0 && state.drones.length < maxActiveDrones()) {
    spawnDrone();
    state.spawnTimer = nextSpawnDelay();
  }

  for (const star of state.stars) {
    star.y += star.speed * dt;
    if (star.y > height) {
      star.y = 0;
      star.x = Math.random() * canvas.clientWidth;
    }
  }

  for (const drone of state.drones) {
    drone.y += drone.speed * dt;
    drone.wobble += dt * 2.7;
    drone.x += Math.sin(drone.wobble) * dt * 10;
    if (drone.y + drone.size * 0.55 >= height - stationHeight()) {
      damageStation(drone);
      missFact(drone.fact);
      drone.dead = true;
    }
  }

  for (const shot of state.shots) {
    shot.t += dt / shot.duration;
    if (shot.t >= 1) {
      if (shot.hit && shot.target && !shot.target.dead) {
        destroyDrone(shot.target);
      }
      shot.dead = true;
    }
  }

  for (const explosion of state.explosions) {
    explosion.t += dt;
  }
  state.drones = state.drones.filter((drone) => !drone.dead);
  state.shots = state.shots.filter((shot) => !shot.dead);
  state.explosions = state.explosions.filter((explosion) => explosion.t < explosion.life);
  state.stationHits = state.stationHits.filter((hit) => {
    hit.t += dt;
    return hit.t < 1.2;
  });

  if (state.shield <= 0) gameOver();
  updateHud();
}

function maxActiveDrones() {
  if (state.level < 4) return 1;
  if (state.level < 7) return 2;
  if (state.level < 10) return 3;
  return 4;
}

function nextSpawnDelay() {
  if (state.level < 3) return 6.2 + Math.random() * 1.4;
  if (state.level < 6) return 4.3 + Math.random() * 1.1;
  return Math.max(1.45, 3.35 - state.level * 0.13 + Math.random() * 0.8);
}

function stationHeight() {
  return Math.min(112, Math.max(86, canvas.clientHeight * 0.13));
}

function fire() {
  if (!state.running || state.paused || !state.answer) return;
  sound("fire");
  const value = Number(state.answer);
  const cannonX = canvas.clientWidth / 2;
  const cannonY = canvas.clientHeight - stationHeight() + 26;
  const target = targetForAnswer(value);
  if (!target) {
    state.answer = "";
    updateHud();
    return;
  }

  const delta = value - target.answer;
  const hit = delta === 0;
  const missScale = Math.min(180, Math.abs(delta) * 8 + 24);
  const targetX = hit ? target.x : target.x + Math.sign(delta || 1) * missScale;
  const targetY = target.y;
  state.shots.push({
    x0: cannonX,
    y0: cannonY,
    x1: targetX,
    y1: targetY,
    target,
    hit,
    t: 0,
    duration: hit ? 0.22 : 0.3,
  });

  if (!hit) {
    missFact(target.fact);
    state.streak = 0;
    state.score = Math.max(0, state.score - Math.min(25, Math.abs(delta) * 2));
    sound("miss");
  }
  state.answer = "";
  updateHud();
}

function targetForAnswer(value) {
  const matches = state.drones.filter((drone) => drone.answer === value);
  if (matches.length > 0) {
    return matches.reduce((best, drone) => (drone.y > best.y ? drone : best), matches[0]);
  }
  return nearestActiveDrone();
}

function nearestActiveDrone() {
  let best = null;
  for (const drone of state.drones) {
    if (!best || drone.y > best.y) best = drone;
  }
  return best;
}

function destroyDrone(drone) {
  drone.dead = true;
  drone.fact.hits += 1;
  drone.fact.streak += 1;
  state.streak += 1;
  state.score += 100 + state.level * 12 + Math.max(0, Math.floor((canvas.clientHeight - drone.y) / 10));
  state.explosions.push({ x: drone.x, y: drone.y, size: drone.size, t: 0, life: 0.55, good: true });
  if (state.streak % 10 === 0) repairStation();
  sound("hit");
}

function missFact(fact) {
  fact.misses += 1;
  fact.streak = 0;
}

function damageStation(drone) {
  const grace = state.missionTime < 18 ? 0.45 : 1;
  state.shield -= 4 * grace;
  state.streak = 0;
  state.stationHits.push({ x: drone.x, t: 0 });
  addStationDamage(drone.x);
  state.explosions.push({ x: drone.x, y: canvas.clientHeight - stationHeight() + 20, size: drone.size * 1.25, t: 0, life: 0.7, good: false });
  sound("damage");
}

function addStationDamage(x) {
  const segmentWidth = Math.max(42, canvas.clientWidth / 10);
  const index = Math.max(0, Math.min(9, Math.floor(x / segmentWidth)));
  const existing = state.stationDamage.find((damage) => damage.index === index);
  if (existing) {
    existing.level = Math.min(3, existing.level + 1);
    existing.x = x;
  } else {
    state.stationDamage.push({ index, x, level: 1 });
  }
}

function repairStation() {
  state.shield = Math.min(100, state.shield + 14);
  state.score += 250;
  state.stationDamage
    .sort((a, b) => b.level - a.level)
    .slice(0, 3)
    .forEach((damage) => {
      damage.level -= 1;
    });
  state.stationDamage = state.stationDamage.filter((damage) => damage.level > 0);
  state.explosions.push({
    x: canvas.clientWidth / 2,
    y: canvas.clientHeight - stationHeight() + 12,
    size: Math.min(140, canvas.clientWidth * 0.22),
    t: 0,
    life: 0.8,
    good: true,
  });
  tone(523, 0.09, "square", 0.045);
  tone(659, 0.09, "square", 0.045, 0.08);
  tone(784, 0.16, "square", 0.05, 0.17);
}

function gameOver() {
  state.running = false;
  finalScoreEl.textContent = `${state.score} Punkte`;
  setOverlay(gameOverOverlay, true);
}

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  drawSpace(width, height);
  for (const drone of state.drones) drawDrone(drone);
  for (const shot of state.shots) drawShot(shot);
  for (const explosion of state.explosions) drawExplosion(explosion);
  drawStation(width, height);
  drawCannon(width, height);
}

function drawSpace(width, height) {
  ctx.fillStyle = "#05020f";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#0c0b24";
  for (let y = 0; y < height; y += 18) {
    ctx.fillRect(0, y, width, 2);
  }
  ctx.fillStyle = "rgba(91, 231, 255, 0.12)";
  for (let x = 0; x < width; x += 48) {
    ctx.fillRect(x, 0, 2, height);
  }
  for (const star of state.stars) {
    ctx.fillStyle = star.alpha > 0.55 ? "#fff6d6" : "#5be7ff";
    pixelRect(star.x, star.y, star.r * 2 + 1, star.r * 2 + 1);
  }
}

function drawStation(width, height) {
  const h = stationHeight();
  const baseY = height - h;
  ctx.fillStyle = "#0a0717";
  ctx.fillRect(0, baseY - 6, width, h + 6);
  ctx.fillStyle = "#34266e";
  ctx.fillRect(0, baseY + h * 0.58, width, h * 0.42);
  ctx.fillStyle = "#5be7ff";
  ctx.fillRect(0, baseY + h * 0.58, width, 4);
  ctx.fillStyle = "#1d2f68";
  for (let x = -18; x < width; x += 72) {
    pixelRect(x, baseY + h * 0.43, 52, h * 0.42);
    pixelRect(x + 12, baseY + h * 0.27, 28, h * 0.18);
    ctx.fillStyle = "#70ff6b";
    pixelRect(x + 18, baseY + h * 0.5, 8, 8);
    pixelRect(x + 34, baseY + h * 0.58, 8, 8);
    ctx.fillStyle = "#1d2f68";
  }
  ctx.fillStyle = "#ff9b3d";
  for (let x = 18; x < width; x += 96) {
    pixelRect(x, baseY + h * 0.76, 42, 9);
  }
  drawStationDamage(width, baseY, h);
  ctx.fillStyle = "#70ff6b";
  ctx.fillRect(0, baseY - 8, width * Math.max(0, state.shield / 100), 5);
  ctx.fillStyle = "#14351f";
  ctx.fillRect(width * Math.max(0, state.shield / 100), baseY - 8, width, 5);
  for (const hit of state.stationHits) {
    ctx.fillStyle = hit.t % 0.14 < 0.07 ? "#ff315f" : "#ffe45e";
    pixelRect(hit.x - 24, baseY + h * 0.42, 48, 36);
  }
}

function drawStationDamage(width, baseY, h) {
  const segmentWidth = Math.max(42, width / 10);
  for (const damage of state.stationDamage) {
    const x = Math.min(width - 34, Math.max(6, damage.index * segmentWidth + segmentWidth * 0.18));
    const crackHeight = 16 + damage.level * 10;
    ctx.fillStyle = "#05020f";
    pixelRect(x, baseY + h * 0.5, 12 + damage.level * 7, crackHeight);
    pixelRect(x + 16, baseY + h * 0.62, 9 + damage.level * 5, 10 + damage.level * 6);
    ctx.fillStyle = damage.level >= 3 ? "#ff315f" : "#ff9b3d";
    pixelRect(x + 4, baseY + h * 0.5 + 4, 6, 6);
    if (damage.level > 1) pixelRect(x + 22, baseY + h * 0.65, 7, 7);
  }
}

function drawCannon(width, height) {
  const x = width / 2;
  const y = height - stationHeight() + 34;
  ctx.fillStyle = "#70ff6b";
  pixelRect(x - 12, y - 38, 24, 44);
  pixelRect(x - 24, y - 18, 48, 24);
  ctx.fillStyle = "#5be7ff";
  pixelRect(x - 36, y + 2, 72, 16);
  ctx.fillStyle = "#fff6d6";
  pixelRect(x - 5, y - 46, 10, 12);
}

function drawDrone(drone) {
  const x = drone.x;
  const y = drone.y;
  const s = drone.size;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.fillStyle = "#ff3fa4";
  pixelRect(-s * 0.5, -s * 0.1, s, s * 0.24);
  ctx.fillStyle = "#5be7ff";
  pixelRect(-s * 0.38, -s * 0.28, s * 0.76, s * 0.34);
  ctx.fillStyle = "#221742";
  pixelRect(-s * 0.27, -s * 0.18, s * 0.54, s * 0.18);
  ctx.fillStyle = "#ffe45e";
  pixelRect(-s * 0.52, s * 0.17, s * 0.18, s * 0.12);
  pixelRect(s * 0.34, s * 0.17, s * 0.18, s * 0.12);
  ctx.fillStyle = "#ff315f";
  pixelRect(-s * 0.16, -s * 0.42, s * 0.32, s * 0.16);
  ctx.fillStyle = "#fff6d6";
  const label = `${drone.fact.a}x${drone.fact.b}`;
  const labelSize = label.length >= 5 ? s * 0.2 : s * 0.26;
  ctx.font = `900 ${Math.max(13, labelSize)}px "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, -s * 0.06);
  ctx.restore();
}

function drawShot(shot) {
  const ease = 1 - Math.pow(1 - shot.t, 3);
  const x = shot.x0 + (shot.x1 - shot.x0) * ease;
  const y = shot.y0 + (shot.y1 - shot.y0) * ease;
  ctx.fillStyle = shot.hit ? "#70ff6b" : "#ffe45e";
  const steps = 5;
  for (let i = 0; i < steps; i += 1) {
    const p = i / steps;
    const tx = shot.x0 + (x - shot.x0) * p;
    const ty = shot.y0 + (y - shot.y0) * p;
    pixelRect(tx - 3, ty - 3, 6, 6);
  }
  ctx.fillStyle = shot.hit ? "#fff6d6" : "#ff315f";
  pixelRect(x - 5, y - 5, 10, 10);
}

function drawExplosion(explosion) {
  const p = explosion.t / explosion.life;
  const radius = explosion.size * (0.25 + p * 0.75);
  ctx.save();
  ctx.globalAlpha = 1 - p;
  ctx.fillStyle = explosion.good ? "#70ff6b" : "#ff315f";
  pixelRect(explosion.x - radius, explosion.y - 6, radius * 2, 12);
  pixelRect(explosion.x - 6, explosion.y - radius, 12, radius * 2);
  ctx.fillStyle = "#ffe45e";
  pixelRect(explosion.x - radius * 0.48, explosion.y - radius * 0.48, radius * 0.96, radius * 0.96);
  ctx.restore();
}

function pixelRect(x, y, width, height) {
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
}

function addDigit(digit) {
  if (!state.running) resetGame();
  if (state.answer.length < 3) {
    state.answer += digit;
    sound("tap");
    updateHud();
  }
}

document.querySelector(".keypad").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const key = button.dataset.key;
  if (key) addDigit(key);
  if (button.dataset.action === "clear") {
    state.answer = "";
    sound("tap");
    updateHud();
  }
  if (button.dataset.action === "fire") fire();
});

document.querySelector("#startButton").addEventListener("click", resetGame);
document.querySelector("#restartButton").addEventListener("click", resetGame);
document.querySelector("#resumeButton").addEventListener("click", () => {
  state.paused = false;
  state.lastTime = performance.now();
  setOverlay(pauseOverlay, false);
  updateHud();
});

pauseButton.addEventListener("click", () => {
  if (!state.running) return;
  state.paused = !state.paused;
  setOverlay(pauseOverlay, state.paused);
  updateHud();
});

window.addEventListener("keydown", (event) => {
  if (/^\d$/.test(event.key)) addDigit(event.key);
  if (event.key === "Backspace") {
    state.answer = state.answer.slice(0, -1);
    sound("tap");
    updateHud();
  }
  if (event.key === "Enter" || event.key === " ") fire();
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
draw();
updateHud();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js");
  });
}
