import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../../test-utils";
import MixnetModal from "./MixnetModal";
import RPC from "../../../rpc/rpc";
import { deriveMixnetView } from "../../../rpc/components/mixnetPresenter";
import { RPCMixnetStatusType } from "../../../rpc/components/RPCMixnetStatusType";

jest.mock("../../../electronBridge");
jest.mock("../../../rpc/rpc");

const startMixnet = RPC.startMixnet as jest.MockedFunction<typeof RPC.startMixnet>;
const stopMixnet = RPC.stopMixnet as jest.MockedFunction<typeof RPC.stopMixnet>;

const show = (mode: RPCMixnetStatusType["mode"]) =>
  render(<MixnetModal modalIsOpen closeModal={jest.fn()} />, {
    contextOverrides: { mixnetView: deriveMixnetView({ mode }) },
  });

beforeEach(() => {
  startMixnet.mockReset().mockResolvedValue(undefined);
  stopMixnet.mockReset().mockResolvedValue(undefined);
});

test("a running transport offers to disable it", () => {
  show("ready");

  expect(screen.getByRole("button", { name: /^Disable$/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Switch off$/ })).toBeNull();
});

// The bug this covers: with no proxy binary, Enable can never succeed, and
// without the opt-out the wallet could not send at all.
test.each(["unattached", "died"] as const)("a stranded session can consent to clearnet (%s)", (mode) => {
  show(mode);

  const escape = screen.getByRole("button", { name: /^Switch off$/ });
  fireEvent.click(escape);

  return waitFor(() => expect(stopMixnet).toHaveBeenCalledTimes(1));
});

test("a stranded session still offers to retry the transport", () => {
  show("died");

  fireEvent.click(screen.getByRole("button", { name: /^Enable$/ }));

  return waitFor(() => expect(startMixnet).toHaveBeenCalledTimes(1));
});

// Already off: sends work over clearnet, so there is nothing to consent to.
test("an already-off transport only offers to enable it", () => {
  show("switched_off");

  expect(screen.getByRole("button", { name: /^Enable$/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Switch off$/ })).toBeNull();
});

test("bootstrapping is not stranded — it may still come up", () => {
  show("bootstrapping");

  expect(screen.queryByRole("button", { name: /^Switch off$/ })).toBeNull();
});
