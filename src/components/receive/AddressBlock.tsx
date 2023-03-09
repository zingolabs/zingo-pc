/* eslint-disable react/prop-types */
import React, { useState, useEffect } from "react";
import {
  AccordionItem,
  AccordionItemHeading,
  AccordionItemButton,
  AccordionItemPanel,
} from "react-accessible-accordion";
import QRCode from "qrcode.react";
import styles from "./Receive.module.css";
import cstyles from "./Common.module.css";
import Utils from "../../utils/utils";
import { AddressBalance } from "../appstate";

const { shell, clipboard } = window.require("electron");

type AddressBlockProps = {
  addressBalance: AddressBalance;
  currencyName: string;
  zecPrice: number;
  privateKey?: string;
  viewKey?: string;
  label?: string;
  receivers?: string;
  fetchAndSetSinglePrivKey: (k: string) => void;
  fetchAndSetSingleViewKey: (k: string) => void;
};

const AddressBlock = ({
  addressBalance,
  label,
  receivers,
  currencyName,
  zecPrice,
  privateKey,
  fetchAndSetSinglePrivKey,
  viewKey,
  fetchAndSetSingleViewKey,
}: AddressBlockProps) => {
  const { address } = addressBalance;

  const [copied, setCopied] = useState(false);
  const [timerID, setTimerID] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerID) {
        clearTimeout(timerID);
      }
    };
  });

  const balance = addressBalance.balance || 0;

  const openAddress = () => {
    if (currencyName === "TAZ") {
      shell.openExternal(`https://chain.so/address/ZECTEST/${address}`);
    } else {
      //shell.openExternal(`https://zcha.in/accounts/${address}`);
      shell.openExternal(`https://zecblockexplorer.com/address/${address}`);
    }
  };

  return (
    <AccordionItem key={copied ? 1 : 0} className={[cstyles.well, styles.receiveblock].join(" ")} uuid={address}>
      <AccordionItemHeading>
        <AccordionItemButton className={cstyles.accordionHeader}>{address}</AccordionItemButton>
      </AccordionItemHeading>
      <AccordionItemPanel className={[styles.receiveDetail].join(" ")}>
        <div className={[cstyles.flexspacebetween].join(" ")}>
          <div className={[cstyles.verticalflex, cstyles.marginleft].join(" ")}>
            {label && (
              <div className={cstyles.margintoplarge}>
                <div className={[cstyles.sublight].join(" ")}>Label</div>
                <div className={[cstyles.padtopsmall, cstyles.fixedfont].join(" ")}>{label}</div>
              </div>
            )}

            {receivers && (
              <div className={cstyles.margintopsmall}>
                <div className={[cstyles.sublight].join(" ")}>Address type: {Utils.getReeivers(receivers).join(" + ")}</div>
              </div>
            )}

            <div className={[cstyles.sublight, cstyles.margintoplarge].join(" ")}>Funds</div>
            <div className={[cstyles.padtopsmall].join(" ")}>
              {currencyName} {balance}
            </div>
            <div className={[cstyles.padtopsmall].join(" ")}>{Utils.getZecToUsdString(zecPrice, balance)}</div>

            <div className={[cstyles.margintoplarge, cstyles.breakword].join(" ")}>
              {privateKey && (
                <div>
                  <div className={[cstyles.sublight].join(" ")}>Private Key</div>
                  <div
                    className={[cstyles.breakword, cstyles.padtopsmall, cstyles.fixedfont, cstyles.flex].join(" ")}
                    style={{ maxWidth: "600px" }}
                  >
                    {/*
                    // @ts-ignore */}
                    <QRCode value={privateKey} className={[styles.receiveQrcode].join(" ")} />
                    <div>{privateKey}</div>
                  </div>
                </div>
              )}
            </div>

            <div className={[cstyles.margintoplarge, cstyles.breakword].join(" ")}>
              {viewKey && (
                <div>
                  <div className={[cstyles.sublight].join(" ")}>Viewing Key</div>
                  <div
                    className={[cstyles.breakword, cstyles.padtopsmall, cstyles.fixedfont, cstyles.flex].join(" ")}
                    style={{ maxWidth: "600px" }}
                  >
                    {/*
                    // @ts-ignore */}
                    <QRCode value={viewKey} className={[styles.receiveQrcode].join(" ")} />
                    <div>{viewKey}</div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <button
                className={[cstyles.primarybutton, cstyles.margintoplarge].join(" ")}
                type="button"
                onClick={() => {
                  clipboard.writeText(address);
                  setCopied(true);
                  setTimerID(setTimeout(() => setCopied(false), 5000));
                }}
              >
                {copied ? <span>Copied!</span> : <span>Copy Address</span>}
              </button>
              {/* {Utils.isZaddr(address) && !privateKey && (
                <button
                  className={[cstyles.primarybutton].join(" ")}
                  type="button"
                  onClick={() => fetchAndSetSinglePrivKey(address)}
                >
                  Export Private Key
                </button>
              )}

              {Utils.isZaddr(address) && !viewKey && (
                <button
                  className={[cstyles.primarybutton].join(" ")}
                  type="button"
                  onClick={() => fetchAndSetSingleViewKey(address)}
                >
                  Export Viewing Key
                </button>
              )} */}

              {Utils.isTransparent(address) && (
                <button className={[cstyles.primarybutton].join(" ")} type="button" onClick={() => openAddress()}>
                  View on explorer <i className={["fas", "fa-external-link-square-alt"].join(" ")} />
                </button>
              )}
            </div>
          </div>
          <div>
            {/*
                    // @ts-ignore */}
            <QRCode value={address} className={[styles.receiveQrcode].join(" ")} />
          </div>
        </div>
      </AccordionItemPanel>
    </AccordionItem>
  );
};

export default AddressBlock;
