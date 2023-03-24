import React, { Component } from "react";
import {
  Accordion,
} from "react-accessible-accordion";
import styles from "./Dashboard.module.css";
import cstyles from "../common/Common.module.css";
import { TotalBalance, Info, AddressBalance } from "../appstate";
import Utils from "../../utils/utils";
import ScrollPane from "../scrollPane/ScrollPane";
import { BalanceBlockHighlight, BalanceBlock } from "../balanceblock";
import AddressBalanceItem from "./components/AddressBalanceItem";

type DashboardProps = {
  totalBalance: TotalBalance;
  info: Info;
  addressesWithBalance: AddressBalance[];
};

export default class Dashboard extends Component<DashboardProps> {
  render() {
    const { totalBalance, info, addressesWithBalance } = this.props;

    const anyPending = addressesWithBalance && addressesWithBalance.find((i) => i.containsPending);

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
          <div style={{ marginRight: 30 }}>Balance</div>
        </div>

        <div className={styles.addressbalancecontainer}>
          <ScrollPane offsetHeight={190}>
            <div className={styles.addressbooklist}>
              {addressesWithBalance &&
                (addressesWithBalance.length === 0 ? (
                  <div className={[cstyles.center, cstyles.sublight, cstyles.margintoplarge].join(" ")}>No Addresses with a balance</div>
                ) : (
                  <Accordion>
                    {addressesWithBalance
                      .filter((ab) => ab.balance > 0)
                      .map((ab) => (
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
