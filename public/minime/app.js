/* MiniMe app — parse plans from voice/text, schedule the buddy, track completion. */

(() => {
  'use strict';

  /* ---------------- state ---------------- */

  const ACTIVITY_META = {
    gym:      { icon: '🏋️', doing: 'Your MiniMe is lifting with you!', win: '💪 Muscles +1! You both got stronger.' },
    run:      { icon: '🏃', doing: 'Your MiniMe is out running with you!', win: '🔥 Stamina +1! Great cardio.' },
    study:    { icon: '📚', doing: 'Your MiniMe is studying alongside you!', win: '🧠 Brain +1! Knowledge gained.' },
    work:     { icon: '💻', doing: 'Your MiniMe is grinding on work too!', win: '⭐ Focus +1! Deep work done.' },
    eat:      { icon: '🍜', doing: 'Your MiniMe is enjoying a meal!', win: '❤️ Health +1! Well fed.' },
    sleep:    { icon: '😴', doing: 'Your MiniMe is resting up…', win: '🌙 Recovery +1! Well rested.' },
    meditate: { icon: '🧘', doing: 'Your MiniMe is finding zen with you…', win: '☮️ Calm +1! Mind cleared.' },
    idle:     { icon: '📌', doing: 'Your MiniMe is on it with you!', win: '✅ Quest complete!' },
  };

  const KEYWORDS = [
    [/(gym|workout|work\s*out|lift|weights|exercise|train)/i, 'gym'],
    [/(run|jog|walk|cardio|cycle|cycling|hike)/i, 'run'],
    [/(study|read|learn|class|homework|revise|exam|course)/i, 'study'],
    [/(meditat|yoga|breathe|mindful)/i, 'meditate'],
    [/(sleep|nap|rest|bed)/i, 'sleep'],
    [/(eat|breakfast|lunch|dinner|meal|cook|snack|brunch)/i, 'eat'],
    [/(work|code|coding|meeting|email|project|write|design|office)/i, 'work'],
  ];

  let tasks = [];
  let stats = { energy: 70, streak: 0, lastStreakDate: null };
  let pendingCheck = null; // task awaiting "did you do it?"
  let rescueDraft = null;
  let petWindow = null;
  let petSyncTimer = null;

  const $ = (id) => document.getElementById(id);
  const todayStr = () => new Date().toISOString().slice(0, 10);

  /* ---------------- persistence ---------------- */

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem('minime.tasks') || 'null');
      if (saved && saved.date === todayStr()) {
        tasks = saved.tasks;
      } else if (saved) {
        // new day: keep the plan, reset progress (daily planner behavior)
        tasks = saved.tasks.map(t => ({ ...t, status: 'pending', notified: false }));
      }
      const s = JSON.parse(localStorage.getItem('minime.stats') || 'null');
      if (s) stats = { ...stats, ...s };
    } catch (e) { /* fresh start */ }
  }

  function saveState() {
    localStorage.setItem('minime.tasks', JSON.stringify({ date: todayStr(), tasks }));
    localStorage.setItem('minime.stats', JSON.stringify(stats));
  }

  /* ---------------- plan parsing ---------------- */

  function toMinutes(h, m, ampm, contextAmpm) {
    h = parseInt(h, 10);
    m = m ? parseInt(m, 10) : 0;
    const marker = (ampm || contextAmpm || '').toLowerCase();
    if (marker === 'pm' && h < 12) h += 12;
    if (marker === 'am' && h === 12) h = 0;
    // no am/pm at all: assume waking hours (1-6 → afternoon)
    if (!marker && h >= 1 && h <= 6) h += 12;
    return h * 60 + m;
  }

  const RANGE_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to|till|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
  const AT_RE = /(?:at|@|by)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;

  function classify(title) {
    for (const [re, act] of KEYWORDS) if (re.test(title)) return act;
    return 'idle';
  }

  function parseChunk(chunk) {
    chunk = chunk.trim();
    if (!chunk) return null;

    let start = null, end = null, title = chunk;

    let m = chunk.match(RANGE_RE);
    if (m) {
      end = toMinutes(m[4], m[5], m[6]);
      start = toMinutes(m[1], m[2], m[3], m[6]); // "7-8am" → 7am from the 8am context
      if (end <= start) end += 12 * 60;          // "11-1" style wrap
      if (end > 24 * 60) end = 24 * 60;          // clamp at midnight
      title = chunk.replace(RANGE_RE, '').trim();
    } else {
      m = chunk.match(AT_RE);
      if (m) {
        start = toMinutes(m[1], m[2], m[3]);
        end = start + 60; // default 1 hour
        title = chunk.replace(m[0], '').trim();
      }
    }

    title = title.replace(/^(then|and|,|\.|at|from)\s+/i, '').replace(/[,.\s]+$/, '').trim();
    if (!title) title = 'task';

    return {
      id: Date.now() + Math.random().toString(36).slice(2, 7),
      title: title.charAt(0).toUpperCase() + title.slice(1),
      activity: classify(title),
      start, end,
      status: 'pending',
      notified: false,
    };
  }

  function parsePlan(text) {
    // split on newlines, commas, "then", "after that"
    const chunks = text.split(/\n|,|;|\bthen\b|\bafter that\b/i);
    return chunks.map(parseChunk).filter(Boolean);
  }

  /* ---------------- rendering ---------------- */

  function fmtTime(mins) {
    if (mins == null) return 'anytime';
    let h = Math.floor(mins / 60) % 24, m = mins % 60;
    const ap = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return m ? `${h}:${String(m).padStart(2, '0')}${ap}` : `${h}${ap}`;
  }

  function renderTasks() {
    const list = $('taskList');
    list.innerHTML = '';
    const sorted = [...tasks].sort((a, b) => (a.start ?? 9999) - (b.start ?? 9999));
    for (const t of sorted) {
      const li = document.createElement('li');
      li.className = `task ${t.status}`;
      const meta = ACTIVITY_META[t.activity] || ACTIVITY_META.idle;
      const stateIcon = { pending: '', active: '▶️', done: '⭐', missed: '💤' }[t.status] || '';
      li.innerHTML = `
        <span class="t-icon">${meta.icon}</span>
        <div class="t-main">
          <div class="t-title">${escapeHtml(t.title)}</div>
          <div class="t-time">${t.start != null ? fmtTime(t.start) + ' – ' + fmtTime(t.end) : 'anytime'}</div>
        </div>
        <span class="t-state">${stateIcon}</span>
        <button class="t-del" data-id="${t.id}" title="remove">✕</button>`;
      if (t.status === 'pending' || t.status === 'active') {
        li.querySelector('.t-main').style.cursor = 'pointer';
        li.querySelector('.t-main').addEventListener('click', () => completeTask(t, true));
        li.querySelector('.t-main').title = 'Tap when done';
      }
      li.querySelector('.t-del').addEventListener('click', (e) => {
        e.stopPropagation();
        tasks = tasks.filter(x => x.id !== t.id);
        saveState(); renderAll();
      });
      list.appendChild(li);
    }
    $('emptyHint').style.display = tasks.length ? 'none' : 'block';
    const done = tasks.filter(t => t.status === 'done').length;
    $('doneVal').textContent = `${done}/${tasks.length}`;
    $('energyVal').textContent = Math.round(stats.energy);
    $('streakVal').textContent = stats.streak;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function setCaption(text) { $('stageCaption').textContent = text; }

  function bubble(text, ms) {
    const b = $('speechBubble');
    b.textContent = text;
    b.classList.remove('hidden');
    clearTimeout(bubble._t);
    if (ms) bubble._t = setTimeout(() => b.classList.add('hidden'), ms);
  }

  /* ---------------- buddy sync loop ---------------- */

  function nowMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function tick() {
    const now = nowMinutes();
    let active = null;

    for (const t of tasks) {
      if (t.start == null) continue;

      // task just started
      if (t.status === 'pending' && now >= t.start && now < t.end) {
        t.status = 'active';
        t.notified = true;
        notify(`${ACTIVITY_META[t.activity].icon} ${t.title} time!`,
          `Your MiniMe just started. Join in — ${fmtTime(t.start)}–${fmtTime(t.end)}`);
      }

      // task window ended without completion → ask
      if (t.status === 'active' && now >= t.end) {
        t.status = 'ended';
        askCompletion(t);
      }

      if (t.status === 'active') active = t;
    }

    // mood from energy
    Buddy.setMood(stats.energy < 35 ? 'tired' : 'normal');

    if (active) {
      Buddy.setActivity(active.activity);
      const meta = ACTIVITY_META[active.activity] || ACTIVITY_META.idle;
      setCaption(meta.doing);
      bubble(`${meta.icon} ${active.title}`);
    } else if (!pendingCheck) {
      Buddy.setActivity('idle');
      $('speechBubble').classList.add('hidden');
      const next = tasks
        .filter(t => t.status === 'pending' && t.start != null && t.start > now)
        .sort((a, b) => a.start - b.start)[0];
      if (next) setCaption(`Next up: ${next.title} at ${fmtTime(next.start)}`);
      else if (tasks.length) setCaption(stats.energy < 35 ? 'Your MiniMe is exhausted… finish a quest!' : 'Your MiniMe is ready for the next quest.');
      else setCaption('Your MiniMe is chilling. Give it a plan!');
    }

    saveState();
    renderTasks();
  }

  /* ---------------- completion ---------------- */

  function askCompletion(task) {
    pendingCheck = task;
    const meta = ACTIVITY_META[task.activity] || ACTIVITY_META.idle;
    $('checkTitle').textContent = `${meta.icon} ${task.title} — time's up!`;
    $('checkText').textContent = 'Did you do it along with your MiniMe?';
    $('checkModal').classList.remove('hidden');
    notify(`⏰ ${task.title} ended`, 'Did you finish it? Tell your MiniMe!');
  }

  function completeTask(task, done) {
    task.status = done ? 'done' : 'missed';
    const meta = ACTIVITY_META[task.activity] || ACTIVITY_META.idle;
    if (done) {
      stats.energy = Math.min(100, stats.energy + 12);
      bumpStreak();
      Buddy.celebrate(6000);
      bubble(meta.win, 6000);
      setCaption(meta.win);
    } else {
      stats.energy = Math.max(0, stats.energy - 15);
      Buddy.setMood(stats.energy < 35 ? 'tired' : 'normal');
      bubble('😞 We\'ll get it next time…', 5000);
      setCaption('Your MiniMe feels sluggish… it missed that one with you.');
    }
    saveState();
    renderTasks();
    maybeAutoRecap();
  }

  function bumpStreak() {
    const today = todayStr();
    if (stats.lastStreakDate !== today) {
      stats.streak += 1;
      stats.lastStreakDate = today;
    }
  }

  /* ---------------- day recap ---------------- */

  function recapVerdict(done, total) {
    if (!total) return 'No quests today — give your MiniMe a plan tomorrow!';
    const r = done / total;
    if (r === 1) return '🏆 Perfect day! Your MiniMe is glowing.';
    if (r >= 0.7) return '💪 Strong day — your MiniMe is proud of you two.';
    if (r >= 0.4) return '🙂 Decent day. Tomorrow you level up together.';
    if (r > 0) return '😮‍💨 Rough day, but one quest is never zero.';
    return '😴 Your MiniMe napped through today… fresh start tomorrow!';
  }

  function recapText() {
    const done = tasks.filter(t => t.status === 'done');
    const lines = tasks
      .slice()
      .sort((a, b) => (a.start ?? 9999) - (b.start ?? 9999))
      .map(t => {
        const mark = t.status === 'done' ? '✅' : (t.status === 'missed' ? '❌' : '▫️');
        const time = t.start != null ? ` (${fmtTime(t.start)}–${fmtTime(t.end)})` : '';
        return `${mark} ${t.title}${time}`;
      });
    return [
      `MiniMe Day Recap — ${new Date().toDateString()}`,
      `Quests: ${done.length}/${tasks.length}  ·  ⚡ ${Math.round(stats.energy)}  ·  🔥 ${stats.streak}-day streak`,
      ...lines,
      recapVerdict(done.length, tasks.length),
    ].join('\n');
  }

  function showRecap() {
    const done = tasks.filter(t => t.status === 'done').length;
    $('recapTitle').textContent = `🌙 Day Recap — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    $('recapSummary').innerHTML = `
      <div class="r-stat"><b>${done}/${tasks.length}</b><span>quests</span></div>
      <div class="r-stat"><b>${Math.round(stats.energy)}</b><span>energy</span></div>
      <div class="r-stat"><b>${stats.streak}</b><span>streak</span></div>`;
    const list = $('recapList');
    list.innerHTML = '';
    tasks
      .slice()
      .sort((a, b) => (a.start ?? 9999) - (b.start ?? 9999))
      .forEach(t => {
        const li = document.createElement('li');
        if (t.status === 'missed') li.className = 'missed';
        const mark = t.status === 'done' ? '✅' : (t.status === 'missed' ? '❌' : '▫️');
        li.innerHTML = `<span>${mark}</span><span>${escapeHtml(t.title)}</span>
          <span class="r-time">${t.start != null ? fmtTime(t.start) + '–' + fmtTime(t.end) : 'anytime'}</span>`;
        list.appendChild(li);
      });
    $('recapVerdict').textContent = recapVerdict(done, tasks.length);
    $('recapModal').classList.remove('hidden');
  }

  function maybeAutoRecap() {
    if (!tasks.length) return;
    const allResolved = tasks.every(t => t.status === 'done' || t.status === 'missed');
    const today = todayStr();
    if (allResolved && localStorage.getItem('minime.recapShown') !== today) {
      localStorage.setItem('minime.recapShown', today);
      showRecap();
    }
  }

  /* ---------------- notifications ---------------- */

  function notify(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      new Notification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
    } catch (e) { /* some mobile browsers require SW notifications; fail quietly */ }
  }

  function wireNotifyButton() {
    const btn = $('notifyBtn');
    const sync = () => {
      if (!('Notification' in window)) { btn.textContent = '🔕 Not supported'; btn.disabled = true; return; }
      if (Notification.permission === 'granted') { btn.textContent = '🔔 Reminders on'; btn.disabled = true; }
    };
    btn.addEventListener('click', async () => {
      await Notification.requestPermission();
      sync();
    });
    sync();
  }

  /* ---------------- input handling ---------------- */

  function showFormError(msg) {
    const el = $('formError');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(showFormError._t);
    showFormError._t = setTimeout(() => el.classList.add('hidden'), 4000);
  }

  function pickerToMinutes(value) {
    if (!value) return null;
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  }

  function addFromInput() {
    const text = $('taskName').value.trim();
    if (!text) {
      showFormError('Give the quest a name first ✏️');
      $('taskName').focus();
      return;
    }

    let added;
    // Full-plan mode: the text itself contains times or multiple tasks
    if (RANGE_RE.test(text) || AT_RE.test(text) || /,|;|\bthen\b/i.test(text)) {
      added = parsePlan(text);
    } else {
      // Single-task mode: title from text, times from the pickers
      const start = pickerToMinutes($('startTime').value);
      let end = pickerToMinutes($('endTime').value);
      if (start == null && end != null) {
        showFormError('Set a start time too ⏰');
        return;
      }
      if (start != null && end == null) end = Math.min(start + 60, 24 * 60);
      if (start != null && end <= start) {
        showFormError('End time must be after start time ⏰');
        return;
      }
      added = [{
        id: Date.now() + Math.random().toString(36).slice(2, 7),
        title: text.charAt(0).toUpperCase() + text.slice(1),
        activity: classify(text),
        start, end,
        status: 'pending',
        notified: false,
      }];
    }

    if (!added.length) {
      showFormError('Couldn\'t understand that plan — try “7-8am gym” 🤔');
      return;
    }

    tasks.push(...added);
    $('taskName').value = '';
    $('startTime').value = '';
    $('endTime').value = '';
    saveState();
    bubble(`Got it! ${added.length} quest${added.length > 1 ? 's' : ''} added 📋`, 4000);
    tick();
  }

  /* ---------------- easy-entry features ---------------- */

  function addPlanText(text, source) {
    const added = parsePlan(text);
    if (!added.length) {
      showFormError('MiniMe couldn\'t find a task yet — try one task per line.');
      return false;
    }
    tasks.push(...added);
    saveState();
    bubble(`${source || 'Plan'} ready! ${added.length} quest${added.length === 1 ? '' : 's'} added ✨`, 4500);
    tick();
    return true;
  }

  function wireVoice() {
    const btn = $('voiceBtn');
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      btn.addEventListener('click', () => {
        showFormError('Voice works in Chrome or Edge. You can type the same way instead.');
        $('taskName').focus();
      });
      return;
    }
    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => { btn.classList.add('listening'); btn.textContent = '🔴 Listening…'; bubble('Tell me your day naturally.', 3000); };
    recognition.onresult = (event) => {
      const words = Array.from(event.results).map(r => r[0].transcript).join(' ');
      $('taskName').value = words;
    };
    recognition.onerror = () => showFormError('I couldn\'t hear that. Tap and try once more.');
    recognition.onend = () => { btn.classList.remove('listening'); btn.textContent = '🎙️ Tell MiniMe'; };
    btn.addEventListener('click', () => recognition.start());
  }

  function wirePaperToPet() {
    const modal = $('paperModal');
    const file = $('paperFile');
    const preview = $('paperPreview');
    const status = $('scanStatus');
    $('paperBtn').addEventListener('click', () => modal.classList.remove('hidden'));
    $('paperClose').addEventListener('click', () => modal.classList.add('hidden'));
    file.addEventListener('change', async () => {
      const image = file.files && file.files[0];
      if (!image) return;
      const url = URL.createObjectURL(image);
      preview.src = url;
      preview.classList.remove('hidden');
      status.classList.remove('hidden');
      status.textContent = 'MiniMe is looking at your list…';
      try {
        if ('TextDetector' in window) {
          const bitmap = await createImageBitmap(image);
          const detector = new window.TextDetector();
          const blocks = await detector.detect(bitmap);
          const text = blocks.map(block => block.rawValue).filter(Boolean).join('\n');
          if (text) {
            $('paperText').value = text;
            status.textContent = '✓ List read on this device. Check it, then make your plan.';
          } else {
            status.textContent = 'I couldn\'t read the writing clearly. Type or speak the lines below.';
          }
        } else {
          status.textContent = 'Photo attached. Automatic handwriting reading is not supported by this browser yet—type the lines below.';
        }
      } catch (e) {
        status.textContent = 'The writing was difficult to read. You can quickly correct it below.';
      } finally {
        URL.revokeObjectURL(url);
      }
    });
    $('paperAdd').addEventListener('click', () => {
      const text = $('paperText').value.trim();
      if (!text) { status.classList.remove('hidden'); status.textContent = 'Add at least one line from your list first.'; return; }
      if (addPlanText(text, 'Paper plan')) {
        modal.classList.add('hidden');
        $('paperText').value = '';
        file.value = '';
        preview.classList.add('hidden');
      }
    });
  }

  function buildRescueDraft() {
    const unresolved = tasks.filter(t => t.status === 'pending' || t.status === 'active');
    if (!unresolved.length) return [];
    const now = nowMinutes();
    let cursor = Math.ceil(Math.max(now + 5, 8 * 60) / 15) * 15;
    return unresolved.slice(0, 3).map((task, index) => {
      const duration = task.activity === 'gym' || task.activity === 'run' ? 30 : 25;
      const rescued = { ...task, start: cursor, end: cursor + duration, status: 'pending', rescued: true };
      cursor += duration + (index === 1 ? 15 : 5);
      return rescued;
    });
  }

  function wireRescue() {
    $('rescueBtn').addEventListener('click', () => {
      rescueDraft = buildRescueDraft();
      if (!rescueDraft.length) { bubble('Your day is already clear. Take a breath 🌿', 4000); return; }
      $('rescuePreview').innerHTML = rescueDraft.map((task, i) => `<div><b>${i + 1}</b><span><strong>${escapeHtml(task.title)}</strong><small>${fmtTime(task.start)}–${fmtTime(task.end)}</small></span></div>`).join('');
      $('rescueModal').classList.remove('hidden');
    });
    $('rescueClose').addEventListener('click', () => $('rescueModal').classList.add('hidden'));
    $('rescueApply').addEventListener('click', () => {
      if (!rescueDraft) return;
      const rescuedIds = new Set(rescueDraft.map(t => t.id));
      tasks = tasks.map(task => rescueDraft.find(t => t.id === task.id) || (rescuedIds.has(task.id) ? task : task));
      saveState(); tick();
      $('rescueModal').classList.add('hidden');
      bubble('A lighter day is ready. Just start with step one 💛', 5000);
    });
  }

  function syncPetCanvas(target, titleEl) {
    const source = $('buddyCanvas');
    const ctx = target.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(source, 0, 0, target.width, target.height);
    const active = tasks.find(t => t.status === 'active');
    if (titleEl) titleEl.textContent = active ? active.title : 'MiniMe is nearby';
  }

  async function openDesktopPet() {
    clearInterval(petSyncTimer);
    if ('documentPictureInPicture' in window) {
      try {
        petWindow = await window.documentPictureInPicture.requestWindow({ width: 260, height: 300 });
        petWindow.document.body.innerHTML = '<main><canvas width="220" height="220"></canvas><strong>MiniMe is nearby</strong><small>Keep going—you are not doing it alone.</small></main>';
        const style = petWindow.document.createElement('style');
        style.textContent = 'html,body{margin:0;background:#1a1c2c;color:#fff;font-family:monospace;height:100%;overflow:hidden}main{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px;box-sizing:border-box}canvas{width:220px;height:220px;image-rendering:pixelated;border-radius:16px}strong{font-size:13px;color:#ffcd75;margin-top:7px;text-align:center}small{font-size:9px;color:#8b93af;margin-top:6px;text-align:center}';
        petWindow.document.head.appendChild(style);
        const target = petWindow.document.querySelector('canvas');
        const title = petWindow.document.querySelector('strong');
        syncPetCanvas(target, title);
        petSyncTimer = setInterval(() => { if (petWindow && !petWindow.closed) syncPetCanvas(target, title); }, 450);
        petWindow.addEventListener('pagehide', () => clearInterval(petSyncTimer));
        return;
      } catch (e) { /* fall through to the in-page pet */ }
    }
    const fallback = $('petFallback');
    fallback.classList.remove('hidden');
    syncPetCanvas($('petFallbackCanvas'), $('petFallbackTitle'));
    petSyncTimer = setInterval(() => syncPetCanvas($('petFallbackCanvas'), $('petFallbackTitle')), 450);
    bubble('Your browser kept MiniMe inside the app. Chrome desktop supports always-on-top Pet mode.', 4500);
  }

  function wireDesktopPet() {
    $('petBtn').addEventListener('click', openDesktopPet);
    $('petFallbackClose').addEventListener('click', () => { $('petFallback').classList.add('hidden'); clearInterval(petSyncTimer); });
  }

  function closeFeedback() {
    $('feedbackModal').classList.add('hidden');
    const url = new URL(window.location.href);
    url.searchParams.delete('feedback');
    history.replaceState({}, '', url.pathname + url.search + url.hash);
  }

  function wireFeedback() {
    const modal = $('feedbackModal');
    const form = $('feedbackForm');
    const status = $('feedbackStatus');
    const submit = $('feedbackSubmit');
    const open = () => { modal.classList.remove('hidden'); setTimeout(() => form.elements.email.focus(), 80); };

    $('feedbackBtn').addEventListener('click', open);
    $('feedbackInviteBtn').addEventListener('click', open);
    $('feedbackCloseX').addEventListener('click', closeFeedback);
    modal.addEventListener('click', (event) => { if (event.target === modal) closeFeedback(); });
    $('thanksClose').addEventListener('click', () => $('feedbackThanks').classList.add('hidden'));
    $('sharePrototypeBtn').addEventListener('click', async () => {
      const shareData = { title: 'MiniMe prototype', text: 'Try MiniMe, a pixel productivity buddy, and help shape the prototype.', url: new URL('index.html?feedback=1', window.location.href).href };
      try {
        if (navigator.share) await navigator.share(shareData);
        else { await navigator.clipboard.writeText(shareData.url); $('shareStatus').textContent = '✓ Prototype survey link copied.'; }
      } catch (error) { if (error.name !== 'AbortError') $('shareStatus').textContent = 'Copy or scan the QR to share.'; }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      status.textContent = '';
      submit.disabled = true;
      submit.textContent = 'Sending your feedback…';
      const values = new FormData(form);
      const payload = Object.fromEntries(values.entries());
      payload.consent = values.get('consent') === 'on';
      try {
        const response = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not send your response.');
        form.reset();
        closeFeedback();
        $('feedbackThanks').classList.remove('hidden');
        syncPetCanvas($('thanksCanvas'));
      } catch (error) {
        status.textContent = error.message || 'Something went wrong. Please try once more.';
      } finally {
        submit.disabled = false;
        submit.textContent = 'Send feedback & join early access →';
      }
    });

    if (new URLSearchParams(window.location.search).get('feedback') === '1') open();
  }

  /* ---------------- init ---------------- */

  function init() {
    Buddy.init($('buddyCanvas'));
    Avatar.restore();
    Avatar.wireUp();
    Buddy.draw();

    loadState();
    renderTasks();

    $('addBtn').addEventListener('click', addFromInput);
    $('taskName').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addFromInput(); }
    });
    $('clearBtn').addEventListener('click', () => {
      if (tasks.length && confirm('Clear all quests for today?')) {
        tasks = []; saveState(); renderAll();
      }
    });
    $('checkYes').addEventListener('click', () => {
      if (pendingCheck) completeTask(pendingCheck, true);
      pendingCheck = null;
      $('checkModal').classList.add('hidden');
    });
    $('checkNo').addEventListener('click', () => {
      if (pendingCheck) completeTask(pendingCheck, false);
      pendingCheck = null;
      $('checkModal').classList.add('hidden');
    });

    $('recapBtn').addEventListener('click', showRecap);
    $('recapClose').addEventListener('click', () => $('recapModal').classList.add('hidden'));
    $('recapCopy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(recapText());
        $('recapCopy').textContent = '✅ Copied!';
      } catch (e) {
        $('recapCopy').textContent = '❌ Copy blocked';
      }
      setTimeout(() => { $('recapCopy').textContent = '📋 Copy summary'; }, 2000);
    });

    wireNotifyButton();
    wireVoice();
    wirePaperToPet();
    wireRescue();
    wireDesktopPet();
    wireFeedback();

    tick();
    setInterval(tick, 20000);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  function renderAll() { renderTasks(); tick(); }

  document.addEventListener('DOMContentLoaded', init);
})();
