import { ServerChainNameEnum, ServerClass } from "../components/appstate";
import fetchServerList from "./fetchServerList";
import selectFastestServer, { RACE_CANDIDATES } from "./selectFastestServer";
import serverUrisList from "./serverUrisList";

// A rotation is the user waiting on a click, not a launch settling in, so it
// gives up on a silent server sooner than the boot-time race does.
const ROTATION_PROBE_MS = 5 * 1000;

/**
 * Where the wallet could move, best first, excluding everything already
 * rejected. Cheap: the registry read is served from the main-process cache and
 * nothing is probed, so a caller can ask before offering the user a choice.
 *
 * When the registry answered, its list is the whole truth — running out of it
 * means there is nowhere to go. Falling back to the static list there would
 * offer servers the registry has just told us are not online, which on testnet
 * meant proposing a dead host and then waiting out its timeout. The static list
 * stands in only when the registry said nothing at all.
 */
export const rotationCandidates = async (
  chainName: ServerChainNameEnum,
  rejected: string[],
): Promise<ServerClass[]> => {
  const live: ServerClass[] = await fetchServerList(chainName);
  if (live.length > 0) {
    return live.filter((s: ServerClass) => !rejected.includes(s.uri));
  }
  return serverUrisList().filter(
    (s: ServerClass) => s.chain_name === chainName && !s.obsolete && !rejected.includes(s.uri),
  );
};

/**
 * The server to move to, or null when there is nowhere to go.
 *
 * Same shape as the launch pick: race the best few against each other and take
 * whoever answers first, since the registry ranks by its own ping and not by
 * what this machine sees. Staying on the same chain is not negotiable — a
 * wallet cannot follow its server onto a different one.
 */
const pickRotationTarget = async (chainName: ServerChainNameEnum, rejected: string[]): Promise<string | null> => {
  const candidates: ServerClass[] = (await rotationCandidates(chainName, rejected)).slice(0, RACE_CANDIDATES);
  if (candidates.length === 0) {
    return null;
  }
  const quickest: ServerClass | null = await selectFastestServer(candidates, ROTATION_PROBE_MS);
  return quickest ? quickest.uri : candidates[0].uri;
};

export default pickRotationTarget;
