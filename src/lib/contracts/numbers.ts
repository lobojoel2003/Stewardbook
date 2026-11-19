const UNITS: Record<string, number> = {
	zero: 0,
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	eleven: 11,
	twelve: 12,
	thirteen: 13,
	fourteen: 14,
	fifteen: 15,
	sixteen: 16,
	seventeen: 17,
	eighteen: 18,
	nineteen: 19
};

const TENS: Record<string, number> = {
	twenty: 20,
	thirty: 30,
	forty: 40,
	fourty: 40,
	fifty: 50,
	sixty: 60,
	seventy: 70,
	eighty: 80,
	ninety: 90
};

const SMALL = Object.keys(UNITS).filter((w) => UNITS[w] > 0 && UNITS[w] < 10);

/** A regex source matching an English number word from one to ninety-nine (or "one hundred"). */
export const NUMBER_WORD_SOURCE = `(?:(?:${Object.keys(TENS).join('|')})(?:[-\\s](?:${SMALL.join('|')}))?|${Object.keys(UNITS).join('|')}|one\\s+hundred)`;

/** Parse "ten", "twenty-one", "forty five", "one hundred" or "15". Returns null if not a number. */
export function parseNumberWord(input: string): number | null {
	const s = input.trim().toLowerCase().replace(/\s+/g, ' ');
	if (/^\d+$/.test(s)) return Number(s);
	if (s === 'one hundred' || s === 'hundred') return 100;
	if (s in UNITS) return UNITS[s];
	if (s in TENS) return TENS[s];
	const m = /^([a-z]+)[-\s]([a-z]+)$/.exec(s);
	if (m && m[1] in TENS && m[2] in UNITS && UNITS[m[2]] < 10) return TENS[m[1]] + UNITS[m[2]];
	return null;
}

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };

/** Parse a Roman numeral such as "IX". Returns null for anything that isn't one. */
export function parseRoman(input: string): number | null {
	const s = input.trim().toLowerCase();
	if (!/^[ivxlc]+$/.test(s)) return null;
	let total = 0;
	for (let i = 0; i < s.length; i++) {
		const v = ROMAN[s[i]];
		const next = ROMAN[s[i + 1]] ?? 0;
		total += v < next ? -v : v;
	}
	return total > 0 ? total : null;
}

const ORDINALS: Record<string, number> = {
	first: 1,
	second: 2,
	third: 3,
	fourth: 4,
	fifth: 5,
	sixth: 6
};

/** Parse a step/article identifier: "3", "three", "III" or "third". */
export function parseOrdinalish(input: string): number | null {
	const s = input.trim().toLowerCase();
	if (/^\d+$/.test(s)) return Number(s);
	if (s in ORDINALS) return ORDINALS[s];
	return parseNumberWord(s) ?? parseRoman(s);
}
