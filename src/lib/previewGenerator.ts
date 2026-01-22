import sharp from 'sharp';
import { createCanvas } from 'canvas';
import { logger } from '../config/logger';

const MAX_PREVIEW_DIMENSION = 512;
const WEBP_QUALITY = 80;
const PDF_RENDER_SCALE = 2.0;

let pdfjsLib: any = null;

async function getPdfjsLib() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsLib;
}

interface PreviewResult {
  buffer: Buffer;
  mimeType: string;
  size: number;
}

export async function generatePreview(
  fileBuffer: Buffer,
  mimeType: string
): Promise<PreviewResult> {
  logger.debug('Generating preview', { mimeType, bufferSize: fileBuffer.length });

  let imageBuffer: Buffer;

  if (mimeType === 'application/pdf') {
    imageBuffer = await renderPdfFirstPageToPngBuffer(fileBuffer);
  } else if (mimeType.startsWith('image/')) {
    imageBuffer = fileBuffer;
  } else {
    throw new Error(`Unsupported file type for preview generation: ${mimeType}`);
  }

  const previewBuffer = await resizeAndConvertToWebp(imageBuffer);

  return {
    buffer: previewBuffer,
    mimeType: 'image/webp',
    size: previewBuffer.length,
  };
}

async function renderPdfFirstPageToPngBuffer(pdfBytes: Buffer): Promise<Buffer> {
  try {
    const pdfjs = await getPdfjsLib();
    
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfBytes),
      useSystemFonts: true,
      standardFontDataUrl: undefined,
    });

    const pdf = await loadingTask.promise;
    
    if (pdf.numPages === 0) {
      throw new Error('PDF has no pages');
    }

    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });

    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
      canvas: canvas as any,
    };

    await page.render(renderContext).promise;

    await pdf.destroy();

    return canvas.toBuffer('image/png');
  } catch (error) {
    logger.error('Failed to render PDF page', { error });
    throw new Error(`PDF rendering failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function resizeAndConvertToWebp(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    const width = metadata.width || 0;
    const height = metadata.height || 0;

    let resizeOptions: { width?: number; height?: number } = {};

    if (width > height) {
      if (width > MAX_PREVIEW_DIMENSION) {
        resizeOptions.width = MAX_PREVIEW_DIMENSION;
      }
    } else {
      if (height > MAX_PREVIEW_DIMENSION) {
        resizeOptions.height = MAX_PREVIEW_DIMENSION;
      }
    }

    let pipeline = image;

    if (resizeOptions.width || resizeOptions.height) {
      pipeline = pipeline.resize({
        ...resizeOptions,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    const webpBuffer = await pipeline
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    return webpBuffer;
  } catch (error) {
    logger.error('Failed to resize and convert image', { error });
    throw new Error(`Image processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function isSupportedForPreview(mimeType: string): boolean {
  return mimeType === 'application/pdf' || mimeType.startsWith('image/');
}
