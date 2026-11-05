import fs from "fs";
import path from "path";

import { MidgardClient } from "./MidgardClient";
import { SwapKitProviderEnum } from "./enums/SwapKitProviderEnum";
import { swapHttpRequest } from "./swapHttp";

jest.mock("./swapHttp", () => ({ swapHttpRequest: jest.fn() }));

const http = swapHttpRequest as jest.MockedFunction<typeof swapHttpRequest>;

const DESTINATION = "t1UZUBfxEMJ23fXTiaUoi7xLbbHaZX4Gz2b";
const MEMO = `=:z:${DESTINATION}:1432872/1/0:-_/zio:15/50`;
const HASH = "F46AF7C2DF153D979DEA69CC28E890C9699FE3FA625B2B7364F708D914FA0187";

describe("MidgardClient", () => {
  it("finds a THORChain deposit through a host the main process lets through", async () => {
    http.mockResolvedValue({
      ok: true,
      status: 200,
      text: JSON.stringify({
        actions: [
          {
            metadata: { swap: { memo: MEMO } },
            in: [{ txID: HASH, coins: [{ asset: "BTC.BTC", amount: "24887" }] }],
          },
        ],
      }),
    });

    const found = await new MidgardClient().findInboundActionByMemo({
      destinationAddress: DESTINATION,
      memo: MEMO,
      provider: SwapKitProviderEnum.ThorchainStreaming,
      chainIdForNormalization: "bitcoin",
    });

    expect(found).toEqual({ sourceTxHash: HASH.toLowerCase(), sourceChainPrefix: "BTC" });

    const { url } = http.mock.calls[0][0];
    expect(url).toBe(
      `https://gateway.liquify.com/chain/thorchain_midgard/v2/actions?address=${DESTINATION}&type=swap&limit=10`,
    );
    const electron = fs.readFileSync(path.join(__dirname, "..", "..", "public", "electron.js"), "utf8");
    const allowed = electron.slice(electron.indexOf("SWAP_HTTP_HOSTS"), electron.indexOf("SWAP_HTTP_MAX_TIMEOUT_MS"));
    expect(allowed).toContain(`"${new URL(url).hostname}"`);
  });
});
