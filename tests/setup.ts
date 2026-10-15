import { vi } from "vitest";

// Prevent accidental real network calls in tests
vi.stubGlobal("fetch", vi.fn());
