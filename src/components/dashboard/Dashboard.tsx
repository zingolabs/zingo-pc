import React, { useContext, useEffect, useState } from "react";
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

type DashboardProps = {
  shieldTransparentBalanceToOrchard: () => Promise<string>;
  openErrorModal: (title: string, body: string) => void;
  calculateShieldFee: () => Promise<number>;
};

const Dashboard: React.FC<DashboardProps> = ({shieldTransparentBalanceToOrchard, openErrorModal, calculateShieldFee}) => {
  const context = useContext(ContextApp);
  const { totalBalance, info, addresses, readOnly, fetchError } = context;

  const [anyPending, setAnyPending] = useState<boolean>(false);
  const [shieldFee, setShieldFee] = useState<number>(0);

  useEffect(() => {
    const _anyPending: Address | undefined = !!addresses && addresses.find((i: Address) => i.containsPending === true);
    setAnyPending(!!_anyPending);
  }, [addresses]);
    
  useEffect(() => {
    if (totalBalance.transparent > 0) {
      (async () => {
        setShieldFee(await calculateShieldFee());
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalBalance.transparent]); 

  const shieldButton = () => {
    openErrorModal("Computing Transaction", "Please wait...This could take a while");

    setTimeout(() => {
      (async () => {
        try {
          const result: string = await shieldTransparentBalanceToOrchard();
          console.log('shielding balance', result);

          if (result.toLocaleLowerCase().startsWith('error')) {
            openErrorModal("Error Shielding Transaction", `${result}`);
            return;  
          }
          const resultJSON = JSON.parse(result);
          if (resultJSON.txids) {
            openErrorModal(
              "Successfully Broadcast Transaction",
              `Transaction was successfully broadcast.\n${resultJSON.txids.length === 1 ? 'TXID' : "TXID's"}: ${resultJSON.txids.join(' ')}`
            );
          }
          if (resultJSON.error) {
            openErrorModal("Error Shielding Transaction", `${resultJSON.error}`);
          }
        } catch (err) {
          // If there was an error, show the error modal
          openErrorModal("Error Shielding Transaction", `${err}`);
        }
      })();
    }, 10);
  };

  console.log('shield fee', shieldFee);

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
            zecValue={totalBalance.obalance}
            usdValue={Utils.getZecToUsdString(info.zecPrice, totalBalance.obalance)}
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
        <div className={cstyles.balancebox}>
          {totalBalance.transparent >= shieldFee && shieldFee > 0 && !readOnly && !anyPending &&  (
            <button className={[cstyles.primarybutton].join(" ")} type="button" onClick={shieldButton}>
              Shield Transparent Balance To Orchard
            </button>
          )}
          {!!anyPending && (
            <div className={[cstyles.red, cstyles.small, cstyles.padtopsmall].join(" ")}>
              Some transactions are pending. Balances may change.
            </div>
          )}
        </div>
        {!!fetchError && !!fetchError.error && (
          <>
            <hr />
            <div className={cstyles.balancebox} style={{ color: 'red' }}>
              {fetchError.command + ': ' + fetchError.error}
            </div>
          </>
        )}
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
};

export default Dashboard;