import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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

jest.mock("../../electronBridge");
jest.mock("../../utils/fetchServerList");

const liveList = fetchServerList as jest.MockedFunction<typeof fetchServerList>;

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
  liveList.mockReset().mockResolvedValue([]);
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

  expect(await screen.findByText("https://one.zec.rocks:443 - Mainnet _ 42 ms.")).toBeInTheDocument();
});
