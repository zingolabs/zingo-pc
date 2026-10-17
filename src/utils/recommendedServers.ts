import { ServerChainNameEnum, ServerClass } from "../components/appstate";
import selectFastestServer from "./selectFastestServer";
import serverUrisList from "./serverUrisList";

// A recommended server that does not answer in this long is skipped for the
// registry, so a dead one costs a launch a few seconds, not the full race.
const RECOMMENDED_PROBE_MS = 5 * 1000;

/** The recommended (Zaino) servers of a chain, from the static list, minus `avoided`. */
export const recommendedServers = (chain: ServerChainNameEnum, avoided: string[] = []): ServerClass[] =>
  serverUrisList().filter(
    (s: ServerClass) => s.recommended && !s.obsolete && s.chain_name === chain && !avoided.includes(s.uri),
  );

/**
 * The first recommended server of the chain to answer, or null when none does.
 * Automatic takes it over anything the registry offers, as zingo-mobile does.
 */
export const pickRecommended = async (
  chain: ServerChainNameEnum,
  avoided: string[] = [],
  timeoutMs: number = RECOMMENDED_PROBE_MS,
): Promise<string | null> => {
  const quickest: ServerClass | null = await selectFastestServer(recommendedServers(chain, avoided), timeoutMs);
  return quickest ? quickest.uri : null;
};

/** `servers` with the chain's recommended ones first, each listed once. */
export const withRecommended = (
  chain: ServerChainNameEnum,
  servers: ServerClass[],
  avoided: string[] = [],
): ServerClass[] => {
  const recommended: ServerClass[] = recommendedServers(chain, avoided);
  const uris = new Set(recommended.map((s: ServerClass) => s.uri));
  return [...recommended, ...servers.filter((s: ServerClass) => !uris.has(s.uri))];
};
