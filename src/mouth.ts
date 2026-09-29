export type Voice = string | HTMLMediaElement | MediaStream;

// Speech RMS rarely passes 0.15, so this maps normal speech to a mostly open mouth.
const GAIN = 6;
// Seconds to move most of the way to the target: the mouth opens fast and closes softer.
const OPEN_S = 0.04;
const CLOSE_S = 0.1;

let shared: AudioContext | undefined;
// createMediaElementSource throws on a second call for the same element.
const sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

/**
 * Drives the model's lip-sync parameters from a value set by hand, from audio,
 * or both: whichever is louder wins.
 */
export class Mouth {
  /** 0 closed, 1 fully open. */
  manual = 0;
  #level = 0;
  #analyser: AnalyserNode | undefined;
  #samples: Float32Array<ArrayBuffer> | undefined;
  #stop: (() => void) | undefined;

  value(deltaSeconds: number): number {
    let target = 0;
    if (this.#analyser && this.#samples) {
      this.#analyser.getFloatTimeDomainData(this.#samples);
      let sum = 0;
      for (const sample of this.#samples) sum += sample * sample;
      target = Math.min(1, Math.sqrt(sum / this.#samples.length) * GAIN);
    }
    const rate = target > this.#level ? OPEN_S : CLOSE_S;
    this.#level += (target - this.#level) * (1 - Math.exp(-deltaSeconds / rate));
    return Math.max(this.manual, this.#level);
  }

  /**
   * Plays a URL or media element, or listens to a stream such as a microphone, and
   * moves the mouth with it. Resolves when it ends, is stopped, or another voice starts.
   */
  speak(voice: Voice, signal?: AbortSignal): Promise<void> {
    this.stop();
    shared ??= new AudioContext();
    const context = shared;
    void context.resume();

    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    this.#analyser = analyser;
    this.#samples = new Float32Array(analyser.fftSize);

    return new Promise<void>((resolve, reject) => {
      let node: AudioNode;
      let element: HTMLMediaElement | undefined;
      let ownElement = false;

      const finish = () => {
        if (this.#stop !== finish) return;
        this.#stop = undefined;
        this.#analyser = undefined;
        node.disconnect();
        analyser.disconnect();
        if (element) {
          element.removeEventListener("ended", finish);
          element.removeEventListener("error", fail);
          if (ownElement) {
            element.pause();
            element.removeAttribute("src");
          }
        }
        signal?.removeEventListener("abort", finish);
        resolve();
      };
      const fail = () => {
        finish();
        reject(new Error(`moe2d: could not play ${element?.currentSrc || "the voice"}`));
      };
      this.#stop = finish;
      signal?.addEventListener("abort", finish, { once: true });

      if (voice instanceof MediaStream) {
        // Not routed to the speakers: a microphone would echo.
        node = context.createMediaStreamSource(voice);
        node.connect(analyser);
        voice.getTracks()[0]?.addEventListener("ended", finish, { once: true });
        return;
      }

      if (typeof voice === "string") {
        element = new Audio();
        element.crossOrigin = "anonymous";
        element.src = voice;
        ownElement = true;
      } else {
        element = voice;
      }
      let source = sources.get(element);
      if (!source) {
        source = context.createMediaElementSource(element);
        sources.set(element, source);
      }
      node = source;
      source.connect(analyser);
      analyser.connect(context.destination);
      element.addEventListener("ended", finish);
      element.addEventListener("error", fail);
      if (signal?.aborted) return finish();
      element.play().catch((error: unknown) => {
        finish();
        reject(error);
      });
    });
  }

  stop(): void {
    this.#stop?.();
  }
}
