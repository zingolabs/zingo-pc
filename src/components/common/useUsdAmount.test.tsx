import { act, renderHook } from "@testing-library/react";
import { usdToZec, useUsdAmount, zecToUsd } from "./useUsdAmount";

describe("usdToZec / zecToUsd", () => {
  it("converts to the zatoshi and to the cent, without trailing zeros in ZEC", () => {
    expect(usdToZec("100", 40)).toBe("2.5");
    expect(usdToZec("1", 3)).toBe("0.33333333");
    expect(usdToZec("12,5", 50)).toBe("0.25");
    expect(zecToUsd("0.25", 1441.2)).toBe("360.30");
  });

  it("gives nothing for what is not an amount, or without a price", () => {
    expect(usdToZec("", 40)).toBe("");
    expect(usdToZec("abc", 40)).toBe("");
    expect(usdToZec("-1", 40)).toBe("");
    expect(usdToZec("10", 0)).toBe("");
    expect(zecToUsd("1", 0)).toBe("");
  });
});

// A field that keeps its ZEC as text, the way the Swap screen does.
const setup = (initial: { price?: number; available?: boolean; frozen?: boolean; zec?: string } = {}) => {
  let zec = initial.zec ?? "";
  const setZecText = jest.fn((next: string) => {
    zec = next;
  });
  const view = renderHook(
    ({ price, frozen, zecText }: { price: number; frozen: boolean; zecText: string }) =>
      useUsdAmount({ zecText, setZecText, zecPrice: price, available: initial.available ?? true, frozen }),
    { initialProps: { price: initial.price ?? 40, frozen: initial.frozen ?? false, zecText: zec } },
  );
  const rerender = (props: { price?: number; frozen?: boolean } = {}) =>
    view.rerender({ price: props.price ?? 40, frozen: props.frozen ?? false, zecText: zec });
  return { view, setZecText, rerender, zec: () => zec };
};

describe("useUsdAmount", () => {
  it("types ZEC by default and hands it on as typed", () => {
    const { view, setZecText } = setup();
    expect(view.result.current.usdMode).toBe(false);
    act(() => view.result.current.onInputChange("0.5"));
    expect(setZecText).toHaveBeenLastCalledWith("0.5");
  });

  // What the field sends is always ZEC: dollars are converted as they are typed.
  it("takes dollars once switched, and hands on the ZEC they come to", () => {
    const { view, rerender, zec } = setup({ zec: "1" });
    act(() => view.result.current.toggle());
    rerender();
    expect(view.result.current.usdMode).toBe(true);
    expect(view.result.current.inputValue).toBe("40.00");

    act(() => view.result.current.onInputChange("100"));
    rerender();
    expect(zec()).toBe("2.5");
    expect(view.result.current.inputValue).toBe("100");
  });

  // While the screen is edited the ZEC follows the price the user asked for.
  it("follows the price while editing", () => {
    const { view, rerender, zec } = setup();
    act(() => view.result.current.toggle());
    act(() => view.result.current.onInputChange("100"));
    rerender();
    rerender({ price: 50 });
    expect(zec()).toBe("2");
  });

  // Once the amount is being reviewed, what the user checks is what goes out.
  it("stops following the price while frozen", () => {
    const { view, rerender, zec } = setup();
    act(() => view.result.current.toggle());
    act(() => view.result.current.onInputChange("100"));
    rerender({ frozen: true });
    rerender({ price: 50, frozen: true });
    expect(zec()).toBe("2.5");
  });

  it("cannot switch without a price, and falls back to ZEC when the price goes", () => {
    const noPrice = setup({ price: 0 });
    expect(noPrice.view.result.current.canUseUsd).toBe(false);
    act(() => noPrice.view.result.current.toggle());
    expect(noPrice.view.result.current.usdMode).toBe(false);

    const { view, rerender } = setup({ zec: "1" });
    act(() => view.result.current.toggle());
    rerender({ price: 0 });
    expect(view.result.current.usdMode).toBe(false);
    expect(view.result.current.inputValue).toBe("1");
  });

  // A Max button or a payment request sets the ZEC from outside.
  it("shows a ZEC amount set from outside in dollars", () => {
    const { view } = setup();
    act(() => view.result.current.toggle());
    view.rerender({ price: 40, frozen: false, zecText: "3" });
    expect(view.result.current.inputValue).toBe("120.00");
  });

  it("offers nothing where dollars make no sense", () => {
    const { view } = setup({ available: false });
    expect(view.result.current.canUseUsd).toBe(false);
  });
});
