import "@testing-library/jest-dom";

// This jsdom build exposes a `localStorage` accessor that resolves to undefined,
// so tests get a minimal in-memory implementation. Real browsers always provide
// the API; only the test environment needs this shim.
if (!window.localStorage) {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => void store.delete(key),
    setItem: (key, value) => void store.set(key, String(value)),
  };

  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
}
