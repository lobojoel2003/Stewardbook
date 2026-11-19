import { getCase } from './cases';
import { getSettings } from './settings';

/** Everything the handoff packet needs, shared by the HTML and Markdown versions. */
export async function packetData(caseId: string, today: string) {
	const c = await getCase(caseId, today);
	if (!c) return null;
	const settings = await getSettings();
	const lastHandoff = c.timeline.find((e) => e.kind === 'handoff') ?? null;
	return { case: c, localName: settings?.localName ?? 'Stewardbook', lastHandoff };
}
