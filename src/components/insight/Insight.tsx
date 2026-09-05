import React, { useContext, useEffect, useState } from "react";
import styles from "./Insight.module.css";
import cstyles from "../common/Common.module.css";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import { usePaneOffset } from "../scrollPane/usePaneOffset";
import Utils from "../../utils/utils";
import { ContextApp } from "../../context/ContextAppState";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faQrcode } from "@fortawesome/free-solid-svg-icons";
import "chart.js/auto";
import { Chart } from "react-chartjs-2";
import { native } from "../../electronBridge";

type InsightProps = {};

type Data = {
  labels: string[];
  datasets: Dataset[];
};

type Dataset = {
  data: number[];
  backgroundColor: string[];
  hoverBackgroundColor: string[];
};

const Insight: React.FC<InsightProps> = () => {
  const context = useContext(ContextApp);
  const { addressBook } = context;

  const { paneRef, paneOffset } = usePaneOffset(162);

  const [dataSent, setDataSent] = useState<Data>({} as Data);
  const [dataSends, setDataSends] = useState<Data>({} as Data);
  const [dataMemobytes, setDataMemobytes] = useState<Data>({} as Data);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchDataSent();
    fetchDataSends();
    fetchDataMemobytes();
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDataSent: () => void = async () => {
    try {
      const resultStr: string = await native.get_total_value_to_address();

      const resultJSON = JSON.parse(resultStr);
      let amounts: { data: number; address: string; tag: string }[] = [];
      const resultJSONEntries: [string, number][] = Object.entries(resultJSON) as [string, number][];
      resultJSONEntries.forEach(([key, value]) => {
        if (value > 0) {
          const tag = addressBook.filter((a: any) => a.address === key);
          amounts.push({ data: value / 10 ** 8, address: key, tag: !!tag && tag.length > 0 ? tag[0].label : "" });
        }
      });
      const randomColors = Utils.generateColorList(amounts.length);
      const newLabels: string[] = [];
      const newBackgroundColor: string[] = [];
      const newHoverBackgroundColor: string[] = [];
      const newData: number[] = amounts
        .sort((a, b) => b.data - a.data)
        .map((item, index) => {
          newLabels.push(
            !!item.tag ? item.tag : item.address === "fee" ? item.address : Utils.trimToSmall(item.address, 10),
          );
          newBackgroundColor.push(item.address === "fee" ? Utils.getCssVariable("--color-zingo") : randomColors[index]);
          newHoverBackgroundColor.push(
            item.address === "fee" ? Utils.getCssVariable("--color-zingo") : randomColors[index],
          );
          return item.data;
        });
      setDataSent({
        labels: newLabels,
        datasets: [
          {
            data: newData,
            backgroundColor: newBackgroundColor,
            hoverBackgroundColor: newHoverBackgroundColor,
          } as Dataset,
        ],
      } as Data);
    } catch (error) {
      console.error(`Critical Error insight sent ${error}`);
    }
  };

  const fetchDataSends: () => void = async () => {
    try {
      const resultStr = await native.get_total_spends_to_address();

      const resultJSON = JSON.parse(resultStr);
      let amounts: { data: number; address: string; tag: string }[] = [];
      const resultJSONEntries: [string, number][] = Object.entries(resultJSON) as [string, number][];
      resultJSONEntries.forEach(([key, value]) => {
        if (key !== "fee" && value > 0) {
          const tag = addressBook.filter((a: any) => a.address === key);
          amounts.push({
            data: value,
            address: key,
            tag: !!tag && tag.length > 0 ? tag[0].label : "",
          });
        }
      });
      const randomColors = Utils.generateColorList(amounts.length);
      const newLabels: string[] = [];
      const newBackgroundColor: string[] = [];
      const newHoverBackgroundColor: string[] = [];
      const newData: number[] = amounts
        .sort((a, b) => b.data - a.data)
        .map((item, index) => {
          newLabels.push(
            !!item.tag ? item.tag : item.address === "fee" ? item.address : Utils.trimToSmall(item.address, 10),
          );
          newBackgroundColor.push(item.address === "fee" ? "gray" : randomColors[index]);
          newHoverBackgroundColor.push(item.address === "fee" ? "gray" : randomColors[index]);
          return item.data;
        });
      setDataSends({
        labels: newLabels,
        datasets: [
          {
            data: newData,
            backgroundColor: newBackgroundColor,
            hoverBackgroundColor: newHoverBackgroundColor,
          } as Dataset,
        ],
      } as Data);
    } catch (error) {
      console.error(`Critical Error insight sends ${error}`);
    }
  };

  const fetchDataMemobytes: () => void = async () => {
    try {
      const resultStr = await native.get_total_memobytes_to_address();

      const resultJSON = JSON.parse(resultStr);
      let amounts: { data: number; address: string; tag: string }[] = [];
      const resultJSONEntries: [string, number][] = Object.entries(resultJSON) as [string, number][];
      resultJSONEntries.forEach(([key, value]) => {
        if (key !== "fee" && value > 0) {
          const tag = addressBook.filter((a: any) => a.address === key);
          amounts.push({
            data: value,
            address: key,
            tag: !!tag && tag.length > 0 ? tag[0].label : "",
          });
        }
      });
      const randomColors = Utils.generateColorList(amounts.length);
      const newLabels: string[] = [];
      const newBackgroundColor: string[] = [];
      const newHoverBackgroundColor: string[] = [];
      const newData: number[] = amounts
        .sort((a, b) => b.data - a.data)
        .map((item, index) => {
          newLabels.push(
            !!item.tag ? item.tag : item.address === "fee" ? item.address : Utils.trimToSmall(item.address, 10),
          );
          newBackgroundColor.push(item.address === "fee" ? "gray" : randomColors[index]);
          newHoverBackgroundColor.push(item.address === "fee" ? "gray" : randomColors[index]);
          return item.data;
        });
      setDataMemobytes({
        labels: newLabels,
        datasets: [
          {
            data: newData,
            backgroundColor: newBackgroundColor,
            hoverBackgroundColor: newHoverBackgroundColor,
          } as Dataset,
        ],
      } as Data);
    } catch (error) {
      console.error(`Critical Error insight memo bytes ${error}`);
    }
  };

  const getPercent = (percent: number) => {
    return (percent < 1 ? "<1" : percent < 100 && percent >= 99 ? "99" : percent.toFixed(0)) + "%";
  };

  const line = (
    value: number,
    address: string,
    index: number,
    amounts: number[],
    color: string,
    type: "sent" | "sends" | "memobytes",
  ) => {
    const totalValue = amounts ? amounts.reduce((acc, curr) => acc + curr, 0) : 0;
    const percent = (100 * value) / totalValue;
    return (
      <div style={{ width: "100%" }} key={`tag-${index}`}>
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 5,
            marginBottom: 5,
            borderBottomColor: "var(--color-zingo)",
            borderBottomWidth: address !== "fee" ? 1 : 0,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 10,
            }}
          >
            <FontAwesomeIcon icon={faQrcode} color={color} style={{ height: 20, marginRight: 10 }} />
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
              }}
            >
              <div>{Utils.trimToSmall(address, 6)}</div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div className={`${cstyles.sublight} ${cstyles.small} ${cstyles.padtopsmall}`} style={{ marginRight: 10 }}>
              {getPercent(percent)}
            </div>
            {type === "sent" ? (
              <div className={`${cstyles.sublight} ${cstyles.small} ${cstyles.padtopsmall}`}>
                <div>ZEC {Utils.maxPrecisionTrimmed(value)}</div>
              </div>
            ) : (
              <div className={`${cstyles.sublight} ${cstyles.small} ${cstyles.padtopsmall}`} style={{ marginLeft: 10 }}>
                {"# " + value.toString() + (type === "sends" ? " sends" : " bytes")}
              </div>
            )}
          </div>
        </div>
        <div style={{ height: 1, backgroundColor: "var(--color-zingo)" }} />
      </div>
    );
  };

  return (
    <div>
      <div className={`${cstyles.xlarge} ${cstyles.screentitle} ${cstyles.center}`}>Financial Insight</div>

      <div className={styles.insightcontainer}>
        <div className={cstyles.well} style={{ display: "flex", flexDirection: "row", justifyContent: "stretch" }}>
          <div className={cstyles.balancebox} style={{ width: "30%", marginRight: 5 }}>
            <div style={{ flexDirection: "column", width: "100%" }}>
              <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>Sent amounts</div>
              <hr />
            </div>
          </div>
          <div className={cstyles.balancebox} style={{ width: "30%", marginRight: 5 }}>
            <div style={{ flexDirection: "column", width: "100%" }}>
              <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>Number of sends</div>
              <hr />
            </div>
          </div>
          <div className={cstyles.balancebox} style={{ width: "30%" }}>
            <div style={{ flexDirection: "column", width: "100%" }}>
              <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>Number of bytes</div>
              <hr />
            </div>
          </div>
        </div>
        {/* Unlike the other screens using this, the block above is a fixed row
            of three headings, so the constant it replaces was not wrong today.
            Measured anyway: it would have to be re-tuned by hand the first time
            a line is added above, and nothing would say so until a row fell off
            the bottom. */}
        <div ref={paneRef}>
          <ScrollPaneTop offsetHeight={paneOffset}>
            {!loading && (
              <div
                className={cstyles.well}
                style={{ display: "flex", flexDirection: "row", justifyContent: "stretch" }}
              >
                <div className={cstyles.balancebox} style={{ width: "30%", marginRight: 5 }}>
                  {dataSent && dataSent.datasets && dataSent.datasets[0].data.length === 0 && (
                    <div
                      style={{ alignSelf: "center", width: "100%" }}
                      className={`${cstyles.center} ${cstyles.margintoplarge}`}
                    >
                      No Transactions Yet
                    </div>
                  )}
                  {dataSent && dataSent.datasets && dataSent.datasets[0].data.length > 0 && (
                    <div style={{ flexDirection: "column", alignItems: "center", width: "100%" }}>
                      <Chart
                        data={dataSent}
                        type={"doughnut"}
                        options={{
                          radius: "90%",
                          responsive: true,
                          cutout: "30%",
                          plugins: {
                            legend: {
                              display: false,
                            },
                            tooltip: {
                              callbacks: {
                                label: function (context) {
                                  return context.label + ": " + context.parsed.toString();
                                },
                              },
                            },
                          },
                        }}
                      />
                      <div style={{ display: "flex", marginLeft: 5, marginRight: 5, padding: 0, alignItems: "center" }}>
                        <div style={{ width: "100%" }}>
                          {dataSent.datasets[0].data.map((value: number, index: number) => {
                            if (value > 0 && dataSent.labels[index] === "fee") {
                              return line(
                                value,
                                dataSent.labels[index],
                                index,
                                dataSent.datasets[0].data,
                                dataSent.datasets[0].backgroundColor[index],
                                "sent",
                              );
                            } else {
                              return null;
                            }
                          })}
                          <div style={{ height: 1, backgroundColor: "var(--color-zingo)" }} />
                          {dataSent.datasets[0].data.map((value: number, index: number) => {
                            if (value > 0 && dataSent.labels[index] !== "fee") {
                              return line(
                                value,
                                dataSent.labels[index],
                                index,
                                dataSent.datasets[0].data,
                                dataSent.datasets[0].backgroundColor[index],
                                "sent",
                              );
                            } else {
                              return null;
                            }
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className={cstyles.balancebox} style={{ width: "30%", marginRight: 5 }}>
                  {dataSends && dataSends.datasets && dataSends.datasets[0].data.length === 0 && (
                    <div
                      style={{ alignSelf: "center", width: "100%" }}
                      className={`${cstyles.center} ${cstyles.margintoplarge}`}
                    >
                      No Transactions Yet
                    </div>
                  )}
                  {dataSends && dataSends.datasets && dataSends.datasets[0].data.length > 0 && (
                    <div style={{ flexDirection: "column", alignItems: "center", width: "100%" }}>
                      <Chart
                        data={dataSends}
                        type={"doughnut"}
                        options={{
                          radius: "90%",
                          responsive: true,
                          cutout: "30%",
                          plugins: {
                            legend: {
                              display: false,
                            },
                          },
                        }}
                      />
                      <div style={{ display: "flex", marginLeft: 5, marginRight: 5, padding: 0, alignItems: "center" }}>
                        <div style={{ width: "100%" }}>
                          {dataSends.datasets[0].data.map((value: number, index: number) => {
                            if (value > 0 && dataSends.labels[index] !== "fee") {
                              return line(
                                value,
                                dataSends.labels[index],
                                index,
                                dataSends.datasets[0].data,
                                dataSends.datasets[0].backgroundColor[index],
                                "sends",
                              );
                            } else {
                              return null;
                            }
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className={cstyles.balancebox} style={{ width: "30%" }}>
                  {dataMemobytes && dataMemobytes.datasets && dataMemobytes.datasets[0].data.length === 0 && (
                    <div
                      style={{ alignSelf: "center", width: "100%" }}
                      className={`${cstyles.center} ${cstyles.margintoplarge}`}
                    >
                      No Transactions Yet
                    </div>
                  )}
                  {dataMemobytes && dataMemobytes.datasets && dataMemobytes.datasets[0].data.length > 0 && (
                    <div style={{ flexDirection: "column", alignItems: "center", width: "100%" }}>
                      <Chart
                        data={dataMemobytes}
                        type={"doughnut"}
                        options={{
                          radius: "90%",
                          responsive: true,
                          cutout: "30%",
                          plugins: {
                            legend: {
                              display: false,
                            },
                          },
                        }}
                      />
                      <div style={{ display: "flex", marginLeft: 5, marginRight: 5, padding: 0, alignItems: "center" }}>
                        <div style={{ width: "100%" }}>
                          {dataMemobytes.datasets[0].data.map((value: number, index: number) => {
                            if (value > 0 && dataMemobytes.labels[index] !== "fee") {
                              return line(
                                value,
                                dataMemobytes.labels[index],
                                index,
                                dataMemobytes.datasets[0].data,
                                dataMemobytes.datasets[0].backgroundColor[index],
                                "memobytes",
                              );
                            } else {
                              return null;
                            }
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {loading && <div className={`${cstyles.center} ${cstyles.margintoplarge}`}>Loading...</div>}
          </ScrollPaneTop>
        </div>
      </div>
    </div>
  );
};

export default Insight;
