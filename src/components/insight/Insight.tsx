import React, { Component } from "react";
import styles from "./Insight.module.css";
import cstyles from "../common/Common.module.css";
//import { AddressBookEntry } from "../appstate";
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

type InsightState = {
  expandAddressSent: boolean[];
  expandAddressSends: boolean[];
  expandAddressMemobytes: boolean[];
  dataSent: any;
  dataSends: any;
  dataMemobytes: any;
  loading: boolean;
};

export default class Insight extends Component<InsightProps, InsightState> {
  static contextType = ContextApp;
  constructor(props: InsightProps) {
    super(props);

    this.state = {
      expandAddressSent: [],
      expandAddressSends: [],
      expandAddressMemobytes: [],
      dataSent: {
        labels: [],
        datasets: [
          {
            data: [],
            backgroundColor: [],
            hoverBackgroundColor: [],
          },
        ],
      },
      dataSends: {
        labels: [],
        datasets: [
          {
            data: [],
            backgroundColor: [],
            hoverBackgroundColor: [],
          },
        ],
      },
      dataMemobytes: {
        labels: [],
        datasets: [
          {
            data: [],
            backgroundColor: [],
            hoverBackgroundColor: [],
          },
        ],
      },
      loading: true,
    };
  }

  componentDidMount(): void {
    this.fetchDataSent();
    this.fetchDataSends();
    this.fetchDataMemobytes();
    this.setState({ loading: false });
  }

  fetchDataSent: () => void = async () => {
    const { addressBook } = this.context;
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
    const newExpandAddress = Array(newData.length).fill(false);
    this.setState({
      dataSent: {
        labels: newLabels,
        datasets: [
          {
            data: newData,
            backgroundColor: newBackgroundColor,
            hoverBackgroundColor: newHoverBackgroundColor,
          },
        ],
      },
      expandAddressSent: newExpandAddress,
    });
  }

  fetchDataSends: () => void = async () => {
    const { addressBook } = this.context;
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
    const newExpandAddress = Array(newData.length).fill(false);
    this.setState({
      dataSends: {
        labels: newLabels,
        datasets: [
          {
            data: newData,
            backgroundColor: newBackgroundColor,
            hoverBackgroundColor: newHoverBackgroundColor,
          },
        ],
      },
      expandAddressSends: newExpandAddress,
    });
  }

  fetchDataMemobytes: () => void = async () => {
    const { addressBook } = this.context;
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
    const newExpandAddress = Array(newData.length).fill(false);
    this.setState({
      dataMemobytes: {
        labels: newLabels,
        datasets: [
          {
            data: newData,
            backgroundColor: newBackgroundColor,
            hoverBackgroundColor: newHoverBackgroundColor,
          },
        ],
      },
      expandAddressMemobytes: newExpandAddress,
    });
  }

  getPercent = (percent: number) => {
    return (percent < 1 ? '<1' : percent < 100 && percent >= 99 ? '99' : percent.toFixed(0)) + '%';
  };

  line = (value: number, address: string, index: number, amounts: number[], color: string, type: 'sent' | 'sends' | 'memobytes') => {
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
              {this.getPercent(percent)}
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

  render() {
    //const { addressBook } = this.context; 

    //const addressBookMap: Map<string, string> = addressBook.reduce((m: Map<string, string>, obj: AddressBookEntry) => {
    //  m.set(obj.address, obj.label);
    //  return m; 
    //}, new Map()); 

    //console.log(this.state.dataSent.datasets[0].data, this.state.dataSent.labels);

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
            {!this.state.loading && (
              <div className={[cstyles.well].join(" ")} style={{ display: 'flex', flexDirection: 'row', justifyContent: 'stretch' }}>
                <div className={cstyles.balancebox} style={{ width: '30%', marginRight: 5 }}>
                  {this.state.dataSent.datasets[0].data.length === 0 && (
                    <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>No Transactions Yet</div>
                  )}
                  {this.state.dataSent.datasets[0].data.length > 0 && (
                    <div style={{ flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                      <Chart 
                        data={this.state.dataSent} 
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
                            {this.state.dataSent.datasets[0].data
                              .map((value: number, index: number) => {
                                if (value > 0 && this.state.dataSent.labels[index] === 'fee') {
                                  return this.line(value, this.state.dataSent.labels[index], index, this.state.dataSent.datasets[0].data, this.state.dataSent.datasets[0].backgroundColor[index], 'sent');
                                } else {
                                  return null;
                                }
                              })}
                            <div style={{ height: 1, backgroundColor: 'lightgray' }} />
                            {this.state.dataSent.datasets[0].data
                              .map((value: number, index: number) => {
                                if (value > 0 && this.state.dataSent.labels[index] !== 'fee') {
                                  return this.line(value, this.state.dataSent.labels[index], index, this.state.dataSent.datasets[0].data, this.state.dataSent.datasets[0].backgroundColor[index], 'sent');
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
                  {this.state.dataSends.datasets[0].data.length === 0 && (
                    <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>No Transactions Yet</div>
                  )}
                  {this.state.dataSends.datasets[0].data.length > 0 && (
                    <div style={{ flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                      <Chart 
                        data={this.state.dataSends} 
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
                            {this.state.dataSends.datasets[0].data
                              .map((value: number, index: number) => {
                                if (value > 0 && this.state.dataSends.labels[index] !== 'fee') {
                                  return this.line(value, this.state.dataSends.labels[index], index, this.state.dataSends.datasets[0].data, this.state.dataSends.datasets[0].backgroundColor[index], 'sends');
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
                  {this.state.dataMemobytes.datasets[0].data.length === 0 && (
                    <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>No Transactions Yet</div>
                  )}
                  {this.state.dataMemobytes.datasets[0].data.length > 0 && (
                    <div style={{ flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                      <Chart 
                        data={this.state.dataMemobytes} 
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
                            {this.state.dataMemobytes.datasets[0].data
                              .map((value: number, index: number) => {
                                if (value > 0 && this.state.dataMemobytes.labels[index] !== 'fee') {
                                  return this.line(value, this.state.dataMemobytes.labels[index], index, this.state.dataMemobytes.datasets[0].data, this.state.dataMemobytes.datasets[0].backgroundColor[index], 'memobytes');
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
            {this.state.loading && (
              <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>Loading...</div> 
            )}
          </ScrollPane>
        </div>

      </div>
    );
  }
}
