"use strict";

const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.querySelector("#score");
const levelEl = document.querySelector("#level");
const shieldEl = document.querySelector("#shield");
const answerEl = document.querySelector("#answerOutput");
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
  answer: "",
  spawnTimer: 0,
  missionTime: 0,
  waveTime: 0,
  drones: [],
  shots: [],
  explosions: [],
  stars: [],
  stationHits: [],
  facts: [],
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
  state.running = true;
  state.paused = false;
  state.lastTime = performance.now();
  state.score = 0;
  state.level = 1;
  state.shield = 100;
  state.answer = "";
  state.spawnTimer = 1.6;
  state.missionTime = 0;
  state.waveTime = 0;
  state.drones = [];
  state.shots = [];
  state.explosions = [];
  state.stationHits = [];
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
  answerEl.textContent = state.answer || "-";
  pauseButton.setAttribute("aria-label", state.paused ? "Weiter" : "Pause");
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
  const size = Math.min(86, Math.max(62, width * 0.13));
  const x = Math.random() * (width - size * 1.4) + size * 0.7;
  const speed = 16 + state.level * 5.5 + Math.random() * 8;
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
  if (state.spawnTimer <= 0) {
    spawnDrone();
    state.spawnTimer = Math.max(0.78, 2.95 - state.level * 0.14 - Math.random() * 0.35);
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
    if (drone.y + drone.size * 0.55 >= height - 38) {
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

function fire() {
  if (!state.running || state.paused || !state.answer) return;
  const value = Number(state.answer);
  const cannonX = canvas.clientWidth / 2;
  const cannonY = canvas.clientHeight - 26;
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
    state.score = Math.max(0, state.score - Math.min(25, Math.abs(delta) * 2));
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
  state.score += 100 + state.level * 12 + Math.max(0, Math.floor((canvas.clientHeight - drone.y) / 10));
  state.explosions.push({ x: drone.x, y: drone.y, size: drone.size, t: 0, life: 0.55, good: true });
}

function missFact(fact) {
  fact.misses += 1;
  fact.streak = 0;
}

function damageStation(drone) {
  const grace = state.missionTime < 7 ? 0.58 : 1;
  state.shield -= 6 * grace;
  state.stationHits.push({ x: drone.x, t: 0 });
  state.explosions.push({ x: drone.x, y: canvas.clientHeight - 34, size: drone.size * 1.25, t: 0, life: 0.7, good: false });
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
  drawSpace(width, height);
  drawStation(width, height);
  for (const drone of state.drones) drawDrone(drone);
  for (const shot of state.shots) drawShot(shot);
  for (const explosion of state.explosions) drawExplosion(explosion);
  drawCannon(width, height);
}

function drawSpace(width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#07131f");
  gradient.addColorStop(0.58, "#0a1722");
  gradient.addColorStop(1, "#17141b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  for (const star of state.stars) {
    ctx.fillStyle = `rgba(219, 248, 255, ${star.alpha})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStation(width, height) {
  const baseY = height - 44;
  ctx.fillStyle = "#1c2d38";
  ctx.fillRect(0, baseY, width, 44);
  ctx.fillStyle = "#2d4652";
  for (let x = 0; x < width; x += 36) {
    ctx.fillRect(x + 5, baseY + 10, 22, 13);
  }
  ctx.fillStyle = `rgba(111, 240, 167, ${0.18 + state.shield / 180})`;
  ctx.fillRect(0, baseY - 7, width * Math.max(0, state.shield / 100), 4);
  for (const hit of state.stationHits) {
    ctx.fillStyle = `rgba(255, 92, 122, ${1 - hit.t / 1.2})`;
    ctx.fillRect(hit.x - 22, baseY + 4, 44, 28);
  }
}

function drawCannon(width, height) {
  const x = width / 2;
  const y = height - 34;
  ctx.fillStyle = "#56d8ff";
  ctx.beginPath();
  ctx.moveTo(x, y - 32);
  ctx.lineTo(x - 18, y + 8);
  ctx.lineTo(x + 18, y + 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#6ff0a7";
  ctx.fillRect(x - 30, y + 8, 60, 12);
}

function drawDrone(drone) {
  const x = drone.x;
  const y = drone.y;
  const s = drone.size;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#3f5361";
  ctx.strokeStyle = "#56d8ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.55, s * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ff5c7a";
  ctx.beginPath();
  ctx.arc(0, -s * 0.03, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#eaf8ff";
  ctx.font = `800 ${Math.max(18, s * 0.24)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${drone.fact.a}x${drone.fact.b}`, 0, s * 0.02);
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(-s * 0.52, s * 0.2, s * 0.2, s * 0.09);
  ctx.fillRect(s * 0.32, s * 0.2, s * 0.2, s * 0.09);
  ctx.restore();
}

function drawShot(shot) {
  const ease = 1 - Math.pow(1 - shot.t, 3);
  const x = shot.x0 + (shot.x1 - shot.x0) * ease;
  const y = shot.y0 + (shot.y1 - shot.y0) * ease;
  ctx.strokeStyle = shot.hit ? "#6ff0a7" : "#ffd166";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(shot.x0, shot.y0);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.fillStyle = shot.hit ? "#ffffff" : "#ff5c7a";
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawExplosion(explosion) {
  const p = explosion.t / explosion.life;
  const radius = explosion.size * (0.25 + p * 0.75);
  ctx.save();
  ctx.globalAlpha = 1 - p;
  ctx.fillStyle = explosion.good ? "#6ff0a7" : "#ff5c7a";
  ctx.beginPath();
  ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.arc(explosion.x, explosion.y, radius * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function addDigit(digit) {
  if (!state.running) resetGame();
  if (state.answer.length < 3) {
    state.answer += digit;
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
