import React, { useContext, useEffect, useState } from "react";
import styles from "./Insight.module.css";
import cstyles from "../common/Common.module.css";
import ScrollPane from "../scrollPane/ScrollPane";
import Utils from "../../utils/utils";
import { ContextApp } from "../../context/ContextAppState";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faQrcode } from '@fortawesome/free-solid-svg-icons';
import 'chart.js/auto';
import { Chart } from 'react-chartjs-2';
import native from '../../native.node';

type InsightProps = {
};

type Data = {
  labels: string[],
  datasets: Dataset[],
};

type Dataset = {
  data: number[],
  backgroundColor: string[],
  hoverBackgroundColor: string[],
};

const Insight: React.FC<InsightProps> = () => {
  const context = useContext(ContextApp);
  const { addressBook } = context;

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
    const resultStr: string = await native.zingolib_execute_async('value_to_address', '');
    //console.log('################# value', resultStr);

    const resultJSON = JSON.parse(resultStr);
    let amounts: { data: number; address: string; tag: string }[] = [];
    const resultJSONEntries: [string, number][] = Object.entries(resultJSON) as [string, number][];
    resultJSONEntries.forEach(([key, value]) => {
      if (value > 0) {
        //console.log(value, key);
        const tag = addressBook.filter((a: any) => a.address === key);
        amounts.push({ data: value / 10 ** 8, address: key, tag: !!tag && tag.length > 0 ? tag[0].label : '' });
      }
    });
    //console.log(amounts);
    const randomColors = Utils.generateColorList(amounts.length);
    const newLabels: string[] = [];
    const newBackgroundColor: string[] = [];
    const newHoverBackgroundColor: string[] = [];
    const newData: number[] = amounts
      .sort((a, b) => b.data - a.data)
      .map((item, index) => {
        newLabels.push(!!item.tag ? item.tag : item.address === 'fee' ? item.address : Utils.trimToSmall(item.address, 10));
        newBackgroundColor.push(item.address === 'fee' ? 'gray' : randomColors[index]);
        newHoverBackgroundColor.push(item.address === 'fee' ? 'gray' : randomColors[index]);
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
  }

  const fetchDataSends: () => void = async () => {
    const resultStr = await native.zingolib_execute_async('sends_to_address', '');
    //console.log('################# sends', resultStr);
        
    const resultJSON = JSON.parse(resultStr);
    let amounts: { data: number; address: string; tag: string }[] = [];
    const resultJSONEntries: [string, number][] = Object.entries(resultJSON) as [string, number][];
    resultJSONEntries.forEach(([key, value]) => {
      if (key !== 'fee' && value > 0) {
        const tag = addressBook.filter((a: any) => a.address === key);
        amounts.push({ data: false ? value / 10 ** 8 : value, address: key, tag: !!tag && tag.length > 0 ? tag[0].label : '' });
      }
    });
    const randomColors = Utils.generateColorList(amounts.length);
    const newLabels: string[] = [];
    const newBackgroundColor: string[] = [];
    const newHoverBackgroundColor: string[] = [];
    const newData: number[] = amounts
      .sort((a, b) => b.data - a.data)
      .map((item, index) => {
        newLabels.push(!!item.tag ? item.tag : item.address === 'fee' ? item.address : Utils.trimToSmall(item.address, 10));
        newBackgroundColor.push(item.address === 'fee' ? 'gray' : randomColors[index]);
        newHoverBackgroundColor.push(item.address === 'fee' ? 'gray' : randomColors[index]);
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
  }

  const fetchDataMemobytes: () => void = async () => {
    const resultStr = await native.zingolib_execute_async('memobytes_to_address', '');
    //console.log('################# memobytes', resultStr);

    const resultJSON = JSON.parse(resultStr);
    let amounts: { data: number; address: string; tag: string }[] = [];
    const resultJSONEntries: [string, number][] = Object.entries(resultJSON) as [string, number][];
    resultJSONEntries.forEach(([key, value]) => {
      if (key !== 'fee' && value > 0) {
        const tag = addressBook.filter((a: any) => a.address === key);
        amounts.push({ data: false ? value / 10 ** 8 : value, address: key, tag: !!tag && tag.length > 0 ? tag[0].label : '' });
      }
    });
    const randomColors = Utils.generateColorList(amounts.length);
    const newLabels: string[] = [];
    const newBackgroundColor: string[] = [];
    const newHoverBackgroundColor: string[] = [];
    const newData: number[] = amounts
      .sort((a, b) => b.data - a.data)
      .map((item, index) => {
        newLabels.push(!!item.tag ? item.tag : item.address === 'fee' ? item.address : Utils.trimToSmall(item.address, 10));
        newBackgroundColor.push(item.address === 'fee' ? 'gray' : randomColors[index]);
        newHoverBackgroundColor.push(item.address === 'fee' ? 'gray' : randomColors[index]);
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
  }

  const getPercent = (percent: number) => {
    return (percent < 1 ? '<1' : percent < 100 && percent >= 99 ? '99' : percent.toFixed(0)) + '%';
  };

  const line = (value: number, address: string, index: number, amounts: number[], color: string, type: 'sent' | 'sends' | 'memobytes') => {
    const totalValue = amounts ? amounts.reduce((acc, curr) => acc + curr, 0) : 0;
    const percent = (100 * value) / totalValue;
    return (
      <div style={{ width: '100%' }} key={`tag-${index}`}>
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 5,
            marginBottom: 5,
            borderBottomColor: '#333333',
            borderBottomWidth: address !== 'fee' ? 1 : 0,
          }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 10,
            }}>
            <FontAwesomeIcon icon={faQrcode} color={color} style={{ height: 20, marginRight: 10 }} />
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'wrap',
              }}>
              <div>
                {address.length > 10
                  ? Utils.trimToSmall(address, 6)
                  : address}
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <div className={[cstyles.sublight, cstyles.small, cstyles.padtopsmall].join(" ")} style={{ marginRight: 10 }}>
              {getPercent(percent)}
            </div>
            {type === 'sent' ? (
              <div className={[cstyles.sublight, cstyles.small, cstyles.padtopsmall].join(" ")}>
                <div>ZEC {Utils.maxPrecisionTrimmed(value)}</div>
              </div>
            ) : (
              <div className={[cstyles.sublight, cstyles.small, cstyles.padtopsmall].join(" ")} style={{ marginLeft: 10 }}>
                {'# ' +
                  value.toString() +
                  (type === 'sends' ? ' sends' : ' bytes')}
              </div>
            )}
          </div>
        </div>
        <div style={{ height: 1, backgroundColor: 'lightgray' }} />
      </div>
    );
  };

  //console.log(dataSent, dataSends, dataMemobytes);

  return (
    <div>
      <div className={[cstyles.xlarge, cstyles.margintopsmall, cstyles.center].join(" ")}>Financial Insight</div>

      <div className={styles.insightcontainer}>
        <div className={[cstyles.well].join(" ")} style={{ display: 'flex', flexDirection: 'row', justifyContent: 'stretch' }}>
          <div className={cstyles.balancebox} style={{ width: '30%', marginRight: 5 }}>
            <div style={{ flexDirection: 'column', width: '100%' }}>
              <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>Sent amounts</div>
              <hr />
            </div>
          </div>
          <div className={cstyles.balancebox} style={{ width: '30%', marginRight: 5 }}>
            <div style={{ flexDirection: 'column', width: '100%' }}>
              <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>Number of sends</div>
              <hr />
            </div>
          </div>
          <div className={cstyles.balancebox} style={{ width: '30%' }}>
            <div style={{ flexDirection: 'column', width: '100%' }}>
              <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>Number of bytes</div>
              <hr />
            </div>
          </div>
        </div>
        <ScrollPane offsetHeight={150}>
          {!loading && (
            <div className={[cstyles.well].join(" ")} style={{ display: 'flex', flexDirection: 'row', justifyContent: 'stretch' }}>
              <div className={cstyles.balancebox} style={{ width: '30%', marginRight: 5 }}>
                {dataSent && dataSent.datasets && dataSent.datasets[0].data.length === 0 && (
                  <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>No Transactions Yet</div>
                )}
                {dataSent && dataSent.datasets && dataSent.datasets[0].data.length > 0 && (
                  <div style={{ flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                    <Chart 
                      data={dataSent} 
                      type={"doughnut"}
                      options={{
                        radius: '90%', 
                        responsive: true,
                        cutout: '30%',
                        plugins: {
                          legend: {
                            display: false,
                          },
                          tooltip: {
                            callbacks: {
                              label: function(context) {
                                return context.label + ': ' + context.parsed.toString();
                              }
                            }
                          }
                        }
                      }}
                    />
                    <div style={{ display: 'flex', marginLeft: 5, marginRight: 5, padding: 0, alignItems: 'center' }}>
                      <div style={{ width: '100%' }}>
                          {dataSent.datasets[0].data
                            .map((value: number, index: number) => {
                              if (value > 0 && dataSent.labels[index] === 'fee') {
                                return line(value, dataSent.labels[index], index, dataSent.datasets[0].data, dataSent.datasets[0].backgroundColor[index], 'sent');
                              } else {
                                return null;
                              }
                            })}
                          <div style={{ height: 1, backgroundColor: 'lightgray' }} />
                          {dataSent.datasets[0].data
                            .map((value: number, index: number) => {
                              if (value > 0 && dataSent.labels[index] !== 'fee') {
                                return line(value, dataSent.labels[index], index, dataSent.datasets[0].data, dataSent.datasets[0].backgroundColor[index], 'sent');
                              } else {
                                return null;
                              }
                            })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className={cstyles.balancebox} style={{ width: '30%', marginRight: 5 }}>
                {dataSends && dataSends.datasets && dataSends.datasets[0].data.length === 0 && (
                  <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>No Transactions Yet</div>
                )}
                {dataSends && dataSends.datasets && dataSends.datasets[0].data.length > 0 && (
                  <div style={{ flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                    <Chart 
                      data={dataSends} 
                      type={"doughnut"}
                      options={{
                        radius: '90%', 
                        responsive: true,
                        cutout: '30%',
                        plugins: {
                          legend: {
                            display: false,
                          },
                        },
                      }}
                    />
                    <div style={{ display: 'flex', marginLeft: 5, marginRight: 5, padding: 0, alignItems: 'center' }}>
                      <div style={{ width: '100%' }}>
                          {dataSends.datasets[0].data
                            .map((value: number, index: number) => {
                              if (value > 0 && dataSends.labels[index] !== 'fee') {
                                return line(value, dataSends.labels[index], index, dataSends.datasets[0].data, dataSends.datasets[0].backgroundColor[index], 'sends');
                              } else {
                                return null;
                              }
                            })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className={cstyles.balancebox} style={{ width: '30%' }}>
                {dataMemobytes && dataMemobytes.datasets && dataMemobytes.datasets[0].data.length === 0 && (
                  <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>No Transactions Yet</div>
                )}
                {dataMemobytes && dataMemobytes.datasets && dataMemobytes.datasets[0].data.length > 0 && (
                  <div style={{ flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                    <Chart 
                      data={dataMemobytes} 
                      type={"doughnut"}
                      options={{
                        radius: '90%', 
                        responsive: true,
                        cutout: '30%',
                        plugins: {
                          legend: {
                            display: false,
                          },
                        },
                      }}
                    />
                    <div style={{ display: 'flex', marginLeft: 5, marginRight: 5, padding: 0, alignItems: 'center' }}>
                      <div style={{ width: '100%' }}>
                          {dataMemobytes.datasets[0].data
                            .map((value: number, index: number) => {
                              if (value > 0 && dataMemobytes.labels[index] !== 'fee') {
                                return line(value, dataMemobytes.labels[index], index, dataMemobytes.datasets[0].data, dataMemobytes.datasets[0].backgroundColor[index], 'memobytes');
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
          {loading && (
            <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>Loading...</div> 
          )}
        </ScrollPane>
      </div>

    </div>
  );
};

export default Insight;