import { ServerChainNameEnum, ServerClass } from "../components/appstate";
import fetchServerList from "./fetchServerList";
import selectFastestServer from "./selectFastestServer";
import serverUrisList from "./serverUrisList";

/**
 * The server to move to when the active one stops answering, or null when there
 * is nowhere to go.
 *
 * Same ladder the launch uses — the registry's first entry, then the static
 * list raced, then the server we ship for the chain — with the failing one
 * excluded at every rung. Staying on the same chain is not negotiable: a wallet
 * cannot follow its server onto a different one.
 */
const pickRotationTarget = async (chainName: ServerChainNameEnum, failingUri: string): Promise<string | null> => {
  const live: ServerClass[] = (await fetchServerList(chainName)).filter((s: ServerClass) => s.uri !== failingUri);
  if (live.length > 0) {
    return live[0].uri;
  }

  const candidates: ServerClass[] = serverUrisList().filter(
    (s: ServerClass) => s.chain_name === chainName && !s.obsolete && s.uri !== failingUri,
  );
  const fastest: ServerClass | null = await selectFastestServer(candidates);
  if (fastest) {
    return fastest.uri;
  }

  const shipped: ServerClass | undefined = candidates.find((s: ServerClass) => s.default);
  return shipped ? shipped.uri : null;
};

export default pickRotationTarget;
