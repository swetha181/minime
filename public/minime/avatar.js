/* Photo → pixel twin. Everything runs locally on-device via canvas.
   The user frames the crop themselves: drag to position, slider to zoom. */

const Avatar = (() => {
  const SIZE = 16;      // pixel head resolution
  const PREVIEW = 120;  // preview canvas css/px size

  let img = null;       // loaded photo
  let zoom = 1.6;       // crop zoom factor (1 = whole short side)
  let ox = 0, oy = 0;   // crop top-left in image coords
  let pendingHead = null;
  let pendingPalette = null;

  const modal = () => document.getElementById('avatarModal');
  const open = () => modal().classList.remove('hidden');
  const close = () => modal().classList.add('hidden');

  /* ---------- persistence ---------- */

  function load() {
    try {
      const raw = localStorage.getItem('minime.avatar');
      if (!raw) return null;
      const head = JSON.parse(raw);
      if (head && head.data && head.data.length === head.w * head.h * 4) return head;
    } catch (e) { /* corrupted — ignore */ }
    return null;
  }

  const save = (head) => localStorage.setItem('minime.avatar', JSON.stringify(head));
  const clear = () => localStorage.removeItem('minime.avatar');

  /* ---------- crop math ---------- */

  function cropSide() {
    return Math.min(img.width, img.height) / zoom;
  }

  function clampCrop() {
    const side = cropSide();
    ox = Math.max(0, Math.min(img.width - side, ox));
    oy = Math.max(0, Math.min(img.height - side, oy));
  }

  function setZoom(z) {
    if (!img) return;
    // keep the crop centered on the same point while zooming
    const oldSide = cropSide();
    const cx = ox + oldSide / 2, cy = oy + oldSide / 2;
    zoom = Math.max(1, Math.min(6, z));
    const side = cropSide();
    ox = cx - side / 2;
    oy = cy - side / 2;
    clampCrop();
    renderCrop();
  }

  /* ---------- rendering ---------- */

  function pixelateCrop() {
    const side = cropSide();
    const tiny = document.createElement('canvas');
    tiny.width = SIZE; tiny.height = SIZE;
    const tctx = tiny.getContext('2d');
    tctx.imageSmoothingEnabled = true;
    tctx.drawImage(img, ox, oy, side, side, 0, 0, SIZE, SIZE);

    const id = tctx.getImageData(0, 0, SIZE, SIZE);
    stylize(id);
    return { w: SIZE, h: SIZE, data: Array.from(id.data) };
  }

  // Turn the photo thumbnail into sprite-style pixel art: punchy limited
  // colors, head-shaped rounded corners, and a dark outline.
  function stylize(id) {
    const d = id.data, S = SIZE;

    for (let i = 0; i < d.length; i += 4) {
      const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
      for (let k = 0; k < 3; k++) {
        let v = avg + (d[i + k] - avg) * 1.35;   // saturate
        v = (v - 128) * 1.2 + 128;               // contrast
        v = Math.round(v / 42.5) * 42.5;         // quantize to ~7 levels/channel
        d[i + k] = Math.max(0, Math.min(255, v));
      }
    }

    // chamfer the corners so the head reads as a shape, not a photo square
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const cx = Math.min(x, S - 1 - x), cy = Math.min(y, S - 1 - y);
        if (cx + cy < 3) d[(y * S + x) * 4 + 3] = 0;
      }
    }

    // dark 1px outline along the silhouette, like the rest of the sprite
    const solid = (x, y) => x >= 0 && y >= 0 && x < S && y < S && d[(y * S + x) * 4 + 3] > 0;
    const edges = [];
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++)
        if (solid(x, y) && (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)))
          edges.push((y * S + x) * 4);
    for (const i of edges) { d[i] *= 0.5; d[i + 1] *= 0.5; d[i + 2] *= 0.5; }
  }

  function extractPalette() {
    const c = document.createElement('canvas');
    c.width = 24; c.height = 24;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0, 24, 24);
    const toHex = (v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0');
    const grab = (x, y, w, h) => {
      const d = cx.getImageData(x, y, w, h).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      return `#${toHex(r / n)}${toHex(g / n)}${toHex(b / n)}`;
    };
    return {
      shirt: grab(6, 20, 12, 4),   // bottom strip ≈ clothing
      hair: grab(8, 0, 8, 3),      // top strip ≈ hair
    };
  }

  function drawHeadPreview(head, canvasEl) {
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    const cell = canvasEl.width / head.w;
    for (let y = 0; y < head.h; y++) {
      for (let x = 0; x < head.w; x++) {
        const i = (y * head.w + x) * 4;
        if (head.data[i + 3] < 40) continue; // transparent corner
        ctx.fillStyle = `rgb(${head.data[i]},${head.data[i + 1]},${head.data[i + 2]})`;
        ctx.fillRect(Math.floor(x * cell), Math.floor(y * cell), Math.ceil(cell), Math.ceil(cell));
      }
    }
  }

  function renderCrop() {
    if (!img) return;
    const preview = document.getElementById('avatarPreview');
    const side = cropSide();
    const pctx = preview.getContext('2d');
    pctx.imageSmoothingEnabled = true;
    pctx.clearRect(0, 0, preview.width, preview.height);
    pctx.drawImage(img, ox, oy, side, side, 0, 0, preview.width, preview.height);

    pendingHead = pixelateCrop();
    drawHeadPreview(pendingHead, document.getElementById('avatarResult'));
    document.getElementById('avatarSave').disabled = false;
  }

  /* ---------- image loading ---------- */

  function loadFromURL(url, revoke) {
    const image = new Image();
    image.onload = () => {
      img = image;
      pendingPalette = extractPalette();
      // start zoomed in, centered with an upward bias (faces sit high)
      zoom = 2.2;
      const side = cropSide();
      ox = (img.width - side) / 2;
      oy = (img.height - side) / 2 - side * 0.2;
      clampCrop();
      document.getElementById('avatarZoom').value = zoom;
      document.getElementById('cropHint').classList.remove('hidden');
      renderCrop();
      if (revoke) URL.revokeObjectURL(url);
    };
    image.src = url;
  }

  /* ---------- wiring ---------- */

  function wireUp() {
    const fileInput = document.getElementById('avatarFile');
    const preview = document.getElementById('avatarPreview');
    const saveBtn = document.getElementById('avatarSave');
    const zoomSlider = document.getElementById('avatarZoom');

    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      loadFromURL(URL.createObjectURL(file), true);
    });

    zoomSlider.addEventListener('input', () => setZoom(parseFloat(zoomSlider.value)));

    // drag to reposition the crop (pointer events cover mouse + touch)
    let dragging = false, lastX = 0, lastY = 0;
    preview.addEventListener('pointerdown', (e) => {
      if (!img) return;
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
      preview.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    preview.addEventListener('pointermove', (e) => {
      if (!dragging || !img) return;
      const scale = cropSide() / preview.clientWidth; // css px → image px
      ox -= (e.clientX - lastX) * scale;
      oy -= (e.clientY - lastY) * scale;
      lastX = e.clientX; lastY = e.clientY;
      clampCrop();
      renderCrop();
    });
    const endDrag = () => { dragging = false; };
    preview.addEventListener('pointerup', endDrag);
    preview.addEventListener('pointercancel', endDrag);

    saveBtn.addEventListener('click', () => {
      if (!pendingHead) return;
      save(pendingHead);
      if (pendingPalette) {
        localStorage.setItem('minime.palette', JSON.stringify(pendingPalette));
        Buddy.setPalette(pendingPalette);
      }
      Buddy.setAvatarHead(pendingHead);
      Buddy.draw();
      close();
    });

    document.getElementById('avatarReset').addEventListener('click', () => {
      clear();
      localStorage.removeItem('minime.palette');
      Buddy.setAvatarHead(null);
      Buddy.setPalette({ skin: '#eeb98a', hair: '#3b2a1a', shirt: '#3b5dc9', pants: '#29366f' });
      Buddy.draw();
      close();
    });

    document.getElementById('avatarClose').addEventListener('click', close);
    document.getElementById('avatarBtn').addEventListener('click', open);
  }

  function restore() {
    const head = load();
    if (head) Buddy.setAvatarHead(head);
    try {
      const pal = JSON.parse(localStorage.getItem('minime.palette'));
      if (pal) Buddy.setPalette(pal);
    } catch (e) { /* ignore */ }
  }

  return { wireUp, restore, loadFromURL };
})();
