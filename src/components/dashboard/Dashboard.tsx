import React, { Component } from "react";
import {
  Accordion,
} from "react-accessible-accordion";
import styles from "./Dashboard.module.css";
import cstyles from "../common/Common.module.css";
import Utils from "../../utils/utils";
import ScrollPane from "../scrollPane/ScrollPane";
import { BalanceBlockHighlight, BalanceBlock } from "../balanceblock";
import AddressBalanceItem from "./components/AddressBalanceItem"; 
import { ContextApp } from "../../context/ContextAppState";
import { Address } from "../appstate";

type DashboardProps = {};

export default class Dashboard extends Component<DashboardProps> {
  static contextType = ContextApp;
  render() {
    const { totalBalance, info, addresses } = this.context;

    const anyPending = addresses && addresses.find((i: Address) => i.containsPending);

    return (
      <div>
        <div className={[cstyles.well, styles.containermargin].join(" ")}>
          <div className={cstyles.balancebox}>
            <BalanceBlockHighlight
              topLabel="All Funds"
              zecValue={totalBalance.total}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.total)}
              currencyName={info.currencyName}
            />
            <BalanceBlock
              topLabel="Orchard"
              zecValue={totalBalance.uabalance}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.uabalance)}
              currencyName={info.currencyName}
            />
            <BalanceBlock
              topLabel="Sapling"
              zecValue={totalBalance.zbalance}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.zbalance)}
              currencyName={info.currencyName}
            />
            <BalanceBlock
              topLabel="Transparent"
              zecValue={totalBalance.transparent}
              usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.transparent)}
              currencyName={info.currencyName}
            />
          </div>
          <div>
            {anyPending && (
              <div className={[cstyles.red, cstyles.small, cstyles.padtopsmall].join(" ")}>
                Some transactions are pending. Balances may change.
              </div>
            )}
          </div>
        </div>

        <div className={[cstyles.flexspacebetween, cstyles.xlarge, cstyles.marginnegativetitle].join(" ")}>
          <div style={{ marginLeft: 100 }}>Address</div>
          <div style={{ marginRight: 40 }}>Balance</div>
        </div>

        <div className={styles.addressbalancecontainer}>
          <ScrollPane offsetHeight={190}>
            <div className={styles.addressbooklist}>
              {addresses &&
                (addresses.length === 0 ? (
                  <div className={[cstyles.center, cstyles.sublight, cstyles.margintoplarge].join(" ")}>No Addresses with a balance</div>
                ) : (
                  <Accordion>
                    {addresses
                      .filter((ab: Address) => ab.balance > 0)
                      .map((ab: Address) => (
                        <AddressBalanceItem
                          key={ab.address}
                          item={ab}
                          currencyName={info.currencyName}
                          zecPrice={info.zecPrice}
                        />
                      ))}
                  </Accordion>
                ))}
            </div>
          </ScrollPane>
        </div>
      </div>
    );
  }
}
