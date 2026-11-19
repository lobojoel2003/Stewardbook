/**
 * Shrink a phone photo before it is stored or uploaded: a 12-megapixel JPEG
 * becomes a ~300 KB image that still reads clearly in a case file.
 */
export async function downscaleImage(file: File, maxEdge = 1800, quality = 0.82): Promise<File> {
	if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	} catch {
		return file; // HEIC and other formats the browser can't decode stay as-is.
	}
	const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
	if (scale === 1 && file.size < 1_500_000) {
		bitmap.close();
		return file;
	}
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	const ctx = canvas.getContext('2d');
	if (!ctx) return file;
	ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/jpeg', quality)
	);
	if (!blob || blob.size >= file.size) return file;
	const name = file.name.replace(/\.\w+$/, '') + '.jpg';
	return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
}
