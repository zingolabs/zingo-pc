import { SwapKitHttpError } from "./errors";

/**
 * Whether SwapKit turned the request away for the app's request quota.
 *
 * The quota belongs to the app's API key, which every user of the app shares,
 * so a 429 is about how busy the swap service is, not about the route, the
 * provider or the wallet.
 */
export const isRateLimited = (error: unknown): boolean => error instanceof SwapKitHttpError && error.httpStatus === 429;

/** What the user is told about a 429, wherever it lands. */
export const RATE_LIMITED_MESSAGE = "The swap service is busy right now. Try again in a minute.";
