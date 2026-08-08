import React from "react";
import { fireEvent, screen } from "@testing-library/react";
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

jest.mock("../../electronBridge");

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
const rotateServer = jest.fn();

const show = (selection: ServerSelectionEnum, outcomes: boolean[]) =>
  render(<ServerHealthLine />, {
    contextOverrides: {
      currentWallet: wallet(selection),
      serverHealth: fold(outcomes),
      openConfirmModal,
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
  rotateServer.mockReset();
});

test("shows the active server, its mode and a dot", () => {
  show(ServerSelectionEnum.auto, HEALTHY);

  expect(screen.getByText("https://zec.rocks:443")).toBeInTheDocument();
  expect(screen.getByText("auto")).toBeInTheDocument();
  expect(dotHealth()).toBe("ok");
});

// The mode comes off the wallet record, which makes this the one place the app
// admits at all times which mode is really in force.
test("shows whichever mode the wallet actually carries", () => {
  show(ServerSelectionEnum.custom, HEALTHY);

  expect(screen.getByText("custom")).toBeInTheDocument();
});

test("a healthy server goes straight to settings, no question asked", () => {
  show(ServerSelectionEnum.auto, HEALTHY);
  fireEvent.click(screen.getByRole("button", { name: "Active server health" }));

  expect(openConfirmModal).not.toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalled();
});

test("a dead server asks before rotating, and rotating is what it offers in auto", () => {
  show(ServerSelectionEnum.auto, DEAD);
  expect(dotHealth()).toBe("down");

  fireEvent.click(screen.getByRole("button", { name: "Active server health" }));
  expect(openConfirmModal).toHaveBeenCalledTimes(1);

  // Nothing moves until the user accepts.
  expect(rotateServer).not.toHaveBeenCalled();
  openConfirmModal.mock.calls[0][2]();
  expect(rotateServer).toHaveBeenCalledTimes(1);
});

// A server the user picked by hand is never swapped out from under them.
test.each([ServerSelectionEnum.list, ServerSelectionEnum.custom])("a dead server sends %s to the picker", (mode) => {
  show(mode, DEAD);
  fireEvent.click(screen.getByRole("button", { name: "Active server health" }));

  openConfirmModal.mock.calls[0][2]();
  expect(rotateServer).not.toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalled();
});

test("an unstable server asks too", () => {
  show(ServerSelectionEnum.auto, [true, false]);

  expect(dotHealth()).toBe("unstable");
  fireEvent.click(screen.getByRole("button", { name: "Active server health" }));
  expect(openConfirmModal).toHaveBeenCalledTimes(1);
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
