"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPlayground, type Playground, type Snapshot } from "./store";

// One playground per page: the board, the headline and the tour read the same pool.
const PlaygroundContext = createContext<Playground | null>(null);

export function PlaygroundProvider({ children }: { children: ReactNode }) {
  const [playground] = useState(createPlayground);
  return <PlaygroundContext value={playground}>{children}</PlaygroundContext>;
}

export function usePlayground(): { state: Snapshot; playground: Playground } {
  const playground = useContext(PlaygroundContext);
  if (playground === null) throw new Error("usePlayground needs a PlaygroundProvider above it");
  const state = useSyncExternalStore(playground.subscribe, playground.snapshot, playground.snapshot);
  return { state, playground };
}
