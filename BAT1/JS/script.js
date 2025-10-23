/* Mini Battlezone — Simplified
   - No assets, drawn with canvas primitives.
   - Single file: copy/paste en index.html y ejecutar.
*/

/* ========= Settings ========= */
const CANVAS_W = 900;
const CANVAS_H = 600;
const MAX_ENEMIES = 6;
const ENEMY_SPAWN_INTERVAL = 1600; // ms
const BULLET_SPEED = 8;
const PLAYER_MAX_LIVES = 3;
const VICTORY_SCORE = 50; // optional win condition

/* ========= Globals ========= */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

let lastTime = 0;
let running = false;
let player, bullets, enemies, obstacles;
let keys = {};
let mouse = { x: 0, y: 0 };
let score = 0;
let lives = PLAYER_MAX_LIVES;
let spawnTimer = 0;
let soundOn = false;

/* UI */
const scoreHud = document.getElementById('scoreHud');
const livesHud = document.getElementById('livesHud');
const waveHud = document.getElementById('waveHud');
const statusHud = document.getElementById('statusHud');
const overlay = document.getElementById('overlay');
const startScreen = document.getElementById('startScreen');
const startBtn = document.getElementById('startBtn');
const tutorialBtn = document.getElementById('tutorialBtn');
const cardTutorial = document.getElementById('cardTutorial');
const backBtn = document.getElementById('backBtn');
const muteBtn = document.getElementById('muteBtn');

/* ========= Basic sound (tiny) ========= */
const beep = (f=440, t=0.06, vol=0.02) => {
  if(!soundOn) return;
  const ctxAudio = new (window.AudioContext || window.webkitAudioContext)();
  const o = ctxAudio.createOscillator();
  const g = ctxAudio.createGain();
  o.type='sine'; o.frequency.setValueAtTime(f, ctxAudio.currentTime);
  g.gain.value = vol;
  o.connect(g); g.connect(ctxAudio.destination);
  o.start();
  o.stop(ctxAudio.currentTime + t);
};

/* ========= Utility functions ========= */
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function distance(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }
function angleTo(a,b){ return Math.atan2(b.y-a.y, b.x-a.x); }

/* ========= Game Entities ========= */
function createPlayer(){
  return {
    x: CANVAS_W/2,
    y: CANVAS_H/2,
    angle: 0,         // body rotation (radians)
    turretAngle: 0,   // turret follows mouse
    speed: 0,
    size: 26,
    turnSpeed: 0.05,  // radians per frame
    accel: 0.14,
    friction: 0.96,
    reload: 0,        // fire cooldown
    reloadTime: 18    // frames between shots
  };
}

function spawnEnemy(){
  // spawn on edge
  const edge = Math.floor(Math.random()*4);
  let x,y;
  if(edge===0){x=10; y=Math.random()*CANVAS_H}
  else if(edge===1){x=CANVAS_W-10; y=Math.random()*CANVAS_H}
  else if(edge===2){x=Math.random()*CANVAS_W; y=10}
  else {x=Math.random()*CANVAS_W; y=CANVAS_H-10}
  const sz = 18 + Math.random()*18;
  enemies.push({
    x, y,
    size: sz,
    angle: Math.random()*Math.PI*2,
    speed: 0.6 + Math.random()*0.9,
    health: 1,
    reload: Math.floor(Math.random()*60),
    color: '#33ff66'
  });
}

function createObstacles(){
  // Some rectangles placed in the map
  return [
    {x:150, y:120, w:90, h:18},
    {x:360, y:320, w:16, h:120},
    {x:650, y:90, w:140, h:18},
    {x:700, y:400, w:18, h:140},
    {x:340, y:80, w:18, h:110},
    {x:80, y:420, w:160, h:18}
  ];
}

/* ========= Game init/reset ========= */
function resetGame(){
  player = createPlayer();
  bullets = [];
  enemies = [];
  obstacles = createObstacles();
  score = 0;
  lives = PLAYER_MAX_LIVES;
  spawnTimer = 0;
  lastTime = performance.now();
  updateHUD();
}

/* ========= Input handling ========= */
window.addEventListener('keydown', e => { keys[e.key] = true; if(e.key===' '){ e.preventDefault(); }});
window.addEventListener('keyup', e => { keys[e.key] = false; });
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  mouse.x = (e.clientX - rect.left) * scaleX;
  mouse.y = (e.clientY - rect.top) * scaleY;
});
canvas.addEventListener('click', e => { playerShoot(); });

muteBtn.addEventListener('click', () => { soundOn = !soundOn; muteBtn.textContent = soundOn ? '🔊 Sonidos: On' : '🔈 Sonidos: Off'; });

startBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
  startScreen.style.display = 'none';
  statusHud.textContent = 'Estado: Jugando';
  resetGame();
  running = true;
  lastTime = performance.now();
  requestAnimationFrame(loop);
});
tutorialBtn.addEventListener('click', () => {
  document.getElementById('cardWelcome').style.display='none';
  cardTutorial.style.display='block';
});
backBtn.addEventListener('click', () => {
  document.getElementById('cardWelcome').style.display='block';
  cardTutorial.style.display='none';
});

/* ========= Shooting ========= */
function playerShoot(){
  if(!running) return;
  if(player.reload>0) return;
  // bullet starts at turret tip
  const r = player.size*0.6;
  const bx = player.x + Math.cos(player.turretAngle)*r;
  const by = player.y + Math.sin(player.turretAngle)*r;
  bullets.push({
    x: bx, y: by,
    vx: Math.cos(player.turretAngle)*BULLET_SPEED,
    vy: Math.sin(player.turretAngle)*BULLET_SPEED,
    life: 0,
    owner: 'player'
  });
  player.reload = player.reloadTime;
  beep(900,0.04,0.02);
}

/* ========= Collisions & physics helpers ========= */
function rectIntersects(r, x,y){
  return (x>r.x && x<r.x+r.w && y>r.y && y<r.y+r.h);
}
function circleRectColl(c, rect){
  // rough test: circle center to rect edges
  const cx = clamp(c.x, rect.x, rect.x+rect.w);
  const cy = clamp(c.y, rect.y, rect.y+rect.h);
  const dx = c.x - cx, dy = c.y - cy;
  return (dx*dx + dy*dy) < (c.r*c.r);
}

/* ========= Update loop ========= */
function update(dt){
  if(!running) return;

  // Player input: rotation
  if(keys['a'] || keys['ArrowLeft']) player.angle -= player.turnSpeed * (dt/16);
  if(keys['d'] || keys['ArrowRight']) player.angle += player.turnSpeed * (dt/16);

  // move forward/back
  if(keys['w'] || keys['ArrowUp']) { player.speed += player.accel; }
  if(keys['s'] || keys['ArrowDown']) { player.speed -= player.accel; }

  // clamp speed
  player.speed *= player.friction;
  // limit max speed
  player.speed = clamp(player.speed, -3.5, 4.5);

  // update position
  player.x += Math.cos(player.angle) * player.speed;
  player.y += Math.sin(player.angle) * player.speed;

  // keep inside bounds
  player.x = clamp(player.x, 12, CANVAS_W-12);
  player.y = clamp(player.y, 12, CANVAS_H-12);

  // turret aims to mouse
  player.turretAngle = angleTo(player, mouse);

  // cooldown
  if(player.reload>0) player.reload--;

  // bullets
  for(let i = bullets.length-1; i>=0; i--){
    const b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;
    b.life++;
    // remove if out of bounds or old
    if(b.x<0 || b.x>CANVAS_W || b.y<0 || b.y>CANVAS_H || b.life>120) bullets.splice(i,1);
    else {
      // check collision with enemies
      for(let j = enemies.length-1; j>=0; j--){
        const en = enemies[j];
        const dx = b.x - en.x, dy = b.y - en.y;
        if(dx*dx + dy*dy < (en.size*0.6)*(en.size*0.6)){
          // hit
          bullets.splice(i,1);
          enemies.splice(j,1);
          score += 2;
          beep(1200,0.05,0.02);
          updateHUD();
          break;
        }
      }
    }
  }

  // enemies behavior: simple pursuit of player
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i];
    // angle to player
    const ang = angleTo(e, player);
    // steer gently
    const diff = (ang - e.angle + Math.PI*3) % (Math.PI*2) - Math.PI;
    e.angle += clamp(diff, -0.03, 0.03);
    // move forward
    const mx = Math.cos(e.angle)*e.speed;
    const my = Math.sin(e.angle)*e.speed;
    e.x += mx;
    e.y += my;

    // simple collision with player (ram)
    const dx = e.x - player.x, dy = e.y - player.y;
    const dist2 = dx*dx + dy*dy;
    const minDist = (e.size*0.6 + player.size*0.6);
    if(dist2 < minDist*minDist){
      // both collide -> player damaged, enemy destroyed
      enemies.splice(i,1);
      lives--;
      beep(220,0.08,0.04);
      updateHUD();
      if(lives<=0){ gameOver(); return; }
    }

    // keep inside bounds
    if(e.x<8) e.x=8;
    if(e.x>CANVAS_W-8) e.x=CANVAS_W-8;
    if(e.y<8) e.y=8;
    if(e.y>CANVAS_H-8) e.y=CANVAS_H-8;
  }

  // spawn enemies slowly
  spawnTimer += dt;
  if(spawnTimer > ENEMY_SPAWN_INTERVAL && enemies.length < MAX_ENEMIES){
    spawnTimer = 0;
    spawnEnemy();
    updateHUD();
  }

  // score by survival time
  score += 0.001*dt;
  updateHUD();

  // win condition (optional)
  if(score >= VICTORY_SCORE){
    // you can set a win function; currently just keep playing
  }
}

/* ========= Draw loop ========= */
function drawGrid(){
  // faint grid lines (retro feel)
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 1;
  const step = 36;
  for(let x=0;x<CANVAS_W;x+=step){
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CANVAS_H); ctx.stroke();
  }
  for(let y=0;y<CANVAS_H;y+=step){
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(CANVAS_W,y); ctx.stroke();
  }
  ctx.restore();
}

function drawTank(t){
  // body
  ctx.save();
  ctx.translate(t.x,t.y);
  ctx.rotate(t.angle);
  ctx.strokeStyle = '#33ff66';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(-t.size*0.6, -t.size*0.5, t.size*1.2, t.size);
  ctx.stroke();

  // treads (lines)
  ctx.beginPath();
  ctx.moveTo(-t.size*0.6, -t.size*0.5); ctx.lineTo(-t.size*0.6, -t.size*0.2);
  ctx.moveTo(-t.size*0.6, t.size*0.2); ctx.lineTo(-t.size*0.6, t.size*0.5);
  ctx.moveTo(t.size*0.6, -t.size*0.5); ctx.lineTo(t.size*0.6, -t.size*0.2);
  ctx.moveTo(t.size*0.6, t.size*0.2); ctx.lineTo(t.size*0.6, t.size*0.5);
  ctx.stroke();

  // turret base
  ctx.beginPath();
  ctx.arc(0,0, t.size*0.32, 0, Math.PI*2);
  ctx.stroke();

  // gun barrel (drawn separately rotated by turret)
  ctx.restore();

  // turret (separate rotation so turret can aim)
  ctx.save();
  ctx.translate(t.x,t.y);
  ctx.rotate(t.turretAngle);
  ctx.strokeStyle = '#99ffbb';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-4,0);
  ctx.lineTo(t.size*0.9,0); // barrel
  ctx.stroke();
  ctx.restore();
}

function drawEnemy(e){
  ctx.save();
  ctx.translate(e.x,e.y);
  ctx.rotate(e.angle);
  ctx.strokeStyle = '#66ff88';
  ctx.lineWidth = 1.8;
  // simple triangular shape
  ctx.beginPath();
  ctx.moveTo(-e.size*0.6, -e.size*0.45);
  ctx.lineTo(e.size*0.7, 0);
  ctx.lineTo(-e.size*0.6, e.size*0.45);
  ctx.closePath(); ctx.stroke();
  ctx.restore();
}

function drawObstacles(){
  ctx.save();
  ctx.fillStyle = '#0d3';
  ctx.globalAlpha = 0.16;
  for(const r of obstacles){
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // border
    ctx.strokeStyle = '#33ff66';
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}

function drawBullets(){
  ctx.save();
  ctx.strokeStyle = '#ccffcc';
  ctx.lineWidth = 2;
  for(const b of bullets){
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx*0.3, b.y - b.vy*0.3);
    ctx.lineTo(b.x + b.vx*0.3, b.y + b.vy*0.3);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHUDOverlay(){
  ctx.save();
  // center reticle for turret
  ctx.translate(player.x, player.y);
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.arc(0,0, player.size*0.8, 0, Math.PI*2);
  ctx.strokeStyle = '#66ff88';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/* ========= Main render ========= */
function render(){
  // background (dark)
  ctx.fillStyle = '#001100';
  ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

  // grid
  drawGrid();

  // obstacles
  drawObstacles();

  // bullets behind perhaps
  drawBullets();

  // enemies
  for(const e of enemies) drawEnemy(e);

  // player tank
  drawTank(player);

  // hud overlay
  drawHUDOverlay();
}

/* ========= HUD update ========= */
function updateHUD(){
  scoreHud.textContent = 'Puntos: ' + Math.floor(score);
  livesHud.textContent = 'Vidas: ' + lives;
  waveHud.textContent = 'Enemigos: ' + enemies.length;
}

/* ========= Game over / win ========= */
function gameOver(){
  running = false;
  statusHud.textContent = 'Estado: Game Over';
  // show overlay card with restart
  const card = document.createElement('div');
  card.className = 'card';
  card.style.pointerEvents='auto';
  card.innerHTML = `<h2>💀 Derrota</h2><p class="small">Puntuación: ${Math.floor(score)}</p>`;
  const restart = document.createElement('button');
  restart.textContent = 'Reiniciar';
  restart.onclick = ()=> {
    overlay.removeChild(card);
    overlay.style.display = 'none';
    resetGame();
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
  };
  card.appendChild(restart);
  overlay.style.display='flex';
  overlay.appendChild(card);
  beep(120,0.2,0.04);
}

/* ========= Game loop ========= */
function loop(ts){
  const dt = ts - lastTime;
  lastTime = ts;
  if(running){
    update(dt);
    render();
    requestAnimationFrame(loop);
  } else {
    // draw final frame (so player sees last state)
    render();
  }
}

/* ========= Start / init ========= */
resetGame();
render(); // show initial scene

/* Optional keyboard fire with space */
window.addEventListener('keydown', (e)=> {
  if(e.key === ' '){
    playerShoot();
  }
});

/* Expose small functions for console debugging */
window._spawnEnemy = spawnEnemy;
window._reset = resetGame;