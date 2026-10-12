// Phone camera photos are 4 to 12 MB. Over a mobile connection that upload is most of the wait, and
// the shelf reader does not need more than about 1600 px on the long side.
const MAX_EDGE = 1600;
const SKIP_BELOW_BYTES = 400_000;

export async function compressImage(file: File): Promise<File> {
  if (file.size <= SKIP_BELOW_BYTES || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // an unreadable format is better sent as it is than dropped
  }
}

export const compressAll = (files: File[]) => Promise.all(files.map(compressImage));
