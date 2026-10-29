import { SwapService } from "./SwapService";

jest.mock("../electronBridge");

const serviceAnswering = (answer: unknown) =>
  new SwapService({
    client: { price: jest.fn(async () => answer) } as never,
    registry: null as never,
    store: null as never,
    poller: null as never,
    tokenCatalog: null as never,
  });

// The price of the coin a purchase is paid in, before any quote of it.
describe("SwapService.usdPrice", () => {
  it("reads the row of the coin asked about", async () => {
    const service = serviceAnswering([
      { identifier: "ETH.ETH", price_usd: 3000 },
      { identifier: "BTC.BTC", price_usd: 60000 },
    ]);
    await expect(service.usdPrice("btc.btc")).resolves.toBe(60000);
  });

  it("reads a lone row whatever it is named", async () => {
    await expect(serviceAnswering([{ priceUsd: "1.0002" }]).usdPrice("SOL.USDC")).resolves.toBe(1.0002);
  });

  it.each([[[]], [{}], [[{ identifier: "BTC.BTC", price_usd: 0 }]], [[{ identifier: "BTC.BTC" }]]])(
    "answers nothing for %p",
    async (answer) => {
      await expect(serviceAnswering(answer).usdPrice("BTC.BTC")).resolves.toBeNull();
    },
  );
});
