import React from "react";
import Modal from "react-modal";

import styles from "../history/History.module.css";
import cstyles from "../common/Common.module.css";
import { SwapDirectionEnum, describeCostVsMarket, formatAmountForDisplay, providerShortLabel } from "../../swap";
import type { RouteOptionType, UnavailableProviderType } from "../../swap";

type QuotesPickerProps = {
  routes: RouteOptionType[];
  /** Supported providers that returned no route, and what they said about why. */
  unavailable: UnavailableProviderType[];
  selectedRouteId: string;
  receiveSymbol: string;
  sellSymbol: string;
  /** What these routes were quoted for, already formatted with its symbol.
   *  Carried on every row: the reader compares rows, and each one has to say
   *  what it is answering. */
  quotedSell?: string;
  /** The symbol the routes are denominated in, from the same quote as
   *  `quotedSell`. Falls back to `receiveSymbol`, which is the form's answer
   *  and can disagree with the quote while a new one is in flight. */
  quotedReceiveSymbol?: string;
  direction: SwapDirectionEnum;
  modalIsOpen: boolean;
  closeModal: () => void;
  onSelect: (routeId: string) => void;
};

/**
 * The routes a quote returned, side by side.
 *
 * Providers differ on more than the headline figure: what arrives, what is
 * guaranteed to arrive, how long it takes, and what it costs. The list shows
 * all four so the largest number is not mistaken for the best route.
 *
 * The fee is read in the asset the user is parting with for an outbound swap
 * and in the one arriving for an inbound one, which is the side they are
 * actually counting in each case.
 *
 * The providers that returned nothing are listed too, greyed and inert. A
 * quote that offers one route looks the same whether the other providers do
 * not trade the pair or merely want a larger amount, and only one of those is
 * something the user can do anything about.
 */
const QuotesPicker: React.FC<QuotesPickerProps> = ({
  routes,
  unavailable,
  selectedRouteId,
  receiveSymbol,
  sellSymbol,
  quotedSell,
  quotedReceiveSymbol,
  direction,
  modalIsOpen,
  closeModal,
  onSelect,
}) => {
  const isOutbound = direction === SwapDirectionEnum.Outbound;

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={styles.txmodal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={cstyles.verticalflex} style={{ height: "100%" }}>
        <div className={`${cstyles.center} ${cstyles.xlarge} ${cstyles.padtopsmall}`}>Quotes returned</div>

        <div style={{ overflowY: "auto", overflowX: "hidden", flexGrow: 1, marginTop: 12 }}>
          {routes.map((route) => {
            const selected = route.routeId === selectedRouteId;
            const recommended = route.tags?.includes("RECOMMENDED");
            const fee = isOutbound ? route.totalFeesInSellAsset : route.totalFeesInReceiveAsset;
            const feeSymbol = isOutbound ? sellSymbol : receiveSymbol;
            const costVsMarket = describeCostVsMarket(route.costVsMarketBps);

            return (
              <button
                key={route.routeId}
                type="button"
                onClick={() => {
                  onSelect(route.routeId);
                  closeModal();
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  marginBottom: 8,
                  padding: 10,
                  borderRadius: 4,
                  color: "inherit",
                  cursor: "pointer",
                  background: selected ? "var(--color-background-dark)" : "none",
                  border: `1px solid ${selected ? "var(--color-primary)" : "var(--color-background-dark)"}`,
                }}
              >
                <div
                  className={cstyles.horizontalflex}
                  style={{ justifyContent: "space-between", alignItems: "baseline" }}
                >
                  <div>
                    {providerShortLabel(route.provider)}
                    {recommended && (
                      <span className={cstyles.small} style={{ marginLeft: 8, color: "var(--color-primary)" }}>
                        Optimal
                      </span>
                    )}
                  </div>
                  <div className={cstyles.large}>
                    {/* On every row rather than once above them. Repeating it
                        is the point: a row read on its own has to carry what
                        it answers, and a heading over a list is not read with
                        the line the eye is on. */}
                    {!!quotedSell && <span className={cstyles.sublight}>{quotedSell} → </span>}
                    {formatAmountForDisplay(route.expectedReceiveAmount)} {quotedReceiveSymbol || receiveSymbol}
                  </div>
                </div>

                <div className={`${cstyles.sublight} ${cstyles.small} ${cstyles.padtopsmall}`}>
                  At least {formatAmountForDisplay(route.minReceiveAmount)} {quotedReceiveSymbol || receiveSymbol}
                  {route.estimatedTimeText ? ` — ${route.estimatedTimeText}` : ""}
                  {fee ? ` — fee ${formatAmountForDisplay(fee)} ${feeSymbol}` : ""}
                </div>

                {/* The one figure that compares routes on price, fees and
                    spread together. A line of its own rather than one more
                    item after the fee, which it already contains. */}
                {!!costVsMarket && <div className={`${cstyles.sublight} ${cstyles.small}`}>{costVsMarket}</div>}

                {/* The provider's own warning, which is usually about volatile
                    conditions on the route. Shown rather than summarised: it
                    is the provider's statement about its own risk. */}
                {!!route.warningsText && (
                  <div className={cstyles.small} style={{ color: "var(--color-warning)" }}>
                    {route.warningsText}
                  </div>
                )}
              </button>
            );
          })}

          {unavailable.length > 0 && (
            <>
              {/* Below the routes, and after a rule, because these are not
                  choices. Mixed in among the selectable ones they would read
                  as options that happen to be dimmed. */}
              <hr style={{ width: "100%" }} />
              {unavailable.map((entry) => (
                <div
                  key={entry.provider}
                  className={cstyles.sublight}
                  style={{ marginBottom: 8, padding: 10, borderRadius: 4, border: "1px solid transparent" }}
                >
                  <div className={cstyles.horizontalflex} style={{ justifyContent: "space-between" }}>
                    <div>{providerShortLabel(entry.provider)}</div>
                    <div className={cstyles.small}>Unavailable</div>
                  </div>
                  <div className={`${cstyles.small} ${cstyles.padtopsmall}`}>{entry.reason}</div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>
          <button type="button" className={cstyles.primarybutton} onClick={closeModal}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default QuotesPicker;
