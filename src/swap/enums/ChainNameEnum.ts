/**
 * The swap layer names the Zcash network the way the mobile wallet does, so
 * the ported modules read identically against both. zingo-pc already reifies
 * the same three values, so this aliases rather than duplicates them.
 */
export { ServerChainNameEnum as ChainNameEnum } from "../../components/appstate";
