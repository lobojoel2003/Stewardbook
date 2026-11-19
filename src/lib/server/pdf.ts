import { getDocumentProxy } from 'unpdf';

interface TextItem {
	str: string;
	hasEOL?: boolean;
}

/**
 * Pull plain text out of a PDF, keeping line breaks so article headings
 * ("ARTICLE 9 – GRIEVANCE PROCEDURE") stay on their own lines.
 */
export async function pdfToText(data: Uint8Array): Promise<{ text: string; pages: number }> {
	const pdf = await getDocumentProxy(data);
	const pages: string[] = [];
	for (let i = 1; i <= pdf.numPages; i++) {
		const page = await pdf.getPage(i);
		const content = await page.getTextContent();
		let text = '';
		for (const raw of content.items as unknown[]) {
			const item = raw as TextItem;
			if (typeof item.str !== 'string') continue;
			text += item.str;
			if (item.hasEOL) text += '\n';
		}
		pages.push(text);
	}
	return { text: pages.join('\n\n'), pages: pdf.numPages };
}
