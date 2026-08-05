"use client";

export async function compressImageFile(file, maxWidth = 1600, maxHeight = 1200, quality = 0.75) {
  if (!file) return null;
  // Prefer createImageBitmap when available (fast), otherwise fall back to Image + canvas
  const drawToCanvas = async (imgWidth, imgHeight, drawImageSource) => {
    const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1);
    const width = Math.round(imgWidth * ratio);
    const height = Math.round(imgHeight * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(drawImageSource, 0, 0, width, height);

    return await new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(null);
          const compressedFile = new File([blob], file.name.replace(/\s+/g, "_"), {
            type: blob.type || "image/jpeg",
          });
          resolve(compressedFile);
        },
        "image/jpeg",
        quality
      );
    });
  };

  try {
    if (typeof createImageBitmap === "function") {
      const imageBitmap = await createImageBitmap(file);
      return await drawToCanvas(imageBitmap.width, imageBitmap.height, imageBitmap);
    }
  } catch (e) {
    // fallback silently to Image approach
    console.info("createImageBitmap failed, falling back to Image", e?.message || e);
  }

  // Fallback for environments without createImageBitmap
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const compressed = await drawToCanvas(img.width, img.height, img);
        resolve(compressed);
      };
      img.onerror = () => resolve(null);
      img.src = reader.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
