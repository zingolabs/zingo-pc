import { FLASHNET_EXPLORER_RETRY_MS, FlashnetExplorerClient } from "./FlashnetExplorerClient";

jest.mock("../electronBridge");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ipcRenderer } = require("../electronBridge");

const ORDER = "ord_00000000-aaaa-bbbb-cccc-000000000001";
const SOURCE_HASH = "SourceSignaturePlaceholder".padEnd(88, "x");

const answer = (status: number, body: unknown) =>
  ipcRenderer.invoke.mockResolvedValue({ ok: status >= 200 && status < 300, status, text: JSON.stringify(body) });

/**
 * SwapKit's `/track` leaves the source leg of an inbound Flashnet swap without
 * a hash; Flashnet's explorer has it. These pin what is read from that API and
 * how often it is asked.
 */
describe("FlashnetExplorerClient", () => {
  it("reads the source transaction hash of an order, through the main process", async () => {
    answer(200, { operation: { status: "completed", sourceChain: "solana", sourceTxHash: SOURCE_HASH } });

    await expect(new FlashnetExplorerClient().getOrderSourceTxHash(ORDER)).resolves.toBe(SOURCE_HASH);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      "swapHttp:request",
      expect.objectContaining({
        method: "GET",
        url: `https://orchestration.flashnet.xyz/v1/explorer/operations/${ORDER}`,
      }),
    );
  });

  it("answers nothing for an order without a source hash yet", async () => {
    answer(200, { operation: { status: "processing", sourceTxHash: null } });

    await expect(new FlashnetExplorerClient().getOrderSourceTxHash(ORDER)).resolves.toBeNull();
  });

  it("answers nothing for a placeholder hash", async () => {
    answer(200, { operation: { sourceTxHash: "0x" + "0".repeat(64) } });

    await expect(new FlashnetExplorerClient().getOrderSourceTxHash(ORDER)).resolves.toBeNull();
  });

  it("answers nothing for an order Flashnet does not know", async () => {
    answer(404, { error: { code: "not_found" } });

    await expect(new FlashnetExplorerClient().getOrderSourceTxHash(ORDER)).resolves.toBeNull();
  });

  it("throws on any other failure, for the caller to log", async () => {
    answer(500, { error: { code: "internal_error" } });

    await expect(new FlashnetExplorerClient().getOrderSourceTxHash(ORDER)).rejects.toThrow(/HTTP 500/);
  });

  // The id goes into a URL path; anything that is not a Flashnet order id is
  // not sent anywhere.
  it("asks nothing about an id that is not a Flashnet order id", async () => {
    await expect(new FlashnetExplorerClient().getOrderSourceTxHash("../v1/admin")).resolves.toBeNull();
    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
  });

  it("asks once for an order whose hash it already found", async () => {
    answer(200, { operation: { sourceTxHash: SOURCE_HASH } });
    const client = new FlashnetExplorerClient();

    await client.getOrderSourceTxHash(ORDER);
    await client.getOrderSourceTxHash(ORDER);

    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
  });

  // The poller ticks every few seconds; a miss must not turn into a request
  // every few seconds.
  it("waits a minute before asking again about an order with no hash", async () => {
    answer(200, { operation: { sourceTxHash: null } });
    let now = 1_000_000;
    const client = new FlashnetExplorerClient(() => now);

    await client.getOrderSourceTxHash(ORDER);
    now += FLASHNET_EXPLORER_RETRY_MS - 1;
    await client.getOrderSourceTxHash(ORDER);
    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);

    now += 1;
    await client.getOrderSourceTxHash(ORDER);
    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(2);
  });
});
