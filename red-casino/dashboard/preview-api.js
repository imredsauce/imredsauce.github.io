const sample = fetch(new URL('./sample.json', import.meta.url)).then((response) => {
  if (!response.ok) throw new Error('Sample server data could not load.');
  return response.json();
});

export async function previewRequest(path, method, body) {
  const { session, overview } = await sample;
  if (method === 'GET' && path === '/api/session') return structuredClone(session);
  const guild = `/api/guilds/${session.guilds[0].id}`;
  if (method === 'GET' && path === guild) return structuredClone(overview);

  if (method === 'PUT' && path === `${guild}/settings`) {
    overview.value = body.settings;
    overview.revision += 1;
    return structuredClone({ value: overview.value, revision: overview.revision });
  }

  if (method === 'POST' && path === `${guild}/adjust`) {
    const { user, delta, reason } = body;
    const member = overview.ranking.find((entry) => entry.user === user);
    if (!member) throw new Error('Choose a member from the sample server.');
    if (!Number.isSafeInteger(delta) || !delta || !reason.trim()) throw new Error('Enter an XP amount and a reason.');
    if (member.balance + delta < 0) throw new Error('The adjustment exceeds this member’s available balance.');
    member.balance += delta;
    overview.stats.xp += delta;
    overview.ranking.sort((first, second) => second.balance - first.balance || first.user.localeCompare(second.user));
    overview.activity.unshift({ name: member.name, delta, reason: `Admin: ${reason.trim()}` });
    return { balance: member.balance };
  }

  throw new Error('This action is unavailable in the dashboard preview.');
}
