import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test-utils";
import ServerHealthLine from "./ServerHealthLine";
import {
  CreationTypeEnum,
  PerformanceLevelEnum,
  ServerChainNameEnum,
  ServerSelectionEnum,
  WalletType,
  InfoClass,
} from "../appstate";
import { INITIAL_SERVER_HEALTH, ServerHealthState, recordProbe } from "../../rpc/components/serverHealth";
import fetchServerList from "../../utils/fetchServerList";
import selectFastestServer, { latencyOf } from "../../utils/selectFastestServer";

jest.mock("../../electronBridge");
jest.mock("../../utils/fetchServerList");
jest.mock("../../utils/selectFastestServer", () => ({
  __esModule: true,
  default: jest.fn(),
  latencyOf: jest.fn(),
  RACE_CANDIDATES: 3,
}));

const liveList = fetchServerList as jest.MockedFunction<typeof fetchServerList>;
const race = selectFastestServer as jest.MockedFunction<typeof selectFastestServer>;
const probe = latencyOf as jest.MockedFunction<typeof latencyOf>;

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

const wallet = (selection: ServerSelectionEnum): WalletType => ({
  id: 1,
  fileName: "",
  alias: "Main Wallet",
  chain_name: ServerChainNameEnum.mainChainName,
  creationType: CreationTypeEnum.Main,
  uri: "https://zec.rocks:443",
  selection,
  performanceLevel: PerformanceLevelEnum.High,
});

const fold = (outcomes: boolean[]): ServerHealthState =>
  outcomes.reduce((state, answered) => recordProbe(state, answered), INITIAL_SERVER_HEALTH);

const delegateServerChoice = jest.fn();
const switchServer = jest.fn();
const openConfirmModal = jest.fn();
const openErrorModal = jest.fn();
const rotateServer = jest.fn();

const show = (selection: ServerSelectionEnum, outcomes: boolean[]) =>
  render(<ServerHealthLine />, {
    contextOverrides: {
      currentWallet: wallet(selection),
      serverHealth: fold(outcomes),
      openConfirmModal,
      openErrorModal,
      rotateServer,
      delegateServerChoice,
      switchServer,
    },
  });

// The dot is a drawn circle now, so it carries no text to query by.
const dotHealth = () => screen.getByTestId("server-health-dot").getAttribute("data-health");

const HEALTHY = [true];
const DEAD = [false, false, false];

beforeEach(() => {
  mockNavigate.mockReset();
  openConfirmModal.mockReset();
  openErrorModal.mockReset();
  rotateServer.mockReset();
  delegateServerChoice.mockReset();
  switchServer.mockReset();
  liveList.mockReset().mockResolvedValue([]);
  race.mockReset().mockResolvedValue(null);
  // The picker times its own list; without an answer here every row would
  // settle on "no answer" and the sweep would say nothing.
  probe.mockReset().mockResolvedValue(12);
});

test("shows the active server, its network, its mode and a dot", () => {
  show(ServerSelectionEnum.auto, HEALTHY);

  expect(screen.getByText("https://zec.rocks:443")).toBeInTheDocument();
  expect(screen.getByText("Mainnet")).toBeInTheDocument();
  expect(screen.getByText("auto")).toBeInTheDocument();
  expect(dotHealth()).toBe("ok");
});

// The wallet selector's optgroups label the network, but a closed select shows
// only the alias — so without this the app never says which chain it is on.
test("names whichever network the wallet is on", () => {
  render(<ServerHealthLine />, {
    contextOverrides: {
      currentWallet: { ...wallet(ServerSelectionEnum.auto), chain_name: ServerChainNameEnum.testChainName },
      serverHealth: fold(HEALTHY),
      openConfirmModal,
      openErrorModal,
      rotateServer,
      delegateServerChoice,
      switchServer,
    },
  });

  expect(screen.getByText("Testnet")).toBeInTheDocument();
  expect(screen.queryByText("Mainnet")).not.toBeInTheDocument();
});

// The mode comes off the wallet record, which makes this the one place the app
// admits at all times which mode is really in force.
test("shows whichever mode the wallet actually carries", () => {
  show(ServerSelectionEnum.custom, HEALTHY);

  expect(screen.getByText("custom")).toBeInTheDocument();
});

test.each([
  ["ok", HEALTHY, /answering/i],
  ["unstable", [true, false], /not three in a row/i],
  ["down", DEAD, /last three checks/i],
])("the %s dot explains itself in a tooltip", (level, outcomes, wording) => {
  show(ServerSelectionEnum.auto, outcomes as boolean[]);

  expect(dotHealth()).toBe(level);
  expect(screen.getByTestId("server-health-dot")).toHaveAttribute("title", expect.stringMatching(wording));
});

// Clicking follows the mode, not the colour: the mode says who owns the choice
// of server, and that decides who gets to change it.
test.each([[HEALTHY], [DEAD]])("auto always offers to rotate, dot at %#", async (outcomes) => {
  show(ServerSelectionEnum.auto, outcomes);
  fireEvent.click(screen.getByRole("button", { name: "Active server health" }));

  await waitFor(() => expect(openConfirmModal).toHaveBeenCalledTimes(1));
  expect(mockNavigate).not.toHaveBeenCalled();

  // Nothing moves until the user accepts.
  expect(rotateServer).not.toHaveBeenCalled();
  openConfirmModal.mock.calls[0][2]();
  expect(rotateServer).toHaveBeenCalledTimes(1);
});

// Rotating answers "this one is misbehaving". A user who wants a particular
// server is asking something else, and had nowhere to say it: the picker only
// ever opened for a wallet already on `list`, a mode reachable only through
// the wallet settings screen.
test("auto also offers to choose a server by hand", async () => {
  show(ServerSelectionEnum.auto, HEALTHY);
  fireEvent.click(screen.getByRole("button", { name: "Active server health" }));

  await waitFor(() => expect(openConfirmModal).toHaveBeenCalledTimes(1));
  const alternate = openConfirmModal.mock.calls[0][3];
  expect(alternate).toEqual({ label: "Servers List", action: expect.any(Function) });

  // The picker is not up until that button is the one pressed.
  expect(screen.queryByText("Choose a Mainnet server")).not.toBeInTheDocument();
  alternate.action();
  expect(await screen.findByText("Choose a Mainnet server")).toBeInTheDocument();
});

// Testnet publishes a single usable server. Asking "move to another server?"
// there, and then sitting out a probe to answer its own question, was the
// shape of the bug.
test("auto says so instead of asking when there is nowhere to go", async () => {
  // The registry answers with only the server already in use, so after
  // excluding it nothing remains — and the static list must not stand in.
  liveList.mockResolvedValue([
    {
      uri: "https://zec.rocks:443",
      chain_name: ServerChainNameEnum.mainChainName,
      latency: 50,
      default: false,
      obsolete: false,
    },
  ]);
  show(ServerSelectionEnum.auto, HEALTHY);
  fireEvent.click(screen.getByRole("button", { name: "Active server health" }));

  await waitFor(() => expect(openErrorModal).toHaveBeenCalledTimes(1));
  expect(openConfirmModal).not.toHaveBeenCalled();
  expect(rotateServer).not.toHaveBeenCalled();
});
test.each([[HEALTHY], [DEAD]])("custom always goes to the settings screen, dot at %#", (outcomes) => {
  show(ServerSelectionEnum.custom, outcomes);
  fireEvent.click(screen.getByRole("button", { name: "Active server health" }));

  expect(mockNavigate).toHaveBeenCalled();
  expect(openConfirmModal).not.toHaveBeenCalled();
  expect(rotateServer).not.toHaveBeenCalled();
});

test.each([[HEALTHY], [DEAD]])("list opens the picker in place, dot at %#", async (outcomes) => {
  show(ServerSelectionEnum.list, outcomes);
  fireEvent.click(screen.getByRole("button", { name: "Active server health" }));

  expect(await screen.findByText(/Choose a Mainnet server/)).toBeInTheDocument();
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(openConfirmModal).not.toHaveBeenCalled();
});

// The registry answers fastest-first, so the head is where an automatic pick
// lands. Auto takes it, not just the mode: setting the mode while leaving the
// wallet on a hand-chosen server would only half mean it.
const registry = (...uris: string[]) =>
  liveList.mockResolvedValue(
    uris.map((uri) => ({
      uri,
      chain_name: ServerChainNameEnum.mainChainName,
      latency: 10,
      default: false,
      obsolete: false,
    })),
  );

const openPickerFromList = async () => {
  show(ServerSelectionEnum.list, HEALTHY);
  fireEvent.click(screen.getByRole("button", { name: "Active server health" }));
  await screen.findByText("Choose a Mainnet server");
};

const wins = (uri: string) =>
  race.mockResolvedValue({
    uri,
    chain_name: ServerChainNameEnum.mainChainName,
    latency: 10,
    default: false,
    obsolete: false,
  });

// The winner, not the first row. The registry orders by its own ping from its
// own vantage point; the wallet races from the user's. Pressing Auto has to
// land where a restart would, and a restart races.
test("Auto takes the winner of the race, not the head of the list", async () => {
  registry("https://head.example:443", "https://second.example:443");
  wins("https://second.example:443");
  await openPickerFromList();

  fireEvent.click(screen.getByRole("button", { name: "Auto" }));
  await waitFor(() =>
    expect(switchServer).toHaveBeenCalledWith("https://second.example:443", ServerSelectionEnum.auto),
  );
  expect(switchServer).not.toHaveBeenCalledWith("https://head.example:443", expect.anything());
  expect(delegateServerChoice).not.toHaveBeenCalled();
});

// Nothing to move to, so only the mode is recorded — moving anyway would
// reopen the wallet against the server it is already on.
test("Auto records the mode alone when the race lands on the server in use", async () => {
  registry("https://head.example:443", "https://zec.rocks:443");
  wins("https://zec.rocks:443");
  await openPickerFromList();

  fireEvent.click(screen.getByRole("button", { name: "Auto" }));
  await waitFor(() => expect(delegateServerChoice).toHaveBeenCalledTimes(1));
  expect(switchServer).not.toHaveBeenCalled();
});

// A race nobody wins still has to answer. The head is the registry's own best
// guess, which is the right thing to fall back to.
test("Auto falls back to the head when no candidate answers", async () => {
  registry("https://head.example:443", "https://second.example:443");
  race.mockResolvedValue(null);
  await openPickerFromList();

  fireEvent.click(screen.getByRole("button", { name: "Auto" }));
  await waitFor(() => expect(switchServer).toHaveBeenCalledWith("https://head.example:443", ServerSelectionEnum.auto));
});

// Reachable from auto through the confirmation's third button, and offered
// there too: pressing it is asking to be moved to the current best, which is
// a real request rather than a no-op.
test("Auto is offered to a wallet already on it", async () => {
  registry("https://faster.example:443", "https://zec.rocks:443");
  wins("https://faster.example:443");
  show(ServerSelectionEnum.auto, HEALTHY);
  fireEvent.click(screen.getByRole("button", { name: "Active server health" }));

  await waitFor(() => expect(openConfirmModal).toHaveBeenCalledTimes(1));
  openConfirmModal.mock.calls[0][3].action();
  await screen.findByText("Choose a Mainnet server");

  fireEvent.click(screen.getByRole("button", { name: "Auto" }));
  await waitFor(() =>
    expect(switchServer).toHaveBeenCalledWith("https://faster.example:443", ServerSelectionEnum.auto),
  );
});

// A rotation is auto doing what auto is for. It moves the server and must
// leave the mode alone, which it did not when the switch decided the mode for
// every caller.
test("rotating does not turn the wallet into a hand pick", async () => {
  show(ServerSelectionEnum.auto, HEALTHY);
  fireEvent.click(screen.getByRole("button", { name: "Active server health" }));

  await waitFor(() => expect(openConfirmModal).toHaveBeenCalledTimes(1));
  openConfirmModal.mock.calls[0][2]();
  expect(rotateServer).toHaveBeenCalledTimes(1);
  // Rotation goes through its own handler, which calls the switch with no
  // selection at all — the assertion that matters is that nothing here names
  // one.
  expect(switchServer).not.toHaveBeenCalledWith(expect.anything(), ServerSelectionEnum.list);
});

test("renders nothing without a wallet", () => {
  const { container } = render(<ServerHealthLine />, { contextOverrides: { currentWallet: null } });

  expect(container).toBeEmptyDOMElement();
});

// A wallet record with no URI used to hide the line entirely, which is exactly
// when you would want to see what the session is actually talking to.
test("falls back to the URI the server reports when the record has none", () => {
  const info = new InfoClass();
  info.serverUri = "https://eu.zec.rocks:443";
  render(<ServerHealthLine />, {
    contextOverrides: { currentWallet: { ...wallet(ServerSelectionEnum.auto), uri: "" }, info },
  });

  expect(screen.getByText("https://eu.zec.rocks:443")).toBeInTheDocument();
});

// The picker and the wallet settings list must read alike, so both label a
// server with its URI, its chain and, when known, its latency.
test("the picker labels servers the way the settings list does", async () => {
  liveList.mockResolvedValue([
    {
      uri: "https://one.zec.rocks:443",
      chain_name: ServerChainNameEnum.mainChainName,
      latency: 42,
      default: false,
      obsolete: false,
    },
  ]);
  show(ServerSelectionEnum.list, HEALTHY);
  fireEvent.click(screen.getByRole("button", { name: "Active server health" }));

  expect(await screen.findByText("https://one.zec.rocks:443 - Mainnet _ 12 ms.")).toBeInTheDocument();
});

// Until this machine has an answer the registry's estimate is all there is, so
// it is shown — marked borrowed with a tilde rather than passed off as ours.
// The probe is held pending, because in a test it otherwise resolves before
// the borrowed value can be seen at all.
test("the picker shows the registry estimate while it measures", async () => {
  liveList.mockResolvedValue([
    {
      uri: "https://one.zec.rocks:443",
      chain_name: ServerChainNameEnum.mainChainName,
      latency: 42,
      default: false,
      obsolete: false,
    },
  ]);
  let answer: (ms: number | null) => void = () => {};
  probe.mockImplementation(() => new Promise<number | null>((resolve) => (answer = resolve)));

  show(ServerSelectionEnum.list, HEALTHY);
  fireEvent.click(screen.getByRole("button", { name: "Active server health" }));

  expect(await screen.findByText("https://one.zec.rocks:443 - Mainnet _ ~42 ms.")).toBeInTheDocument();

  await act(async () => {
    answer(12);
  });
  expect(await screen.findByText("https://one.zec.rocks:443 - Mainnet _ 12 ms.")).toBeInTheDocument();
});

// A server that is listed and does not answer is worth saying so about: it is
// the one fact the registry's own number cannot tell this user.
test("the picker says which servers did not answer", async () => {
  liveList.mockResolvedValue([
    {
      uri: "https://silent.example:443",
      chain_name: ServerChainNameEnum.mainChainName,
      latency: 42,
      default: false,
      obsolete: false,
    },
  ]);
  probe.mockResolvedValue(null);
  show(ServerSelectionEnum.list, HEALTHY);
  fireEvent.click(screen.getByRole("button", { name: "Active server health" }));

  expect(await screen.findByText("https://silent.example:443 - Mainnet _ no answer")).toBeInTheDocument();
});

// Quickest first once every answer is in. The registry's order is its own ping
// from its own vantage point, which is not this user's.
test("the picker reorders on what it measured", async () => {
  liveList.mockResolvedValue(
    ["https://slow.example:443", "https://quick.example:443"].map((uri) => ({
      uri,
      chain_name: ServerChainNameEnum.mainChainName,
      latency: 10,
      default: false,
      obsolete: false,
    })),
  );
  probe.mockImplementation(async (server) => (server.uri === "https://quick.example:443" ? 5 : 500));
  show(ServerSelectionEnum.list, HEALTHY);
  fireEvent.click(screen.getByRole("button", { name: "Active server health" }));

  await screen.findByText("https://quick.example:443 - Mainnet _ 5 ms.");
  await waitFor(() => {
    const rows = screen.getAllByRole("button").filter((b) => b.textContent?.includes("example:443"));
    expect(rows[0].textContent).toContain("quick.example");
  });
});
