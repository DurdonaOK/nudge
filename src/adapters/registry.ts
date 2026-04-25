import type { Channel, ProviderAdapter } from "../types.js";

export class AdapterRegistry {
  #adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    this.#adapters.set(adapter.name, adapter);
  }

  get(name: string): ProviderAdapter | undefined {
    return this.#adapters.get(name);
  }

  /** All adapters that support a given channel */
  forChannel(channel: Channel): ProviderAdapter[] {
    return [...this.#adapters.values()].filter((a) =>
      a.capabilities.channels.includes(channel)
    );
  }

  all(): ProviderAdapter[] {
    return [...this.#adapters.values()];
  }
}
