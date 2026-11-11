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
let loadingGuild = false;

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
  document.body.classList.toggle('signed-out', !session?.user);
  for (const button of document.querySelectorAll('nav button')) {
    button.classList.toggle('selected', button.dataset.tab === active);
    if (button.dataset.tab === active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
    button.disabled = !overview;
  }
  document.querySelector('#breadcrumb').textContent = selectedGuild ? `Workspace / ${titles[active]}` : 'Admin dashboard';
  if (!session) return;
  if (!session.user) {
    root.innerHTML = `<section class="auth-card">
      <a class="brand" href="/"><span class="brand-icon" aria-hidden="true">♠</span>Red<span class="accent">Casino</span></a>
      <p class="eyebrow">YOUR SERVER, YOUR RULES</p><h1>Your control room<br>for game night.</h1>
      <p>Sign in with Discord to manage your server’s games, rewards, and XP economy.</p>
      <a class="primary discord-signin" href="/auth/login">🔑 Continue with Discord <span aria-hidden="true">↗</span></a>
      <small>For server owners and members with Manage Server permission.</small>
      <div class="auth-features"><span>🎮 Game controls</span><span>💰 XP economy</span><span>🎟️ Lottery events</span></div>
    </section>`;
    return;
  }
  if (!selectedGuild) {
    root.innerHTML = serversPage();
    return;
  }
  if (!overview) {
    root.innerHTML = loadingGuild
      ? '<section class="panel empty" aria-busy="true"><p class="eyebrow">CONNECTING</p><h1>Opening your server…</h1><p>Loading its settings and XP activity.</p></section>'
      : '<section class="panel empty"><h1>Server unavailable</h1><p>Check your Discord permissions, then refresh the server list.</p><button class="primary" type="button" data-action="refresh">Refresh servers</button></section>';
    return;
  }
  root.innerHTML = { overview: overviewPage, economy: economyPage, games: gamesPage, lottery: lotteryPage }[active]();
}

function serversPage() {
  const connected = session.guilds.filter(({ installed }) => installed !== false).length;
  return `${heading('✦ YOUR WORKSPACE', 'Choose your server.', 'Select a server to manage its games, rewards, and community events.')}
    <div class="servers-toolbar"><span>${connected} connected · ${session.guilds.length} you can manage</span>
      <button class="secondary" type="button" data-action="refresh">↻ Refresh servers</button></div>
    <div class="servers-grid">${session.guilds.map(({ id, name, installed }) => {
      const ready = installed !== false;
      const invite = session.invite && new URL(session.invite);
      if (invite) { invite.searchParams.set('guild_id', id); invite.searchParams.delete('disable_guild_select'); }
      return `<section class="server-card"><div class="server-card-top"><span class="server-avatar" aria-hidden="true">${escapeHtml(Array.from(name)[0]?.toUpperCase())}</span>
        <span class="connection ${ready ? 'connected' : ''}">${ready ? '● Connected' : 'Setup needed'}</span></div>
        <h2>${escapeHtml(name)}</h2><p>${ready ? 'Your games, your rewards, your rules.' : 'Add RedCasino to open this server’s dashboard.'}</p>
        ${ready ? `<button class="primary" type="button" data-server="${escapeHtml(id)}">Manage server <span aria-hidden="true">→</span></button>`
          : invite ? `<a class="secondary" href="${escapeHtml(invite.href)}" target="_blank" rel="noopener noreferrer">Add to server <span aria-hidden="true">↗</span></a>` : ''}
      </section>`;
    }).join('')}</div>
    ${session.guilds.length ? '' : '<section class="panel empty"><h2>Your servers will appear here.</h2><p>Sign in with a Discord account that owns a server or has Manage Server permission.</p></section>'}`;
}

function updateAccount() {
  identity.innerHTML = session.demo ? `<span class="badge">● ${previewMode ? 'SAMPLE DATA' : 'DEMO MODE'}</span>` : session.user
    ? `<span class="identity-name">${escapeHtml(session.user.name)}</span><button id="logout" type="button">Sign out</button>`
    : '<a class="secondary" href="/">← Back to RedCasino</a>';
  const connected = session.guilds.filter(({ installed }) => installed !== false);
  guildPicker.innerHTML = '<option value="">Select a server</option>' + connected.map(({ id, name }) =>
    `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join('');
  guildPicker.value = selectedGuild || '';
  guildPicker.disabled = !connected.length;
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
  selectedGuild = id || null;
  loadingGuild = Boolean(id);
  active = 'overview';
  guildPicker.value = id || '';
  render();
  if (!id) return;
  try {
    const data = await api(`/api/guilds/${id}`);
    if (selection === current) {
      overview = data;
      loadingGuild = false;
      render();
    }
  } catch (error) {
    if (selection === current) {
      loadingGuild = false;
      render();
      announce(error.message, true);
    }
  }
}

document.addEventListener('click', async (event) => {
  const server = event.target.closest('[data-server]');
  if (server) { announce(''); await loadGuild(server.dataset.server); }
  if (event.target.closest('#servers')) { announce(''); await loadGuild(''); }
  const refresh = event.target.closest('[data-action="refresh"]');
  if (refresh) {
    refresh.disabled = true;
    try {
      session = await api('/api/session');
      updateAccount();
      await loadGuild('');
      announce('Server list refreshed.');
    } catch (error) { announce(error.message, true); }
    finally { refresh.disabled = false; }
  }
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
  updateAccount();
  render();
} catch (error) {
  root.innerHTML = previewMode
    ? '<section class="panel empty"><h1>Preview unavailable</h1><a class="primary" href="./">Retry preview</a></section>'
    : '<section class="panel empty"><h1>Dashboard unavailable</h1><button type="button" id="logout">Reset session</button></section>';
  announce(error.message, true);
}
