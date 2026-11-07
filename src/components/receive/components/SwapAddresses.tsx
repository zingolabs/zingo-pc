import React, { useState } from "react";
import {
  Accordion,
  AccordionItem,
  AccordionItemHeading,
  AccordionItemButton,
  AccordionItemPanel,
} from "react-accessible-accordion";
import styles from "../Receive.module.css";
import cstyles from "../../common/Common.module.css";
import { CopyField, Field, FieldRow } from "../../common/DetailField";
import { providerShortLabel, swapRowLabel, SwapStatusEnum, SwapStore } from "../../../swap";
import type { SwapRecordType } from "../../../swap";
import SwapDetailModal from "../../swap/SwapDetailModal";

type SwapAddressesProps = {
  /** The wallet's addresses a swap made, each with its swap, newest first. */
  entries: { address: string; record: SwapRecordType }[];
  /** The address book's name for an address, when it has one. */
  labelOf: (address: string) => string | undefined;
};

const pairOf = (record: SwapRecordType) =>
  `${record.sellAsset.ticker ?? record.sellAsset.symbol} → ${record.receiveAsset.ticker ?? record.receiveAsset.symbol}`;

const whenOf = (record: SwapRecordType) =>
  new Date(record.createdAtMs).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * Receive's tab of the addresses a swap made, one per swap. A row shows the
 * pair, the swap's state and when; opened, the rest, and the swap itself once
 * it is done.
 */
const SwapAddresses: React.FC<SwapAddressesProps> = ({ entries, labelOf }) => {
  const [shown, setShown] = useState<SwapRecordType | null>(null);

  return (
    <>
      <div className={`${cstyles.sublight} ${cstyles.small} ${cstyles.padtopsmall}`}>
        One per swap, so swaps can&rsquo;t be linked.
      </div>
      <Accordion allowZeroExpanded>
        {entries.map(({ address, record }) => (
          <AccordionItem key={address} className={styles.receiveblock} uuid={address}>
            <AccordionItemHeading>
              <AccordionItemButton className={`${cstyles.accordionHeader} ${cstyles.marginleft}`}>
                <div className={cstyles.verticalflex}>
                  <div>{pairOf(record)}</div>
                  <div className={`${cstyles.sublight} ${cstyles.small}`}>
                    {swapRowLabel(record.status)} · {whenOf(record)}
                  </div>
                </div>
              </AccordionItemButton>
            </AccordionItemHeading>
            <AccordionItemPanel className={styles.receiveDetail}>
              <div className={`${cstyles.verticalflex} ${cstyles.marginleft}`}>
                <FieldRow>
                  <Field label="Tag" value={labelOf(address) ?? `${pairOf(record)} · ${whenOf(record)}`} />
                  <Field label="Provider" value={providerShortLabel(record.provider)} />
                </FieldRow>
                <FieldRow>
                  {!!record.swapKitInternalId && <CopyField label="Swap ID" value={record.swapKitInternalId} />}
                  <Field label="Status" value={swapRowLabel(record.status)} />
                </FieldRow>
                <FieldRow>
                  <Field label="Type" value="Orchard (Ironwood) + Sapling" />
                </FieldRow>
                <CopyField label="Address" value={address} />
                {record.status === SwapStatusEnum.Completed && (
                  <div className={cstyles.padtopsmall}>
                    <button type="button" className={cstyles.primarybutton} onClick={() => setShown(record)}>
                      View swap
                    </button>
                  </div>
                )}
              </div>
            </AccordionItemPanel>
          </AccordionItem>
        ))}
      </Accordion>
      {!!shown && (
        <SwapDetailModal
          record={shown}
          index={0}
          length={1}
          moveDetail={() => {}}
          modalIsOpen
          closeModal={() => setShown(null)}
          onRemove={(r) => {
            setShown(null);
            SwapStore.deleteByRecordId(r.recordId).catch((e) =>
              console.error(`SwapAddresses: removing the swap record failed ${e}`),
            );
          }}
        />
      )}
    </>
  );
};

export default SwapAddresses;
