import { ChainNameEnum } from "./enums/ChainNameEnum";
import { SwapKitClient } from "./SwapKitClient";
import { swapHttpRequest } from "./swapHttp";

jest.mock("./swapHttp", () => ({ swapHttpRequest: jest.fn() }));

const request = swapHttpRequest as jest.MockedFunction<typeof swapHttpRequest>;

/** SwapKit's edge answering for an origin that did not. */
const gatewayTimeout = { ok: false, status: 504, text: "The origin web server did not respond in time." };
const serviceUnavailable = { ok: false, status: 503, text: "" };
const ok = { ok: true, status: 200, text: '{"routes":[]}' };
/** The amount is below a provider's minimum — asking again returns this again. */
const noRoutes = { ok: false, status: 404, text: '{"error":"noRoutesFound"}' };

const client = () => new SwapKitClient({ apiKey: "k", chainName: ChainNameEnum.mainChainName });

const quoteParams = {
  sellAsset: "ZEC.ZEC",
  buyAsset: "BTC.BTC",
  sellAmount: "1",
  sourceAddress: "t1source",
  destinationAddress: "bc1dest",
};

const swapParams = {
  routeId: "r1",
  sourceAddress: "t1source",
  destinationAddress: "bc1dest",
};

beforeEach(() => request.mockReset());

describe("SwapKitClient transient retries", () => {
  // The reported symptom: a 504 on one refresh surfaced as a failed quote, and
  // the panel treats a failed quote as final.
  it("absorbs a 504 on a quote instead of reporting it", async () => {
    request.mockResolvedValueOnce(gatewayTimeout).mockResolvedValueOnce(ok);

    await expect(client().quote(quoteParams)).resolves.toEqual({ routes: [] });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("absorbs a 503 the same way", async () => {
    request.mockResolvedValueOnce(serviceUnavailable).mockResolvedValueOnce(ok);

    await expect(client().quote(quoteParams)).resolves.toEqual({ routes: [] });
  });

  // A provider that is genuinely down still has to be reported, and the count
  // is bounded so a bad minute is not spent hammering it.
  it("gives up after three attempts and reports the failure", async () => {
    request.mockResolvedValue(gatewayTimeout);

    await expect(client().quote(quoteParams)).rejects.toThrow(/504/);
    expect(request).toHaveBeenCalledTimes(3);
  });

  // The commit is the one call that must never be repeated: a timeout there can
  // mean the swap was created and only the answer was lost.
  it("never repeats the commit", async () => {
    request.mockResolvedValue(gatewayTimeout);

    await expect(client().swap(swapParams)).rejects.toThrow(/504/);
    expect(request).toHaveBeenCalledTimes(1);
  });

  // Repeating this one would return the same answer more slowly.
  it("does not repeat an answer the far side actually gave", async () => {
    request.mockResolvedValue(noRoutes);

    await expect(client().quote(quoteParams)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });

  // The budget is what keeps the retry from making things worse: a request that
  // burned its whole timeout leaves no room for another inside it.
  it("does not stack attempts that each spent their full timeout", async () => {
    const startedAtMs = Date.now();
    let clockMs = startedAtMs;
    jest.spyOn(Date, "now").mockImplementation(() => clockMs);
    request.mockImplementation(async () => {
      clockMs += 15_000;
      return gatewayTimeout;
    });

    await expect(client().quote(quoteParams)).rejects.toThrow(/504/);
    expect(request).toHaveBeenCalledTimes(1);

    jest.spyOn(Date, "now").mockRestore();
  });
});
