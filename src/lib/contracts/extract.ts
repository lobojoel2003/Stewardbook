/**
 * Rules-based contract reader.
 *
 * Pulls three things out of the plain text of a collective bargaining agreement:
 *   1. articles (so cases can cite them and build a precedent library),
 *   2. grievance-procedure time limits (the step deadlines), and
 *   3. contract holidays (so business-day math skips them).
 *
 * Everything it returns is a *draft*. Stewardbook never uses an extracted deadline
 * until a person has confirmed it against the quoted source sentence.
 */
import {
	HOLIDAY_CATALOG,
	holidayRuleKey,
	type HolidayDef,
	type ObservedRule
} from '../deadlines/holidays';
import type { DayType } from '../deadlines/engine';
import type { Party } from '../deadlines/chain';
import { NUMBER_WORD_SOURCE, parseNumberWord, parseOrdinalish, parseRoman } from './numbers';

export interface DraftArticle {
	number: string;
	title: string;
	body: string;
	/** Sort key derived from the article number. */
	sort: number;
}

export type Confidence = 'high' | 'medium' | 'low';

export interface DraftStep {
	/** "Step 1", "Step 2", "Arbitration" … */
	stage: string;
	/** What has to happen, e.g. "File grievance with immediate supervisor". */
	name: string;
	party: Party;
	days: number;
	dayType: DayType;
	/** False when the contract did not say working vs. calendar days for this limit. */
	dayTypeExplicit: boolean;
	/** The sentence the limit came from. */
	source: string;
	/** The exact phrase within `source`, e.g. "ten (10) working days". */
	phrase: string;
	/** The article number the sentence was found in, if any. */
	article: string | null;
	confidence: Confidence;
	notes: string[];
}

export interface IgnoredLimit {
	source: string;
	phrase: string;
	reason: string;
}

export interface DraftHoliday extends HolidayDef {
	/** The text that matched. */
	matched: string;
}

export interface ExtractionResult {
	articles: DraftArticle[];
	steps: DraftStep[];
	ignored: IgnoredLimit[];
	holidays: DraftHoliday[];
	observedRule: ObservedRule;
	/** What unqualified "days" means, if the contract defines it. */
	defaultDayType: DayType | null;
	defaultDayTypeSource: string | null;
	workdays: number[] | null;
	/** Articles that look like the grievance/arbitration procedure. */
	procedureArticles: string[];
	warnings: string[];
}

const SMALL_WORDS = new Set([
	'a',
	'an',
	'and',
	'as',
	'at',
	'by',
	'for',
	'in',
	'of',
	'on',
	'or',
	'the',
	'to',
	'with'
]);

/** "HEALTH AND SAFETY" → "Health and Safety"; leaves mixed-case titles alone. */
export function titleCase(input: string): string {
	const s = input.trim().replace(/\s+/g, ' ');
	if (s !== s.toUpperCase()) return s;
	return s
		.toLowerCase()
		.split(' ')
		.map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.replace(/^[a-z]/, (c) => c.toUpperCase())))
		.join(' ');
}

export function normalizeText(raw: string): string {
	return raw
		.replace(/\r\n?/g, '\n')
		.replace(/[\u00a0\u2007\u202f]/g, ' ')
		.replace(/\f/g, '\n')
		.replace(/[ \t]+/g, ' ')
		.replace(/ *\n */g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/** Join wrapped lines into flowing prose for sentence analysis. */
function flatten(text: string): string {
	return text
		.replace(/(\w)-\n(?=[a-z])/g, '$1')
		.replace(/\s*\n\s*/g, ' ')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

// ─── Articles ────────────────────────────────────────────────────────────────

const ARTICLE_HEADING =
	/^[ \t]*ART(?:ICLE|\.)[ \t]+([0-9]{1,3}[A-Z]?|[IVXLC]{1,7})\b[ \t]*(?:[-–—:.][ \t]*)?(.*)$/gim;

export function extractArticles(text: string): DraftArticle[] {
	const heads: { index: number; end: number; number: string; sort: number; title: string }[] = [];
	let last = 0;
	for (const m of text.matchAll(ARTICLE_HEADING)) {
		const rest = m[2].trim();
		// References like "Article 10, Section 2" that happen to start a wrapped line.
		if (/^[,;)]/.test(rest) || /^(of|and|or|in|shall|is|are|the)\b/i.test(rest)) continue;
		const number = m[1].toUpperCase();
		const sort = /^\d/.test(number) ? parseInt(number, 10) : (parseRoman(number) ?? 0);
		if (sort <= last) continue;
		let title = rest;
		let end = (m.index ?? 0) + m[0].length;
		if (!title) {
			const after = text.slice(end).match(/^\n+([^\n]{2,90})(?=\n)/);
			if (after && !/[.;]$/.test(after[1].trim())) {
				title = after[1].trim();
				end += after[0].length;
			}
		}
		last = sort;
		heads.push({
			index: m.index ?? 0,
			end,
			number,
			sort,
			title: titleCase(title.replace(/[.:]+$/, ''))
		});
	}
	return heads.map((h, i) => ({
		number: h.number,
		sort: h.sort,
		title: h.title || `Article ${h.number}`,
		body: text.slice(h.end, i + 1 < heads.length ? heads[i + 1].index : undefined).trim()
	}));
}

// ─── Day-count phrases ───────────────────────────────────────────────────────

const KIND_SOURCE =
	'working|work|business|calendar|scheduled\\s+work(?:ing)?|regular\\s+work(?:ing)?|duty|school|administrative|office';

const DAYS_PHRASE = new RegExp(
	`(?<![\\w-])(?:(${NUMBER_WORD_SOURCE})\\s*\\(\\s*(\\d{1,3})\\s*\\)|\\(\\s*(\\d{1,3})\\s*\\)|(\\d{1,3})|(${NUMBER_WORD_SOURCE}))\\s+(?:(${KIND_SOURCE})[\\s-]+)?days?(?:['’]s?)?\\b`,
	'gi'
);

const HOURS_PHRASE = new RegExp(
	`(?<![\\w-])(?:(?:${NUMBER_WORD_SOURCE})\\s*\\(\\s*\\d{1,3}\\s*\\)|\\d{1,3}|${NUMBER_WORD_SOURCE})\\s+hours?\\b`,
	'gi'
);

interface DayPhrase {
	index: number;
	text: string;
	days: number;
	kind: DayType | null;
}

function findDayPhrases(sentence: string): DayPhrase[] {
	const out: DayPhrase[] = [];
	for (const m of sentence.matchAll(DAYS_PHRASE)) {
		const n = m[2] ?? m[3] ?? m[4];
		const days = n !== undefined ? Number(n) : parseNumberWord(m[1] ?? m[5] ?? '');
		if (days === null || days > 365) continue;
		const k = m[6]?.toLowerCase().replace(/\s+/g, ' ');
		const kind: DayType | null = !k ? null : k === 'calendar' ? 'calendar' : 'business';
		out.push({ index: m.index ?? 0, text: m[0], days, kind });
	}
	return out;
}

// ─── Sentences & clauses ─────────────────────────────────────────────────────

const ABBREVIATIONS =
	/\b(?:sec|secs|art|arts|no|nos|para|e\.g|i\.e|etc|mr|mrs|ms|dr|st|inc|co|corp|ltd|u\.s|vs|v|jr|sr)\.$/i;

export function splitSentences(text: string): { text: string; index: number }[] {
	const out: { text: string; index: number }[] = [];
	const re = /[.!?](?=\s+["“(]?[A-Z0-9])/g;
	let start = 0;
	for (const m of text.matchAll(re)) {
		const end = (m.index ?? 0) + 1;
		const candidate = text.slice(start, end);
		// Don't break on "Sec." / "No." or inside a number like "9.3".
		if (ABBREVIATIONS.test(candidate.trimEnd())) continue;
		if (/\d$/.test(text.slice(start, m.index)) && /^\s*\d/.test(text.slice(end))) continue;
		const trimmed = candidate.trim();
		if (trimmed) out.push({ text: trimmed, index: start + candidate.indexOf(trimmed) });
		start = end;
	}
	const tail = text.slice(start).trim();
	if (tail) out.push({ text: tail, index: start + text.slice(start).indexOf(tail) });
	return out;
}

const CLAUSE_BOUNDARY =
	/;|,\s+and\s+|,\s+but\s+|\s+and\s+(?=(?:shall|must|will|may|should)\b)|\s+and\s+(?:the|an?)\s+(?=\w+\s+(?:shall|must|will|may)\b)/gi;

function clauseBounds(sentence: string, at: number): [number, number] {
	let start = 0;
	let end = sentence.length;
	for (const m of sentence.matchAll(CLAUSE_BOUNDARY)) {
		const i = m.index ?? 0;
		if (i + m[0].length <= at) start = i + m[0].length;
		else if (i > at) {
			end = i;
			break;
		}
	}
	return [start, end];
}

// ─── Actors & actions ────────────────────────────────────────────────────────

const MANAGEMENT_WORDS =
	"employer|management|company|supervisors?|managers?|directors?|department\\s+heads?|administrators?|administration|agency|city|county|district|hospital|board|superintendent|human\\s+resources|labor\\s+relations|chief|warden|postmaster|forem[ae]n|appointing\\s+authority|designee|commissioner|principal|plant\\s+manager|employer['’]s\\s+representative";
const UNION_WORDS =
	'union|grievants?|employees?|stewards?|aggrieved\\s+(?:party|employee)|association|chapter|business\\s+agent|grieving\\s+party|local';
const OTHER_WORDS = 'arbitrators?|arbitration\\s+panel|mediators?|umpire|hearing\\s+officer';
const MODAL = '(?:shall|must|may|will|should|agrees?\\s+to|is\\s+required\\s+to|has)';

const ACTOR_MODAL = new RegExp(
	`\\b(?:the\\s+)?((?:[A-Z][\\w’'-]*\\s+){0,3}?(?:${MANAGEMENT_WORDS}|${UNION_WORDS}|${OTHER_WORDS})(?:\\s+of\\s+[A-Z][\\w’'-]*(?:\\s+[A-Z][\\w’'-]*){0,2})?)(?:['’]s\\s+\\w+)?\\s+(?:or\\s+(?:its|their|his|her)\\s+designee\\s+)?${MODAL}\\b`,
	'gi'
);
const ANY_ACTOR = new RegExp(`\\b(${MANAGEMENT_WORDS}|${UNION_WORDS}|${OTHER_WORDS})\\b`, 'gi');

function classifyActor(actor: string): Party | 'other' {
	if (new RegExp(`\\b(?:${OTHER_WORDS})\\b`, 'i').test(actor)) return 'other';
	if (new RegExp(`\\b(?:${MANAGEMENT_WORDS})\\b`, 'i').test(actor)) return 'management';
	return 'union';
}

interface Actor {
	party: Party | 'other';
	label: string;
	/** Where the actor-verb phrase ends in the sentence (the verb follows it). */
	verbAt: number;
	byModal: boolean;
}

function findActor(sentence: string, clause: [number, number], at: number): Actor | null {
	const text = sentence.slice(clause[0], clause[1]);
	const rel = at - clause[0];
	let best: { m: RegExpMatchArray; dist: number } | null = null;
	for (const m of text.matchAll(ACTOR_MODAL)) {
		const i = m.index ?? 0;
		// Prefer the closest actor before the phrase; fall back to one after it.
		const dist = i <= rel ? rel - i : (i - rel) * 2 + 1000;
		if (!best || dist < best.dist) best = { m, dist };
	}
	if (best) {
		const label = best.m[1].trim();
		return {
			party: classifyActor(label),
			label,
			verbAt: clause[0] + (best.m.index ?? 0) + best.m[0].length,
			byModal: true
		};
	}
	const any = [...text.matchAll(ANY_ACTOR)].filter((m) => {
		const i = m.index ?? 0;
		// "the employee's supervisor" — possessives aren't the subject, and neither is
		// the recipient in a passive sentence ("submitted to the Superintendent").
		if (/^['’]s\b/.test(text.slice(i + m[0].length))) return false;
		return !/\b(?:to|with|from|by\s+the\s+\w+\s+of)\s+(?:the\s+|an?\s+)?(?:[A-Z][\w’'-]*\s+){0,3}$/.test(
			text.slice(0, i)
		);
	});
	if (any.length) {
		const m = any[0];
		return { party: classifyActor(m[1]), label: m[1], verbAt: clause[0], byModal: false };
	}
	return null;
}

type Action = 'arbitration' | 'appeal' | 'file' | 'meet' | 'answer';

const ACTION_PATTERNS: [Action, RegExp][] = [
	['arbitration', /\b(?:arbitration|arbitrate|arbitrator)\b/i],
	[
		'appeal',
		/\b(?:appeal(?:ed|s)?|advance[ds]?|move[ds]?\s+(?:it|the\s+grievance)\s+to|refer(?:red|s)?)\b/i
	],
	[
		'file',
		/\b(?:present(?:ed|s)?|fil(?:e|ed|es|ing)|submit(?:ted|s)?|initiat(?:e|ed)|reduce[ds]?\s+to\s+writing|raise[ds]?|discuss(?:ed)?)\b/i
	],
	[
		'meet',
		/\b(?:meet(?:s|ing)?|convene[ds]?|hold\s+a\s+(?:meeting|hearing)|schedule[ds]?\s+a\s+(?:meeting|hearing))\b/i
	],
	[
		'answer',
		/\b(?:answer(?:ed|s)?|respon(?:d|se|ded|ds)|repl(?:y|ies|ied)|decision|disposition|render|issue[ds]?|deci(?:de|sion))\b/i
	]
];

function findAction(text: string): Action | null {
	let best: { action: Action; index: number } | null = null;
	for (const [action, re] of ACTION_PATTERNS) {
		const m = re.exec(text);
		if (m && (!best || m.index < best.index)) best = { action, index: m.index };
	}
	return best?.action ?? null;
}

function recipientOf(text: string): string | null {
	const m =
		/\b(?:to|with)\s+(?:the\s+)?((?:(?!\bto\b)[^,.;()]){2,60}?)(?=\s+(?:within|no\s+later|not\s+later|by|for|at|in\s+writing)\b|[,.;]|$)/i.exec(
			text
		);
	if (!m) return null;
	let r = m[1].replace(/^(?:employee|grievant)['’]s\s+/i, '').trim();
	if (/^(?:it|them|arbitration|the\s+next\s+step|step\b)/i.test(r)) return null;
	if (!new RegExp(`\\b(?:${MANAGEMENT_WORDS})\\b`, 'i').test(r)) return null;
	r = r.replace(/^(?:his|her|their|its)\s+/i, '');
	return r.split(/\s+/).length <= 6 ? r : null;
}

function humanActor(label: string): string {
	const cleaned = label.replace(/^the\s+/i, '').trim();
	return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// ─── Procedure analysis ──────────────────────────────────────────────────────

const PROCEDURE_TITLE = /grievance|arbitration|dispute|complaint|adjustment/i;
const STEP_HEADING = new RegExp(
	`(?:^|[.\\n:]\\s*)(?:(?:section|sec\\.?|§)\\s*[\\d.]+[a-z]?\\s*[.:)\\-–—]?\\s*)?(?:\\(?[a-z0-9]{1,3}[.)]\\s*)?(?:step\\s+(\\d+|one|two|three|four|five|six|i{1,3}|iv|v|vi)|(first|second|third|fourth|fifth|sixth)\\s+step)\\b\\s*(?:[(\\[][^)\\]]{0,40}[)\\]]\\s*)?[.:\\-–—)]`,
	'gim'
);

function stepHeadings(flat: string): { index: number; stage: string }[] {
	const out: { index: number; stage: string }[] = [];
	for (const m of flat.matchAll(STEP_HEADING)) {
		const n = parseOrdinalish(m[1] ?? m[2] ?? '');
		if (n) out.push({ index: (m.index ?? 0) + m[0].length, stage: `Step ${n}` });
	}
	return out;
}

const DAYS_DEFINITION = [
	/["“”']?days?["“”']?\s+(?:as\s+used\s+in\s+this\s+\w+\s+)?(?:shall\s+)?(?:means?|refers?\s+to|is\s+defined\s+as)\s+(working|business|calendar|work)\s+days/i,
	/(?:all\s+)?(?:time\s+limits?|references\s+to\s+days|days\s+referred\s+to)[^.]{0,120}?\b(working|business|calendar|work)\s+days/i
];

function findDefaultDayType(flat: string): { type: DayType; source: string } | null {
	for (const sentence of splitSentences(flat)) {
		for (const re of DAYS_DEFINITION) {
			const m = re.exec(sentence.text);
			if (m) {
				return {
					type: m[1].toLowerCase() === 'calendar' ? 'calendar' : 'business',
					source: sentence.text
				};
			}
		}
	}
	return null;
}

function findWorkdays(flat: string): number[] | null {
	const excl = /excluding\s+(saturdays?(?:,?\s+(?:and\s+)?sundays?)?|sundays?)/i.exec(flat);
	if (excl) {
		const s = excl[1].toLowerCase();
		if (s.includes('saturday') && s.includes('sunday')) return [1, 2, 3, 4, 5];
		if (s.startsWith('sunday')) return [1, 2, 3, 4, 5, 6];
	}
	if (/monday\s+through\s+saturday/i.test(flat)) return [1, 2, 3, 4, 5, 6];
	return null;
}

interface Segment {
	article: string | null;
	title: string;
	flat: string;
}

function procedureSegments(text: string, articles: DraftArticle[]): Segment[] {
	const matching = articles.filter((a) => PROCEDURE_TITLE.test(a.title));
	if (matching.length) {
		return matching.map((a) => ({ article: a.number, title: a.title, flat: flatten(a.body) }));
	}
	return [{ article: null, title: '', flat: flatten(text) }];
}

export function extractSteps(
	text: string,
	articles: DraftArticle[],
	defaultDayType: DayType | null
): { steps: DraftStep[]; ignored: IgnoredLimit[]; warnings: string[]; segments: Segment[] } {
	const segments = procedureSegments(text, articles);
	const steps: DraftStep[] = [];
	const ignored: IgnoredLimit[] = [];
	const warnings: string[] = [];
	let sequentialStage = 0;

	for (const seg of segments) {
		const headings = stepHeadings(seg.flat);
		const isArbitrationArticle = /arbitration/i.test(seg.title) && !/grievance/i.test(seg.title);

		for (const sentence of splitSentences(seg.flat)) {
			const phrases = findDayPhrases(sentence.text);
			if (!phrases.length) {
				const hours = HOURS_PHRASE.exec(sentence.text);
				HOURS_PHRASE.lastIndex = 0;
				if (hours && /\bwithin\b/i.test(sentence.text)) {
					warnings.push(
						`A time limit in hours was found ("${hours[0]}"). Stewardbook counts days, so add it by hand if it is a grievance deadline.`
					);
				}
				continue;
			}
			let previous: Actor | null = null;
			let previousEnd = 0;
			for (const phrase of phrases) {
				const clause = clauseBounds(sentence.text, phrase.index);
				const clauseText = sentence.text.slice(clause[0], clause[1]);
				const own = findActor(sentence.text, clause, phrase.index);
				const actor: Actor | null = own ?? previous;
				previous = actor;

				// Look for the verb right after this clause's own "X shall"; an inherited
				// subject ("… and shall answer") means the verb is in this clause.
				// A second limit in the same clause ("hold a hearing within 15 days and issue a
				// decision within 10") takes its verb from the text after the first one.
				const from = Math.max(
					own?.byModal ? own.verbAt : clause[0],
					previousEnd > clause[0] ? previousEnd : 0
				);
				const actionText =
					sentence.text.slice(from, Math.max(from, phrase.index)) ||
					sentence.text.slice(from, clause[1]) ||
					clauseText;
				previousEnd = phrase.index + phrase.text.length;
				let action = findAction(actionText) ?? findAction(clauseText);

				let party: Party | 'other' | null = actor?.party ?? null;
				if (!party && action)
					party = action === 'answer' || action === 'meet' ? 'management' : 'union';

				if (party === 'other') {
					ignored.push({
						source: sentence.text,
						phrase: phrase.text,
						reason: 'Applies to the arbitrator or a neutral, not to the parties.'
					});
					continue;
				}
				if (!party || !action) {
					ignored.push({
						source: sentence.text,
						phrase: phrase.text,
						reason: 'Could not tell who has to act or what they have to do.'
					});
					continue;
				}
				if (party === 'management' && (action === 'file' || action === 'appeal')) action = 'answer';
				if (party === 'union' && action === 'answer') action = 'file';
				if (party === 'union' && action === 'meet') action = 'file';
				if (/\barbitration\b/i.test(actionText) && party === 'union') action = 'arbitration';

				// Which step is this?
				let stage: string | null = null;
				const absolute = sentence.index + phrase.index;
				const heading = [...headings].reverse().find((h) => h.index <= absolute);
				if (action === 'arbitration' || (isArbitrationArticle && !heading)) stage = 'Arbitration';
				else if (heading) stage = heading.stage;
				if (party === 'union' && action !== 'arbitration') {
					sequentialStage = stage
						? parseInt(stage.replace(/\D/g, ''), 10) || sequentialStage + 1
						: sequentialStage + 1;
				}
				stage ??= `Step ${Math.max(1, sequentialStage)}`;

				const dayType = phrase.kind ?? defaultDayType ?? 'business';
				const notes: string[] = [];
				if (!phrase.kind) {
					notes.push(
						defaultDayType
							? `Says "days"; the contract defines days as ${defaultDayType === 'business' ? 'working' : 'calendar'} days.`
							: 'Says "days" without saying working or calendar days. Check the contract.'
					);
				}

				const recipient = recipientOf(actionText);
				const who = actor ? humanActor(actor.label) : null;
				let name: string;
				switch (action) {
					case 'arbitration':
						name = 'Request arbitration';
						break;
					case 'appeal':
						name = recipient ? `Appeal to ${recipient}` : `Appeal to ${stage}`;
						break;
					case 'file':
						if (stage !== 'Step 1' && /^Step \d+$/.test(stage)) {
							name = recipient ? `Appeal to ${recipient}` : `Appeal to ${stage}`;
						} else {
							name = recipient ? `File grievance with ${recipient}` : 'File grievance';
						}
						break;
					case 'meet':
						name =
							who && party === 'management' && !/^(employer|management|company)$/i.test(who)
								? `${who} meets with the union`
								: 'Management meets with the union';
						break;
					case 'answer':
						name =
							who && !/^(employer|management|company)$/i.test(who)
								? `${who}'s written answer`
								: 'Management answer';
						break;
				}

				let confidence: Confidence = 'high';
				if (!actor?.byModal || (!phrase.kind && defaultDayType)) confidence = 'medium';
				if (!actor || (!phrase.kind && !defaultDayType)) confidence = 'low';

				const duplicate = steps.find(
					(s) => s.stage === stage && s.party === party && s.days === phrase.days && s.name === name
				);
				if (duplicate) continue;

				steps.push({
					stage,
					name,
					party,
					days: phrase.days,
					dayType,
					dayTypeExplicit: phrase.kind !== null,
					source: sentence.text,
					phrase: phrase.text,
					article: seg.article,
					confidence,
					notes
				});
			}
		}
	}
	return { steps, ignored, warnings, segments };
}

// ─── Holidays ────────────────────────────────────────────────────────────────

function findObservedRule(flat: string): ObservedRule {
	const sat =
		/saturday[^.]{0,80}?\b(preceding|previous|prior)\s+(friday|work\s*day|working\s+day)/i.test(
			flat
		);
	const satMon = /saturday[^.]{0,80}?\b(following|next|succeeding)\s+monday/i.test(flat) && !sat;
	const sun =
		/sunday[^.]{0,80}?\b(following|next|succeeding)\s+(monday|work\s*day|working\s+day)/i.test(
			flat
		);
	if (sat && sun) return 'federal';
	if (satMon && sun) return 'weekend_to_monday';
	if (sun) return 'sunday_to_monday';
	if (sat) return 'federal';
	return 'federal';
}

export function extractHolidays(
	text: string,
	articles: DraftArticle[]
): { holidays: DraftHoliday[]; observedRule: ObservedRule; found: boolean } {
	const holidayArticles = articles.filter((a) => /holiday/i.test(a.title));
	const scope = holidayArticles.length ? holidayArticles.map((a) => a.body).join('\n\n') : '';
	if (!scope) return { holidays: [], observedRule: 'federal', found: false };
	const flat = flatten(scope);
	const observedRule = findObservedRule(flat);

	const claimed: [number, number][] = [];
	const found: { index: number; def: DraftHoliday }[] = [];
	const seen = new Set<string>();
	for (const entry of HOLIDAY_CATALOG) {
		const re = new RegExp(
			entry.pattern.source,
			entry.pattern.flags.includes('g') ? entry.pattern.flags : entry.pattern.flags + 'g'
		);
		for (const m of flat.matchAll(re)) {
			const start = m.index ?? 0;
			const end = start + m[0].length;
			if (claimed.some(([a, b]) => start < b && end > a)) continue;
			claimed.push([start, end]);
			const rule = entry.rule(observedRule);
			const key = holidayRuleKey(rule);
			if (seen.has(key)) continue;
			seen.add(key);
			found.push({ index: start, def: { name: entry.name, rule, matched: m[0] } });
		}
	}
	return {
		holidays: found.sort((a, b) => a.index - b.index).map((f) => f.def),
		observedRule,
		found: true
	};
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export function extractContract(raw: string): ExtractionResult {
	const text = normalizeText(raw);
	const warnings: string[] = [];
	const articles = extractArticles(text);
	if (!articles.length) {
		warnings.push(
			'No "ARTICLE" headings were found, so articles could not be listed automatically.'
		);
	}

	const procedure = procedureSegments(text, articles);
	const def =
		findDefaultDayType(procedure.map((s) => s.flat).join(' ')) ?? findDefaultDayType(flatten(text));
	const workdays = findWorkdays(def?.source ?? '') ?? null;

	const {
		steps,
		ignored,
		warnings: stepWarnings
	} = extractSteps(text, articles, def?.type ?? null);
	warnings.push(...new Set(stepWarnings));
	if (!steps.length) {
		warnings.push(
			'No grievance time limits were found. Add the steps by hand from the grievance article.'
		);
	}
	if (articles.length && procedure[0]?.article === null) {
		warnings.push(
			'No grievance or arbitration article was found, so the whole contract was searched for time limits.'
		);
	}

	const holidays = extractHolidays(text, articles);
	if (!holidays.found) {
		warnings.push('No holiday article was found. You can start from the US federal holiday list.');
	} else if (!holidays.holidays.length) {
		warnings.push(
			'The holiday article did not list any holidays Stewardbook recognizes. Add them by hand.'
		);
	}

	return {
		articles,
		steps,
		ignored,
		holidays: holidays.holidays,
		observedRule: holidays.observedRule,
		defaultDayType: def?.type ?? null,
		defaultDayTypeSource: def?.source ?? null,
		workdays,
		procedureArticles: procedure.map((s) => s.article).filter((a): a is string => a !== null),
		warnings
	};
}
