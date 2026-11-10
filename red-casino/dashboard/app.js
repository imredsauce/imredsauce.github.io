const root = document.querySelector('#content');
const guildPicker = document.querySelector('#guild');
const identity = document.querySelector('#identity');
const notice = document.querySelector('#notice');
const previewMode = document.documentElement.hasAttribute('data-preview');
const titles = { overview: 'Overview', economy: 'XP economy', games: 'Game room', lottery: 'Lottery' };
const number = new Intl.NumberFormat('en-US');
let session;
let overview;
let selectedGuild;
let active = 'overview';
let selection = 0;

const escapeHtml = (value) => String(value ?? '').replaceAll(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function xp(amount, display = overview.value) {
  const { currencyLabel, currencyPosition, currencyDecimals } = display;
  const value = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals,
  });
  const formatted = currencyPosition === 'prefix' ? `${currencyLabel} ${value}` : `${value} ${currencyLabel}`;
  return amount < 0 ? `-${formatted}` : formatted;
}

async function api(path, method = 'GET', body) {
  if (previewMode) {
    const { previewRequest } = await import('./preview-api.js');
    return previewRequest(path, method, body);
  }
  const result = await fetch(path, { method, ...(body ? {
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  } : {}) });
  const data = await result.json();
  if (!result.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function announce(text, error = false) {
  notice.textContent = text;
  notice.classList.toggle('error', error);
  notice.hidden = !text;
}

const section = (emoji, title, detail) =>
  `<div class="section-title"><span aria-hidden="true">${emoji}</span><div><h2>${title}</h2><p>${detail}</p></div></div>`;
const heading = (label, title, text) =>
  `<div class="page-title"><p class="eyebrow">${label}</p><h1>${title}</h1><p>${text}</p></div>`;
const input = (name, label, value, min, max) =>
  `<label>${label}<input name="${name}" type="number" value="${value}" min="${min}" max="${max}" required></label>`;
const check = (name, label, checked) =>
  `<label class="switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
const save = () => `<div class="form-footer"><span>${previewMode ? 'Changes apply to this preview session.' : 'Changes apply to new actions in this server.'}</span><button class="primary">Save changes</button></div>`;

function render() {
  for (const button of document.querySelectorAll('nav button')) {
    button.classList.toggle('selected', button.dataset.tab === active);
    if (button.dataset.tab === active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
    button.disabled = !overview;
  }
  document.querySelector('#breadcrumb').textContent = `Workspace / ${titles[active]}`;
  if (!session) return;
  if (!session.user) {
    root.innerHTML = `<section class="hero landing"><div><p class="eyebrow">✦ YOUR SERVER, YOUR RULES</p>
      <h1>Game night starts here.</h1><p>Run your Discord XP economy, rankings, and games from one dashboard.</p>
      <a class="primary" href="/auth/login">🔑 Sign in with Discord</a></div><div class="hero-art" aria-hidden="true">🎮</div></section>`;
    return;
  }
  if (!overview) {
    root.innerHTML = session.guilds.length
      ? '<section class="panel empty"><h1>Loading server…</h1></section>'
      : `<section class="panel empty"><h1>Connect a server</h1><p>Install RedCasino in a Discord server where you have Manage Server permission.</p>
        ${session.invite ? `<a class="primary" href="${escapeHtml(session.invite)}">Add to Discord</a>` : ''}</section>`;
    return;
  }
  root.innerHTML = { overview: overviewPage, economy: economyPage, games: gamesPage, lottery: lotteryPage }[active]();
}

function overviewPage() {
  const { stats, ranking, activity, value } = overview;
  const guild = session.guilds.find(({ id }) => id === selectedGuild);
  const enabled = Object.values(value.games).filter((game) => game.enabled).length;
  const cards = [
    ['👥', 'Members with profiles', number.format(stats.members), 'purple'],
    ['⚡', 'In circulation', escapeHtml(xp(stats.xp)), 'gold'],
    ['🔥', 'Check-ins · last 24h', number.format(stats.daily), 'rose'],
    ['🎮', 'Enabled games', `${enabled} / ${Object.keys(value.games).length}`, 'green'],
  ];
  const medals = ['🥇', '🥈', '🥉'];
  return `<section class="hero"><div><p class="eyebrow">✦ SERVER CONTROL ROOM</p>
    <h1>Game night starts here.</h1><p>Manage ${escapeHtml(guild.name)}’s XP, games, and rewards.</p>
    <button type="button" data-tab="games" class="primary">🎲 Configure games <span aria-hidden="true">→</span></button>
    </div><div class="hero-art" aria-hidden="true">🎮</div></section>
    <div class="stats">${cards.map(([icon, label, count, color]) => `<section class="stat">
      <span class="tile ${color}" aria-hidden="true">${icon}</span><span>${label}</span><strong>${count}</strong></section>`).join('')}</div>
    <div class="split">
      <section class="panel">${section('🏆', 'Leaderboard', 'Members ranked by available XP')}
        <div class="ranking">${ranking.length ? ranking.slice(0, 6).map((entry, index) => `<div class="rank-row">
          <span class="position">${medals[index] || index + 1}</span><span class="avatar">${escapeHtml(Array.from(entry.name)[0]?.toUpperCase())}</span>
          <strong>${escapeHtml(entry.name)}</strong><span class="amount">${escapeHtml(xp(entry.balance))}</span>
        </div>`).join('') : '<p class="muted">Use /daily in Discord to create the first rank.</p>'}</div>
      </section>
      <section class="panel">${section('📒', 'Recent XP activity', 'Latest changes recorded in the ledger')}
        <div class="activity">${activity.length ? activity.slice(0, 6).map((entry) => `<div class="activity-row">
          <span class="tile ${entry.delta > 0 ? 'green' : 'rose'}" aria-hidden="true">${entry.delta > 0 ? '↗' : '↘'}</span>
          <div><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.reason)}</small></div>
          <span class="amount ${entry.delta > 0 ? 'positive' : 'negative'}">${entry.delta > 0 ? '+' : ''}${escapeHtml(xp(entry.delta))}</span>
        </div>`).join('') : '<p class="muted">The ledger is empty.</p>'}</div>
      </section>
    </div>`;
}

function economyPage() {
  const { value, ranking } = overview;
  return `${heading('⚡ SERVER SETTINGS', 'XP economy', 'Set up rewards, check-ins, and member transfers.')}
    <form class="panel" data-form="economy">
      ${section('💱', 'Currency display', 'Choose how balances, stakes, and payouts appear in this server.')}
      <div class="fields">
        <label>Label<input name="currencyLabel" value="${escapeHtml(value.currencyLabel)}" placeholder="XP" maxlength="24" required></label>
        <label>Label position<select name="currencyPosition">
          <option value="prefix" ${value.currencyPosition === 'prefix' ? 'selected' : ''}>Prefix</option>
          <option value="suffix" ${value.currencyPosition === 'suffix' ? 'selected' : ''}>Suffix</option>
        </select></label>
        <label>Decimal places<select name="currencyDecimals">
          ${[0, 1, 2].map((places) => `<option value="${places}" ${value.currencyDecimals === places ? 'selected' : ''}>${places}</option>`).join('')}
        </select></label>
        <div class="currency-preview"><span>Preview</span><output id="currency-preview">${escapeHtml(xp(10000))}</output></div>
      </div>
      ${section('📅', 'Daily check-in', 'Members claim once per server calendar day with /daily.')}
      <div class="fields">
        <label>Server timezone<input name="timezone" value="${escapeHtml(value.timezone)}" placeholder="Asia/Manila" maxlength="100" required></label>
        ${input('dailyXp', 'Daily reward · XP', value.dailyXp, 0, 100000000)}
        ${input('memberXp', 'Membership bonus · XP', value.memberXp, 0, 100000000)}
        ${input('memberDays', 'Membership required · days', value.memberDays, 0, 3650)}
      </div>
      ${section('🎁', 'Member gifts', 'The sender pays the fee on top of the gift, rounded up to the next whole XP.')}
      <div class="fields">${input('giftFee', 'Transfer fee · %', value.giftFee, 0, 100)}</div>
      ${save()}
    </form>
    <form class="panel" data-form="adjust">
      ${section('🛠️', 'Adjust a balance', 'Add or remove XP and record your reason in the ledger. Use /xp for a member without a profile.')}
      <div class="fields">
        <label>Discord member ID<input name="user" list="members" ${session.demo ? '' : 'pattern="[0-9]{17,20}"'} required>
          <datalist id="members">${ranking.map(({ user, name }) => `<option value="${escapeHtml(user)}">${escapeHtml(name)}</option>`).join('')}</datalist></label>
        <label>XP change<input name="delta" type="number" placeholder="500 or -500" min="-100000000" max="100000000" required></label>
        <label>Reason<input name="reason" maxlength="120" required></label>
      </div>
      <div class="form-footer"><span>Admin actions appear in Recent XP activity.</span><button class="primary">Apply adjustment</button></div>
    </form>`;
}

function gamesPage() {
  const value = overview.value;
  return `${heading('🎮 GAME SETTINGS', 'Game room', 'Pick what members can play and tune each game’s limits.')}
    <form data-form="games">
      <div class="game-grid">${Object.entries(session.games).map(([id, { emoji, name, description, free, options }]) => {
        const config = value.games[id];
        const extra = {
          slot: () => input('slotMultiplier', 'Three-match payout · ×', value.slotMultiplier, 1, 100),
          scratch: () => input('scratchChance', 'Three-match chance · %', value.scratchChance, 1, 100),
          mines: () => input('mineCount', 'Mines per board', value.mineCount, 1, 12),
          wheel: () => `<div class="wheel"><p class="muted">Relative weights · 0 removes a result</p>
            <div class="fields">${session.wheel.map((label, index) => input(`wheel${index}`, label, value.wheelWeights[index], 0, 1000)).join('')}</div></div>`,
        };
        return `<section class="panel game"><div class="game-top">${section(emoji, name, description)}
          ${check(`${id}.enabled`, 'Enabled', config.enabled)}</div><div class="command">/${id}</div>
          <div class="fields game-limits">
          ${free ? '' : input(`${id}.min`, 'Min stake', config.min, 1, 100000000)}
          ${free ? '' : input(`${id}.max`, 'Max stake', config.max, 1, 100000000)}
          ${input(`${id}.cooldown`, 'Cooldown · s', config.cooldown, 0, 3600)}
          </div>${id === 'wheel' ? extra[id]() : extra[id] ? `<div class="fields">${extra[id]()}</div>` : ''}
          ${options ? `<div class="fields">${options.map(([key, label, min, max]) => input(key, label, value[key], min, max)).join('')}</div>` : ''}
          </section>`;
      }).join('')}</div>
      <div class="panel save-panel">${save()}</div>
    </form>`;
}

function lotteryPage() {
  const { value, lotteryChannels = [] } = overview;
  return `${heading('🎉 SERVER EVENTS', 'Lottery', 'Set up a free-entry draw with a server XP prize.')}
    <form class="panel" data-form="lottery">
      ${section('🎟️', 'Draw schedule', 'Draws run at midnight, noon, and 3, 6, and 9 AM and PM in the timezone below.')}
      ${check('lotteryEnabled', 'Enable lottery', value.lotteryEnabled)}
      <div class="fields">
        <label>Announcement channel<select name="lotteryChannel">
          <option value="">Manual draws only</option>
          ${value.lotteryChannel && !lotteryChannels.some(({ id }) => id === value.lotteryChannel)
            ? `<option value="${escapeHtml(value.lotteryChannel)}" selected>Unavailable channel</option>` : ''}
          ${lotteryChannels.map(({ id, name }) => `<option value="${escapeHtml(id)}" ${id === value.lotteryChannel ? 'selected' : ''}>#${escapeHtml(name)}</option>`).join('')}
        </select></label>
        <label>Draw timezone<input name="lotteryTimezone" value="${escapeHtml(value.lotteryTimezone)}" maxlength="100" required></label>
      </div>
      <div class="fields">
        ${input('lotteryMinutes', 'Entry window · minutes', value.lotteryMinutes, 1, 1440)}
        ${input('lotteryPrize', 'Winner’s prize · XP', value.lotteryPrize, 1, 100000000)}
      </div>
      <p class="muted">Choose a channel to post scheduled draws. Entries open before each draw. In manual mode, start an event with /lottery.</p>
      ${save()}
    </form>`;
}

async function loadGuild(id) {
  const current = ++selection;
  overview = null;
  selectedGuild = id;
  render();
  try {
    const data = await api(`/api/guilds/${id}`);
    if (selection === current) {
      overview = data;
      render();
    }
  } catch (error) {
    if (selection === current) announce(error.message, true);
  }
}

document.addEventListener('click', async (event) => {
  const tab = event.target.closest('[data-tab]');
  if (tab && overview) {
    active = tab.dataset.tab;
    announce('');
    render();
  }
  if (event.target.closest('#logout')) {
    try {
      await api('/auth/logout', 'POST');
      location.reload();
    } catch (error) { announce(error.message, true); }
  }
});

root.addEventListener('input', (event) => {
  const form = event.target.closest('[data-form="economy"]');
  if (!form || !event.target.name.startsWith('currency')) return;
  const data = new FormData(form);
  form.querySelector('#currency-preview').textContent = xp(10000, {
    currencyLabel: data.get('currencyLabel').trim() || 'XP',
    currencyPosition: data.get('currencyPosition'),
    currencyDecimals: Number(data.get('currencyDecimals')),
  });
});

guildPicker.addEventListener('change', () => {
  announce('');
  loadGuild(guildPicker.value);
});

root.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const kind = form.dataset.form;
  if (!kind) return;
  const id = selectedGuild;
  const current = selection;
  const data = new FormData(form);
  const num = (name) => Number(data.get(name));
  const submit = form.querySelector('button');
  submit.disabled = true;
  announce('');
  try {
    if (kind === 'adjust') {
      const payload = { user: data.get('user').trim(), delta: num('delta'), reason: data.get('reason') };
      const signature = JSON.stringify(payload);
      if (form.dataset.adjustment !== signature) {
        form.dataset.adjustment = signature;
        form.dataset.requestId = crypto.randomUUID();
      }
      const result = await api(`/api/guilds/${id}/adjust`, 'POST', { ...payload, requestId: form.dataset.requestId });
      if (selection !== current) return;
      form.reset();
      delete form.dataset.adjustment;
      announce(`Balance updated to ${xp(result.balance)}.`);
      const refreshed = await api(`/api/guilds/${id}`);
      if (selection === current) overview = refreshed;
    } else {
      const settings = structuredClone(overview.value);
      if (kind === 'economy') {
        settings.timezone = data.get('timezone').trim();
        settings.currencyLabel = data.get('currencyLabel').trim();
        settings.currencyPosition = data.get('currencyPosition');
        settings.currencyDecimals = num('currencyDecimals');
        for (const key of ['dailyXp', 'memberXp', 'memberDays', 'giftFee']) settings[key] = num(key);
      } else if (kind === 'lottery') {
        settings.lotteryEnabled = data.has('lotteryEnabled');
        settings.lotteryChannel = data.get('lotteryChannel');
        settings.lotteryTimezone = data.get('lotteryTimezone').trim();
        for (const key of ['lotteryMinutes', 'lotteryPrize']) settings[key] = num(key);
      } else {
        for (const [game, config] of Object.entries(settings.games)) {
          config.enabled = data.has(`${game}.enabled`);
          const { free, options } = session.games[game];
          for (const key of free ? ['cooldown'] : ['min', 'max', 'cooldown']) config[key] = num(`${game}.${key}`);
          for (const [key] of options ?? []) settings[key] = num(key);
        }
        for (const key of ['slotMultiplier', 'scratchChance', 'mineCount']) settings[key] = num(key);
        settings.wheelWeights = settings.wheelWeights.map((_, index) => num(`wheel${index}`));
      }
      const saved = await api(`/api/guilds/${id}/settings`, 'PUT', { settings, revision: overview.revision });
      if (selection !== current) return;
      Object.assign(overview, saved);
      announce('Settings saved.');
    }
  } catch (error) {
    if (selection === current) announce(error.message, true);
  } finally { submit.disabled = false; }
});

try {
  session = await api('/api/session');
  identity.innerHTML = session.demo ? `<span class="badge">● ${previewMode ? 'SAMPLE DATA' : 'DEMO MODE'}</span>` : session.user
    ? `<span class="identity-name">${escapeHtml(session.user.name)}</span><button id="logout" type="button">Sign out</button>`
    : '<a class="primary" href="/auth/login">Sign in</a>';
  guildPicker.innerHTML = session.guilds.length ? session.guilds.map(({ id, name }) =>
    `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join('') : '<option>No connected servers</option>';
  guildPicker.disabled = !session.guilds.length;
  if (session.guilds.length) await loadGuild(session.guilds[0].id);
  else render();
} catch (error) {
  root.innerHTML = previewMode
    ? '<section class="panel empty"><h1>Preview unavailable</h1><a class="primary" href="./">Retry preview</a></section>'
    : '<section class="panel empty"><h1>Dashboard unavailable</h1><button type="button" id="logout">Reset session</button></section>';
  announce(error.message, true);
}
