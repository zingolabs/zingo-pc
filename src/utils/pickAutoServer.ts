import { ServerChainNameEnum, ServerClass } from "../components/appstate";
import fetchServerList from "./fetchServerList";
import { pickRecommended } from "./recommendedServers";
import selectFastestServer, { RACE_CANDIDATES } from "./selectFastestServer";
import serverUrisList from "./serverUrisList";

/** Where Automatic's pick came from; `default` means no server answered. */
export type AutoServerTier = "recommended" | "registry" | "static" | "default";

/**
 * Automatic's server, in zingo-mobile's order: the recommended (Zaino) server
 * while it answers, then the fastest of the registry's best few, then the
 * fastest of the static list, and the chain's default when none answers.
 * Null only for a chain with no default (regtest), or when the default is one
 * of `avoided` and `defaultEvenIfAvoided` is false.
 *
 * `avoided` are the servers the user rotated away from: no tier offers them.
 * `live` is the registry list when the caller has already read it.
 */
const pickAutoServer = async (
  chain: ServerChainNameEnum,
  {
    avoided = [],
    live,
    probeMs,
    defaultEvenIfAvoided = true,
  }: { avoided?: string[]; live?: ServerClass[]; probeMs?: number; defaultEvenIfAvoided?: boolean } = {},
): Promise<{ uri: string; tier: AutoServerTier } | null> => {
  const recommended: string | null = await pickRecommended(chain, avoided, probeMs);
  if (recommended) {
    return { uri: recommended, tier: "recommended" };
  }

  const tried = new Set<string>(avoided);
  serverUrisList()
    .filter((s: ServerClass) => s.recommended)
    .forEach((s: ServerClass) => tried.add(s.uri));

  // The registry ranks by 30-day uptime, not speed, so its best few race.
  const registry: ServerClass[] = (live ?? (await fetchServerList(chain)))
    .filter((s: ServerClass) => !tried.has(s.uri))
    .slice(0, RACE_CANDIDATES);
  const fromRegistry: ServerClass | null = await selectFastestServer(registry, probeMs);
  if (fromRegistry) {
    return { uri: fromRegistry.uri, tier: "registry" };
  }
  registry.forEach((s: ServerClass) => tried.add(s.uri));

  const fromStatic: ServerClass | null = await selectFastestServer(
    serverUrisList().filter((s: ServerClass) => s.chain_name === chain && !s.obsolete && !tried.has(s.uri)),
    probeMs,
  );
  if (fromStatic) {
    return { uri: fromStatic.uri, tier: "static" };
  }

  const fallback: string | undefined = serverUrisList().find(
    (s: ServerClass) => s.chain_name === chain && !s.obsolete && s.default,
  )?.uri;
  if (!fallback || (!defaultEvenIfAvoided && avoided.includes(fallback))) {
    return null;
  }
  return { uri: fallback, tier: "default" };
};

export default pickAutoServer;
