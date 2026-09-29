const WIDTH = 360;
const HEIGHT = 480;
const PADDING = 16;
// The share of the model's height kept from the top: head to waist on a full-body model.
const UPPER = 0.5;

/**
 * Copies the next frame of a WebGL canvas, cropped to the upper half of its opaque pixels and
 * filling a 3:4 PNG. Call it outside a frame callback, so the library's draw for that frame runs first.
 */
export function snapshot(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // The drawing buffer is only readable in the frame that drew it.
    requestAnimationFrame(() => {
      const copy = document.createElement("canvas");
      copy.width = canvas.width;
      copy.height = canvas.height;
      const context = copy.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(canvas, 0, 0);

      const { data, width, height } = context.getImageData(0, 0, copy.width, copy.height);
      const opaque = (x: number, y: number) => data[(y * width + x) * 4 + 3]! >= 8;
      let [top, bottom] = [height, -1];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!opaque(x, y)) continue;
          if (y < top) top = y;
          bottom = y;
        }
      }
      if (bottom < 0) return reject(new Error("the canvas is empty"));

      const h = (bottom - top + 1) * UPPER;
      // Centered on the mean of the kept pixels, so a prop held out to one side does not pull the crop.
      let [sum, count] = [0, 0];
      for (let y = top; y < top + h; y++) {
        for (let x = 0; x < width; x++) {
          if (opaque(x, y)) [sum, count] = [sum + x, count + 1];
        }
      }
      const k = (HEIGHT - PADDING) / h;
      const w = WIDTH / k;
      const left = sum / count - w / 2;

      const out = document.createElement("canvas");
      out.width = WIDTH;
      out.height = HEIGHT;
      const target = out.getContext("2d")!;
      target.imageSmoothingQuality = "high";
      target.drawImage(copy, left, top - PADDING / k, w, h + PADDING / k, 0, 0, WIDTH, HEIGHT);
      out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("could not encode the PNG"))), "image/png");
    });
  });
}
