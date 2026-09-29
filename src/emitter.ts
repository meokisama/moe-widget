type Listener<T> = (payload: T) => void;

export class Emitter<Events extends object> {
  #listeners = new Map<keyof Events, Set<Listener<never>>>();

  /** Subscribes to an event and returns the function that unsubscribes. */
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.#listeners.get(event);
    if (!set) this.#listeners.set(event, (set = new Set()));
    set.add(listener);
    return () => set.delete(listener);
  }

  /** Like `on`, but the listener runs once. */
  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  protected emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const listener of this.#listeners.get(event) ?? []) {
      // One throwing listener must not starve the others or break the render loop.
      try {
        (listener as Listener<Events[K]>)(payload);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  protected clear(): void {
    this.#listeners.clear();
  }
}
