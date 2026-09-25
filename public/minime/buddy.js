/* MiniMe buddy engine — draws and animates the pixel character on a 32x32 grid. */

const Buddy = (() => {
  const GRID = 32;
  let canvas, ctx, scale;
  let frame = 0;
  let activity = 'idle';       // idle | gym | study | run | eat | sleep | meditate | work
  let mood = 'normal';         // normal | happy | tired
  let celebrateUntil = 0;
  let avatarHead = null;       // offscreen canvas holding the pixel face, or null

  const palette = {
    skin: '#eeb98a',
    hair: '#3b2a1a',
    shirt: '#3b5dc9',
    pants: '#29366f',
    shoe: '#1a1c2c',
  };

  function setPalette(p) { Object.assign(palette, p); }

  // head: {w, h, data:[r,g,b,a,...]} — rendered once into an offscreen canvas
  // so drawHead can blit it crisply at any scale without per-pixel rounding seams.
  function setAvatarHead(head) {
    if (!head) { avatarHead = null; return; }
    const c = document.createElement('canvas');
    c.width = head.w;
    c.height = head.h;
    const id = new ImageData(new Uint8ClampedArray(head.data), head.w, head.h);
    c.getContext('2d').putImageData(id, 0, 0);
    avatarHead = c;
  }
  function setActivity(a) { activity = a || 'idle'; }
  function setMood(m) { mood = m; }
  function celebrate(ms) { celebrateUntil = Date.now() + (ms || 6000); }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    scale = canvas.width / GRID;
    setInterval(() => { frame = 1 - frame; draw(); }, 450);
    draw();
  }

  // draw one logical pixel (or rect) in grid coords
  function px(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x * scale), Math.round(y * scale), Math.ceil(w * scale), Math.ceil(h * scale));
  }

  function tint(color, amt) {
    // amt < 0 darkens toward gray (tired), > 0 lightens; accepts #hex or rgb()
    let r, g, b;
    if (color[0] === '#') {
      const n = parseInt(color.slice(1), 16);
      r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
    } else {
      const m = color.match(/\d+/g) || [128, 128, 128];
      r = +m[0]; g = +m[1]; b = +m[2];
    }
    if (amt < 0) {
      const gray = (r + g + b) / 3;
      const k = -amt;
      r = r + (gray - r) * k; g = g + (gray - g) * k; b = b + (gray - b) * k;
      r *= 0.8; g *= 0.8; b *= 0.8;
    } else {
      r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt;
    }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  function colors() {
    const tired = mood === 'tired';
    const f = (c) => (tired ? tint(c, -0.55) : c);
    return {
      skin: f(palette.skin),
      hair: f(palette.hair),
      shirt: f(palette.shirt),
      pants: f(palette.pants),
      shoe: f(palette.shoe),
    };
  }

  // Head occupies an 8x8 box whose top-left is (hx, hy).
  function drawHead(hx, hy, c, sleeping) {
    if (avatarHead) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (mood === 'tired') ctx.filter = 'grayscale(70%) brightness(75%)';
      ctx.drawImage(
        avatarHead,
        Math.round(hx * scale), Math.round(hy * scale),
        Math.round(8 * scale), Math.round(8 * scale)
      );
      ctx.restore();
      return;
    }
    // default face
    px(hx, hy + 1, 8, 7, c.skin);          // face
    px(hx, hy, 8, 2, c.hair);              // hair top
    px(hx, hy + 2, 1, 2, c.hair);          // sideburns
    px(hx + 7, hy + 2, 1, 2, c.hair);
    if (sleeping) {
      px(hx + 2, hy + 4, 2, 1, '#111');    // closed eyes
      px(hx + 5, hy + 4, 2, 1, '#111');
    } else {
      const blink = frame === 1 && activity === 'idle';
      px(hx + 2, hy + 4, 1, blink ? 1 : 2, '#111');
      px(hx + 5, hy + 4, 1, blink ? 1 : 2, '#111');
    }
    // mouth
    if (mood === 'happy') px(hx + 3, hy + 6, 2, 1, '#7a2f2f');
    else if (mood === 'tired') px(hx + 3, hy + 7, 2, 1, '#5a2323');
    else px(hx + 3, hy + 6, 2, 1, '#8a4b4b');
  }

  function drawShadow(cx, y, w) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx * scale, y * scale, w * scale, 1.2 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function text(str, x, y, size, color) {
    ctx.fillStyle = color || '#fff';
    ctx.font = `${size * scale}px monospace`;
    ctx.fillText(str, x * scale, y * scale);
  }

  /* ---------- rooms ---------- */

  function band(y0, y1, color) { px(0, y0, GRID, y1 - y0, color); }

  function roomOutdoor(bright) {
    band(0, 8, bright ? '#3b5dc9' : '#29366f');
    band(8, 14, bright ? '#4a6fd9' : '#334b9e');
    band(14, 24, bright ? '#5d84e8' : '#3b5dc9');
    band(24, 27, '#38b764');
    band(27, 32, '#257953');
    // sun + clouds
    px(25, 3, 4, 4, '#ffcd75');
    px(4, 5, 6, 2, 'rgba(255,255,255,0.75)');
    px(6, 4, 3, 1, 'rgba(255,255,255,0.75)');
    px(18, 8, 5, 1.5, 'rgba(255,255,255,0.55)');
  }

  function roomRun() {
    roomOutdoor(true);
    // trees at the edges
    px(2, 17, 2, 8, '#6b4f35');
    px(0, 12, 6, 6, '#2e9e55');
    px(28, 17, 2, 8, '#6b4f35');
    px(26, 12, 6, 6, '#2e9e55');
    // running path
    band(27, 30, '#c2a35c');
  }

  function roomGym() {
    band(0, 24, '#3a3f5c');
    band(0, 1.5, '#2e3249');
    band(24, 32, '#4a4e69');
    px(0, 24, GRID, 0.6, '#2e3249');
    // dumbbell rack (left)
    px(2, 18, 8, 1, '#6a6f8c');
    px(2, 19, 1, 6, '#6a6f8c');
    px(9, 19, 1, 6, '#6a6f8c');
    px(3, 16.5, 2, 1.5, '#b13e53');
    px(6.5, 16.5, 2, 1.5, '#ffcd75');
    // motivational poster (right)
    px(24, 6, 6, 7, '#ffcd75');
    px(25, 7.5, 4, 1, '#b13e53');
    px(25, 9.5, 4, 1, '#3a3f5c');
    px(25, 11, 3, 1, '#3a3f5c');
  }

  function roomStudy() {
    band(0, 24, '#5c4632');
    band(24, 32, '#8a6b45');
    px(0, 24, GRID, 0.6, '#6b5236');
    // bookshelf (left)
    px(2, 6, 8, 16, '#4a3626');
    for (let s = 0; s < 3; s++) {
      const sy = 8 + s * 5;
      px(3, sy, 6, 3.4, '#3a2a1d');
      px(3.4, sy + 0.4, 1.2, 3, '#b13e53');
      px(4.8, sy + 0.4, 1.2, 3, '#3b5dc9');
      px(6.2, sy + 0.4, 1.2, 3, '#38b764');
      px(7.6, sy + 0.4, 1, 3, '#ffcd75');
    }
    // lamp (right)
    px(26, 12, 1, 10, '#3a2a1d');
    px(24, 9, 5, 3, '#ffcd75');
    px(25, 12, 3, 1, 'rgba(255,205,117,0.35)');
  }

  function roomWork() {
    band(0, 24, '#2f3350');
    band(24, 32, '#3c3f58');
    px(0, 24, GRID, 0.6, '#262a42');
    // window with night city (right)
    px(22, 5, 8, 9, '#1a1c2c');
    px(21.5, 4.5, 9, 0.7, '#4a4e69');
    px(21.5, 13.8, 9, 0.7, '#4a4e69');
    px(23, 9, 2, 5, '#252a44');
    px(26, 7, 2.5, 7, '#252a44');
    px(23.5, 10, 0.7, 0.7, '#ffcd75');
    px(26.6, 8, 0.7, 0.7, '#ffcd75');
    px(27.6, 11, 0.7, 0.7, '#ffcd75');
    // wall clock (left)
    px(4, 6, 4, 4, '#e8e4d8');
    px(5.7, 6.7, 0.7, 2, '#111');
  }

  function roomKitchen() {
    band(0, 24, '#3f5c5e');
    band(24, 32, '#5d6f71');
    // tiled floor hint
    for (let x = 0; x < GRID; x += 4) px(x, 27, 2, 0.5, 'rgba(255,255,255,0.12)');
    // counter with pot (left)
    px(1, 17, 9, 1.2, '#8a6b45');
    px(1, 18.2, 9, 7, '#6b5236');
    px(3, 14.5, 4, 2.5, '#4a4e69');
    px(2.5, 14, 5, 0.8, '#6a6f8c');
    px(4, 12.8, 1, 1.2, 'rgba(255,255,255,0.4)'); // steam
    // shelf with jars (right)
    px(23, 8, 7, 1, '#6b5236');
    px(24, 5.5, 1.6, 2.5, '#ffcd75');
    px(26.4, 5.8, 1.6, 2.2, '#38b764');
    px(28.6, 5.5, 1.2, 2.5, '#b13e53');
  }

  function roomBedroom() {
    band(0, 24, '#1c2140');
    band(24, 32, '#2a2f55');
    // window with moon and stars
    px(22, 4, 8, 8, '#0e1024');
    px(21.5, 3.5, 9, 0.6, '#3c3f58');
    px(21.5, 11.9, 9, 0.6, '#3c3f58');
    px(27, 5.5, 2, 2, '#e8e4d8');
    px(23.5, 7, 0.6, 0.6, '#e8e4d8');
    px(25, 9.5, 0.6, 0.6, '#e8e4d8');
    px(3, 5, 0.6, 0.6, '#8b93af');
    px(8, 8, 0.6, 0.6, '#8b93af');
    // rug
    px(6, 26, 20, 3, 'rgba(177,62,83,0.35)');
  }

  function roomZen() {
    band(0, 24, '#43375c');
    band(24, 32, '#584a76');
    px(0, 24, GRID, 0.6, '#382e4e');
    // plants
    px(3, 20, 3, 4, '#8a6b45');
    px(2, 15, 5, 5, '#38b764');
    px(26, 20, 3, 4, '#8a6b45');
    px(25, 15, 5, 5, '#2e9e55');
    // candles
    px(9, 22.5, 1.4, 2.5, '#e8e4d8');
    px(9.3, 21.5, 0.8, 1, '#ffcd75');
    px(21.6, 22.5, 1.4, 2.5, '#e8e4d8');
    px(21.9, 21.5, 0.8, 1, '#ffcd75');
  }

  function drawRoom(act) {
    switch (act) {
      case 'gym': roomGym(); break;
      case 'run': roomRun(); break;
      case 'study': roomStudy(); break;
      case 'work': roomWork(); break;
      case 'eat': roomKitchen(); break;
      case 'sleep': roomBedroom(); break;
      case 'meditate': roomZen(); break;
      default: roomOutdoor(false);
    }
  }

  /* ---------- poses ---------- */

  function poseStand(c, opts = {}) {
    const bob = opts.noBob ? 0 : frame;          // gentle idle bob
    const slouch = mood === 'tired' ? 1 : 0;
    const hy = 6 + bob + slouch;
    drawShadow(16, 29.5, 5);
    // legs
    px(13, 22 + bob, 2, 6, c.pants);
    px(17, 22 + bob, 2, 6, c.pants);
    px(13, 28 + bob, 3, 1.5, c.shoe);
    px(17, 28 + bob, 3, 1.5, c.shoe);
    // torso
    px(12, 14 + bob + slouch, 8, 8, c.shirt);
    // arms
    if (mood === 'happy') {
      // flex! arms up like a strongman
      px(10, 12 + bob, 2, 4, c.shirt);
      px(20, 12 + bob, 2, 4, c.shirt);
      px(10, 10 + bob, 2, 2, c.skin);
      px(20, 10 + bob, 2, 2, c.skin);
      if (frame === 0) { text('✦', 7, 12, 2.2, '#ffcd75'); text('✦', 23, 10, 2.2, '#ffcd75'); }
      else { text('✦', 22, 14, 2.2, '#ffcd75'); text('✦', 8, 9, 2.2, '#ffcd75'); }
    } else if (mood === 'tired') {
      px(10, 15 + bob + slouch, 2, 6, c.shirt);
      px(20, 15 + bob + slouch, 2, 6, c.shirt);
      // sweat drop
      px(23, 8 + bob, 1, 1.5, '#7ec8ff');
    } else {
      px(10, 15 + bob, 2, 6, c.shirt);
      px(20, 15 + bob, 2, 6, c.shirt);
      px(10, 21 + bob, 2, 1, c.skin);
      px(20, 21 + bob, 2, 1, c.skin);
    }
    drawHead(12, hy, c);
  }

  function poseGym(c) {
    const up = frame === 0;
    drawShadow(16, 29.5, 6);
    // legs, slightly wide
    px(12, 22, 2, 6, c.pants);
    px(18, 22, 2, 6, c.pants);
    px(11.5, 28, 3, 1.5, c.shoe);
    px(18, 28, 3, 1.5, c.shoe);
    px(12, 14, 8, 8, c.shirt);
    drawHead(12, 6, c);
    const barY = up ? 3 : 12;
    // arms
    if (up) {
      px(10, 8, 2, 6, c.skin);
      px(20, 8, 2, 6, c.skin);
    } else {
      px(10, 12, 2, 4, c.skin);
      px(20, 12, 2, 4, c.skin);
    }
    // barbell
    px(6, barY + 0.5, 20, 1, '#9aa0b4');
    px(5, barY - 1, 3, 4, '#4a4e69');
    px(24, barY - 1, 3, 4, '#4a4e69');
    if (up) text('!', 26, 8, 2.5, '#ffcd75');
  }

  function poseRun(c) {
    const a = frame === 0;
    drawShadow(16, 29.5, 6);
    // legs alternating
    if (a) {
      px(11, 22, 2, 5, c.pants); px(10, 27, 3, 1.5, c.shoe);
      px(18, 22, 3, 3, c.pants); px(20, 24, 3, 1.5, c.shoe);
    } else {
      px(18, 22, 2, 5, c.pants); px(18, 27, 3, 1.5, c.shoe);
      px(11, 22, 3, 3, c.pants); px(9, 24, 3, 1.5, c.shoe);
    }
    px(12, 14, 8, 8, c.shirt);
    // arms pumping
    if (a) { px(9, 14, 3, 2, c.skin); px(20, 17, 3, 2, c.skin); }
    else { px(9, 17, 3, 2, c.skin); px(20, 14, 3, 2, c.skin); }
    drawHead(12, 6, c);
    // speed lines
    text('~', a ? 5 : 6, 16, 2.5, 'rgba(255,255,255,0.6)');
    text('~', a ? 4 : 5, 20, 2.5, 'rgba(255,255,255,0.4)');
  }

  function poseStudy(c) {
    drawShadow(16, 29.5, 6);
    // sitting: legs forward
    px(13, 24, 6, 2, c.pants);
    px(19, 24, 2, 4, c.pants);
    px(18.5, 28, 3, 1.5, c.shoe);
    px(12, 16, 8, 8, c.shirt);
    drawHead(12, 8 + (frame ? 0.5 : 0), c);
    // arms holding book
    px(10, 19, 2, 3, c.skin);
    px(20, 19, 2, 3, c.skin);
    // book
    px(9, 21, 6.5, 4.5, '#e8e4d8');
    px(16.5, 21, 6.5, 4.5, frame ? '#e8e4d8' : '#d8d2c0');
    px(15.5, 20.5, 1, 5.5, '#b13e53');
    // idea sparks
    if (frame === 0) text('?', 23, 8, 2.2, '#ffcd75');
    else text('!', 23, 8, 2.2, '#38b764');
  }

  function poseWork(c) {
    drawShadow(16, 29.5, 6);
    px(13, 24, 6, 2, c.pants);
    px(19, 24, 2, 4, c.pants);
    px(18.5, 28, 3, 1.5, c.shoe);
    px(12, 16, 8, 8, c.shirt);
    drawHead(12, 8, c);
    // laptop
    px(8, 19, 7, 5, '#4a4e69');
    px(8.7, 19.7, 5.6, 3.6, frame ? '#7ec8ff' : '#a8dcff');
    px(8, 24, 8, 1, '#33364f');
    // typing hands
    px(15, 23 + (frame ? 0.6 : 0), 2, 1.5, c.skin);
    px(17.5, 23 + (frame ? 0 : 0.6), 2, 1.5, c.skin);
  }

  function poseEat(c) {
    drawShadow(16, 29.5, 5);
    px(13, 22, 2, 6, c.pants);
    px(17, 22, 2, 6, c.pants);
    px(13, 28, 3, 1.5, c.shoe);
    px(17, 28, 3, 1.5, c.shoe);
    px(12, 14, 8, 8, c.shirt);
    drawHead(12, 6, c);
    // one arm raising food to mouth
    if (frame === 0) {
      px(20, 15, 2, 5, c.skin);
      px(20.5, 20, 2.5, 2.5, '#ffcd75'); // food in hand
    } else {
      px(19, 11, 2, 4, c.skin);
      px(19, 9.5, 2.5, 2.5, '#ffcd75'); // food at mouth
      text('♥', 24, 9, 2, '#ff7a9e');
    }
    px(10, 15, 2, 6, c.shirt);
  }

  function poseSleep(c) {
    drawShadow(16, 28.5, 9);
    // lying down
    px(8, 22, 16, 4, c.shirt);   // body
    px(22, 23, 5, 3, c.pants);   // legs
    px(26.5, 22.5, 2, 3.5, c.shoe);
    drawHead(4, 18, c, true);
    // blanket
    px(12, 21, 14, 6, 'rgba(177,62,83,0.55)');
    text('z', 10 + (frame ? 1 : 0), 14, 2.5, '#cdd5f0');
    text('Z', 13 + (frame ? 1 : 0), 11, 3, '#cdd5f0');
  }

  function poseMeditate(c) {
    const float = frame === 0 ? 0 : -0.8;
    drawShadow(16, 29.5, 6);
    // crossed legs
    px(10, 25 + float, 12, 2.5, c.pants);
    px(12, 16 + float, 8, 9, c.shirt);
    // hands on knees
    px(9.5, 23 + float, 2, 2, c.skin);
    px(20.5, 23 + float, 2, 2, c.skin);
    drawHead(12, 8 + float, c, true);
    text('☮', 24, 10, 2.2, 'rgba(255,255,255,0.6)');
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const c = colors();
    const celebrating = Date.now() < celebrateUntil;
    const prevMood = mood;
    if (celebrating) mood = 'happy';

    drawRoom(celebrating ? 'idle' : activity);

    switch (celebrating ? 'idle' : activity) {
      case 'gym': poseGym(c); break;
      case 'run': poseRun(c); break;
      case 'study': poseStudy(c); break;
      case 'work': poseWork(c); break;
      case 'eat': poseEat(c); break;
      case 'sleep': poseSleep(c); break;
      case 'meditate': poseMeditate(c); break;
      default: poseStand(colors());
    }
    mood = prevMood;
  }

  return { init, setActivity, setMood, setPalette, setAvatarHead, celebrate, draw };
})();
