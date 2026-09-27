import { useSyncExternalStore } from "react";
import { getState, subscribe } from "../data/store";
import type { AppData } from "../types";

export function useAppData(): AppData {
  return useSyncExternalStore(subscribe, getState, getState);
}
