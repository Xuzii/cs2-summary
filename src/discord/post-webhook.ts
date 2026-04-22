import type { ScoreboardData } from '../scoreboard/compute.ts';
import type { PlayerCardData } from '../scoreboard/compute/player-card.ts';

export interface PostMatchLinkOptions {
  webhookUrl: string;
  scoreboard: ScoreboardData;
  /** Fully-qualified URL to the interactive page for this match (includes ?m=...). */
  matchUrl: string;
}

/**
 * Link-style post for the interactive web build. Sends an embed with team
 * names, score, map, duration and a `url` that lets Discord clients unfurl
 * the linked page. One POST, no attachments.
 */
export async function postMatchLinkToDiscord(opts: PostMatchLinkOptions): Promise<void> {
  const { webhookUrl, scoreboard, matchUrl } = opts;
  const map = capitalize(prettyMap(scoreboard.map));
  const dur = Math.round(scoreboard.durationSec / 60);
  const titleParts = [`${map} · ${scoreboard.teamA.score}–${scoreboard.teamB.score}`];
  if (dur > 0) titleParts.push(`${dur}m`);
  const title = titleParts.join(' · ');

  const top = topFragger(scoreboard);
  const description = top
    ? `🔥 **${top.name}** — ${top.kills}/${top.deaths}/${top.assists} · ${top.rating.toFixed(2)} rating · ${top.adr.toFixed(0)} ADR\n\n[Open interactive summary →](${matchUrl})`
    : `[Open interactive summary →](${matchUrl})`;

  const embed = {
    title,
    url: matchUrl,
    description,
    color: scoreboard.winner === 'A' ? 0x5d9df3 : scoreboard.winner === 'B' ? 0xe4a24c : 0x7a8695,
    fields: [teamField(scoreboard.teamA), teamField(scoreboard.teamB)],
  };

  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content: '**Match Summary**', embeds: [embed] }));
  await postForm(webhookUrl, form);
}

export interface PostOptions {
  webhookUrl: string;
  scoreboard: ScoreboardData;
  /** Overview image (hero + scoreboards + highlights + round flow + H2H + heatmap). */
  primaryPng: Buffer;
  /** Detailed-stats image. Optional — omit when there's nothing interesting to show. */
  deepPng?: Buffer | null;
  /** Optional base filename for the attachments; ".png" / "-deep.png" are appended. */
  filenameBase?: string;
}

/**
 * POST scoreboard PNGs + summary embed to a Discord webhook using multipart/form-data.
 * Uses native fetch + FormData (Node 20+). Throws on non-2xx.
 *
 * Sent as two separate webhook calls to guarantee display order:
 *   1. Embed (title/desc/fields) + primary PNG inline as the embed image.
 *   2. Deep-stats PNG as a plain attachment.
 *
 * A single message can't guarantee this order: raw attachments render above
 * the embed, which would push the deep image on top of the overview.
 */
export async function postScoreboardToDiscord(options: PostOptions): Promise<void> {
  const { webhookUrl, scoreboard, primaryPng, deepPng, filenameBase = 'scoreboard' } = options;

  const primaryFilename = `${filenameBase}.png`;
  const deepFilename = `${filenameBase}-deep.png`;

  // Message 1: embed + primary image inline, labeled 1/2 when a deep card follows.
  const embed = buildEmbed(scoreboard, primaryFilename);
  const form1 = new FormData();
  const content1 = deepPng ? '**Match Summary (1/2)**' : '**Match Summary**';
  form1.append('payload_json', JSON.stringify({ content: content1, embeds: [embed] }));
  form1.append('files[0]', new Blob([primaryPng], { type: 'image/png' }), primaryFilename);
  await postForm(webhookUrl, form1);

  // Message 2: just the deep PNG, labeled 2/2 so it's not mistaken for a per-player card.
  if (deepPng) {
    const form2 = new FormData();
    form2.append(
      'payload_json',
      JSON.stringify({ content: '**Match Summary (2/2)** — deep breakdown' }),
    );
    form2.append('files[0]', new Blob([deepPng], { type: 'image/png' }), deepFilename);
    await postForm(webhookUrl, form2);
  }
}

export interface PostPlayerCardOptions {
  webhookUrl: string;
  card: PlayerCardData;
  png: Buffer;
  /** 1-based index in the tracked-players fan-out. */
  index: number;
  total: number;
  /** Optional base filename; `.png` is appended. */
  filenameBase?: string;
}

/**
 * POST a single per-player performance card to Discord. Text content is a
 * bolded title + a one-line summary so the channel feed stays readable even
 * when skimming past the card.
 */
export async function postPlayerCardToDiscord(opts: PostPlayerCardOptions): Promise<void> {
  const { webhookUrl, card, png, index, total, filenameBase } = opts;
  const filename = `${filenameBase ?? `player-${card.player.steamId}`}.png`;
  const title = `**Performance — ${card.player.name} (${index}/${total})**`;
  const oneLiner = formatOneLiner(card);
  const content = `${title}\n${oneLiner}`;

  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content }));
  form.append('files[0]', new Blob([png], { type: 'image/png' }), filename);
  await postForm(webhookUrl, form);
}

function formatOneLiner(card: PlayerCardData): string {
  const h = card.headline;
  const parts = [
    `${h.kills}/${h.deaths}/${h.assists}`,
    `${h.rating.toFixed(2)} rating`,
    `${h.adr.toFixed(0)} ADR`,
    `${h.hsPct.toFixed(0)}% HS`,
  ];
  if (h.mvps > 0) parts.push(`${h.mvps} MVP${h.mvps === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

async function postForm(webhookUrl: string, form: FormData): Promise<void> {
  const response = await fetch(webhookUrl, { method: 'POST', body: form });
  if (!response.ok) {
    const body = await response.text().catch(() => '<unreadable body>');
    throw new Error(`Discord webhook returned ${response.status} ${response.statusText}: ${body}`);
  }
}

function buildEmbed(s: ScoreboardData, filename: string) {
  const map = capitalize(prettyMap(s.map));
  const dateShort = s.date ? formatShortDate(s.date) : null;
  const durMin = Math.round(s.durationSec / 60);

  const titleParts = [`${map} · ${s.teamA.score}–${s.teamB.score}`];
  if (dateShort) titleParts.push(dateShort);
  if (durMin > 0) titleParts.push(`${durMin}m`);
  const title = titleParts.join(' · ');

  const top = topFragger(s);
  const description = top
    ? `🔥 **${top.name}** — ${top.kills}/${top.deaths}/${top.assists} · ${top.rating.toFixed(2)} rating · ${top.adr.toFixed(0)} ADR`
    : '';

  const fields = [
    teamField(s.teamA),
    teamField(s.teamB),
  ];
  const mvp = findMvp(s);
  if (mvp) {
    fields.push({
      name: 'MVP',
      value: `**${mvp.name}** · ${mvp.mvps} MVP${mvp.mvps === 1 ? '' : 's'} · ${mvp.rating.toFixed(2)} rating`,
      inline: true,
    });
  }

  return {
    title,
    description,
    color: s.winner === 'A' ? 0x5d9df3 : s.winner === 'B' ? 0xe4a24c : 0x7a8695,
    fields,
    image: { url: `attachment://${filename}` },
  };
}

function teamField(team: ScoreboardData['teamA']) {
  const agg = aggregateTeam(team.players);
  const rating = agg.count === 0 ? 0 : agg.ratingSum / agg.count;
  const adr = agg.count === 0 ? 0 : agg.adrSum / agg.count;
  return {
    name: `${team.name} (${team.side})`,
    value: `${agg.kills}/${agg.deaths}/${agg.assists} · ${adr.toFixed(0)} ADR · ${rating.toFixed(2)} rating`,
    inline: true,
  };
}

function aggregateTeam(players: ScoreboardData['teamA']['players']) {
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let adrSum = 0;
  let ratingSum = 0;
  for (const p of players) {
    kills += p.kills;
    deaths += p.deaths;
    assists += p.assists;
    adrSum += p.adr;
    ratingSum += p.rating;
  }
  return { kills, deaths, assists, adrSum, ratingSum, count: players.length };
}

function topFragger(s: ScoreboardData) {
  const all = [...s.teamA.players, ...s.teamB.players];
  if (all.length === 0) return null;
  return [...all].sort((a, b) => b.rating - a.rating || b.kills - a.kills)[0] ?? null;
}

function findMvp(s: ScoreboardData) {
  const all = [...s.teamA.players, ...s.teamB.players];
  if (all.length === 0) return null;
  return [...all].sort((a, b) => b.mvps - a.mvps || b.rating - a.rating)[0] ?? null;
}

function prettyMap(mapName: string): string {
  return mapName.replace(/^de_/, '').replace(/^cs_/, '').replace(/^ar_/, '');
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function formatShortDate(d: Date): string {
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]!;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]!;
  return `${weekday} ${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
}
