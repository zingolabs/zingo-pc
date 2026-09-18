import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Typing a ZEC amount in dollars, in the same field.
 *
 * Every field that asks for ZEC can switch to USD: the user types dollars, the
 * ZEC they come to is what the field hands on, and the line that showed the
 * dollar value shows that ZEC instead. ZEC stays the one amount anything is
 * sent or requested in; USD is only a way of arriving at it.
 *
 * While the screen is being edited, the ZEC follows the price: the user asked
 * for a dollar amount, and the price moves every few seconds. Once the amount
 * is being reviewed (`frozen`: the confirm screen is open, the request has been
 * generated) it stops, so what the user checks is what goes out.
 *
 * Without a price there is no switching, and a field in USD falls back to ZEC
 * rather than converting with a figure that is gone.
 */

/** Dollars as ZEC, to the zatoshi, without trailing zeros; "" when it does not read as an amount. */
export function usdToZec(usdText: string, zecPrice: number): string {
  const usd = parseFloat(usdText.replace(",", "."));
  if (!Number.isFinite(usd) || usd < 0 || !(zecPrice > 0)) return "";
  return (usd / zecPrice).toFixed(8).replace(/\.?0+$/, "");
}

/** ZEC as dollars, to the cent; "" when it does not read as an amount. */
export function zecToUsd(zecText: string, zecPrice: number): string {
  const zec = parseFloat(zecText.replace(",", "."));
  if (!Number.isFinite(zec) || zec < 0 || !(zecPrice > 0)) return "";
  return (zec * zecPrice).toFixed(2);
}

export type UsdAmount = {
  /** Whether the field is taking dollars. */
  usdMode: boolean;
  /** Whether switching is possible: a price, and a field that is in ZEC. */
  canUseUsd: boolean;
  toggle: () => void;
  /** What the input shows: the dollars typed, or the ZEC. */
  inputValue: string;
  /** For the input's onChange: dollars in USD mode, ZEC otherwise. */
  onInputChange: (text: string) => void;
};

export function useUsdAmount(args: {
  /** The field's ZEC amount, as text. */
  zecText: string;
  /** Hands a new ZEC amount to the field. */
  setZecText: (zecText: string) => void;
  zecPrice: number;
  /** False where dollars make no sense: another asset, or a test network. */
  available: boolean;
  /** True while the amount is being reviewed: the price no longer moves it. */
  frozen: boolean;
}): UsdAmount {
  const { zecText, setZecText, zecPrice, available, frozen } = args;
  const canUseUsd = available && zecPrice > 0;
  const [usdMode, setUsdMode] = useState<boolean>(false);
  const [usdText, setUsdText] = useState<string>("");
  // The ZEC this hook last wrote, to tell its own writes from the field's (a
  // Max button, a payment request filling the form).
  const lastWritten = useRef<string | null>(null);
  const setZecTextRef = useRef(setZecText);
  setZecTextRef.current = setZecText;

  const write = useCallback((zec: string) => {
    lastWritten.current = zec;
    setZecTextRef.current(zec);
  }, []);

  // No price, or no longer a ZEC field: back to ZEC, keeping the amount.
  useEffect(() => {
    if (usdMode && !canUseUsd) setUsdMode(false);
  }, [usdMode, canUseUsd]);

  // The dollars asked for, at the new price, while the amount is still being
  // edited.
  useEffect(() => {
    if (!usdMode || frozen || !canUseUsd || usdText === "") return;
    const zec = usdToZec(usdText, zecPrice);
    if (zec !== zecText) write(zec);
    // Only a new price moves it; the other inputs are read as they are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zecPrice]);

  // A ZEC amount set from outside while in USD mode shows in dollars.
  useEffect(() => {
    // Compared as numbers: a field that keeps a number writes 1e-7 back for
    // the 0.0000001 it was given, and that is not the user changing it.
    if (!usdMode || zecText === lastWritten.current) return;
    if (lastWritten.current !== null && parseFloat(zecText) === parseFloat(lastWritten.current)) return;
    lastWritten.current = zecText;
    setUsdText(zecToUsd(zecText, zecPrice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zecText]);

  const onInputChange = useCallback(
    (text: string) => {
      if (!usdMode) {
        setZecTextRef.current(text);
        return;
      }
      setUsdText(text);
      write(usdToZec(text, zecPrice));
    },
    [usdMode, zecPrice, write],
  );

  const toggle = useCallback(() => {
    if (usdMode) {
      setUsdMode(false);
      return;
    }
    if (!canUseUsd) return;
    lastWritten.current = zecText;
    setUsdText(zecToUsd(zecText, zecPrice));
    setUsdMode(true);
  }, [usdMode, canUseUsd, zecText, zecPrice]);

  return { usdMode, canUseUsd, toggle, inputValue: usdMode ? usdText : zecText, onInputChange };
}
