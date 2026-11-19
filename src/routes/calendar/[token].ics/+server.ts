import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findUserByCalendarToken } from '#lib/server/users.ts';
import { listCases } from '#lib/server/cases.ts';
import { getSettings, today } from '#lib/server/settings.ts';
import { PARTY_LABELS } from '#lib/deadlines/chain.ts';
import { countdownLabel } from '#lib/deadlines/engine.ts';
import { buildIcs } from '#lib/ics.ts';

/**
 * Read-only deadline feed for phone calendars. The token in the URL is the
 * credential; regenerate it in Settings to revoke an old subscription.
 * `?all=1` includes every steward's cases instead of only your own.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const user = await findUserByCalendarToken(params.token);
	if (!user) error(404, 'Not found');
	const [settings, now] = await Promise.all([getSettings(), today()]);
	const all = url.searchParams.get('all') === '1';
	const cases = await listCases({ status: 'open', stewardId: all ? null : user.id }, now);
	const events = cases
		.filter((c) => c.current?.effectiveDue)
		.map((c) => {
			const s = c.current!;
			return {
				uid: `${s.id}-${s.effectiveDue}@stewardbook`,
				date: s.effectiveDue!,
				summary: `⚖ ${c.number}: ${s.name} (${PARTY_LABELS[s.party]})`,
				description: [
					c.title,
					`${s.stage} · ${s.days} ${s.dayType === 'business' ? 'working' : 'calendar'} days`,
					s.countdown ? countdownLabel(s.countdown) : '',
					`Grievant: ${c.grievantName}`,
					`Steward: ${c.steward?.name ?? 'unassigned'}`
				]
					.filter(Boolean)
					.join('\n'),
				url: new URL(`/cases/${c.id}`, url).href,
				alarmDaysBefore: s.party === 'union' ? 2 : 1
			};
		});
	const name = `${settings?.localName ?? 'Stewardbook'} deadlines${all ? '' : ` — ${user.name}`}`;
	return new Response(buildIcs(name, events), {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Cache-Control': 'private, max-age=900',
			'Content-Disposition': 'inline; filename="stewardbook.ics"'
		}
	});
};
