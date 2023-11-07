import React, { Component } from "react";
import styles from "./Insight.module.css";
import cstyles from "../common/Common.module.css";
//import { AddressBookEntry } from "../appstate";
import ScrollPane from "../scrollPane/ScrollPane";
import Utils from "../../utils/utils";
import { ContextApp } from "../../context/ContextAppState";
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

  render() {
    const { addressBook } = this.context; 

    //const addressBookMap: Map<string, string> = addressBook.reduce((m: Map<string, string>, obj: AddressBookEntry) => {
    //  m.set(obj.address, obj.label);
    //  return m; 
    //}, new Map());

    console.log(addressBook);

    return (
      <div>
        <div className={[cstyles.xlarge, cstyles.margintoplarge, cstyles.center].join(" ")}>Financial Insight</div>

        <div className={styles.insightcontainer}>
          <ScrollPane offsetHeight={40}>
            {!this.state.loading && (
              <div className={[cstyles.well].join(" ")} style={{ display: 'flex', flexDirection: 'row', width: '100%', justifyContent: 'space-between' }}>
                <div className={cstyles.balancebox} style={{ width: '33%' }}>
                  {this.state.dataSent.datasets[0].data.length === 0 && (
                    <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>No Transactions Yet</div>
                  )}
                  {this.state.dataSent.datasets[0].data.length > 0 && (
                    <div style={{ flexDirection: 'column' }}>
                      <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>Sent amounts</div>
                      <hr />
                      <Chart 
                        data={this.state.dataSent} 
                        type={"doughnut"}
                        options={{
                          cutout: '30%',
                          plugins: {
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
                    </div>
                  )}
                </div>
                <div className={cstyles.balancebox} style={{ width: '33%' }}>
                  {this.state.dataSends.datasets[0].data.length === 0 && (
                    <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>No Transactions Yet</div>
                  )}
                  {this.state.dataSends.datasets[0].data.length > 0 && (
                    <div style={{ flexDirection: 'column' }}>
                      <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>Number of sends</div>
                      <hr />
                      <Chart 
                        data={this.state.dataSends} 
                        type={"doughnut"}
                        options={{
                          cutout: '30%',
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className={cstyles.balancebox} style={{ width: '33%' }}>
                  {this.state.dataMemobytes.datasets[0].data.length === 0 && (
                    <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>No Transactions Yet</div>
                  )}
                  {this.state.dataMemobytes.datasets[0].data.length > 0 && (
                    <div style={{ flexDirection: 'column' }}>
                      <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>Number of bytes</div>
                      <hr />
                      <Chart 
                        data={this.state.dataMemobytes} 
                        type={"doughnut"}
                        options={{
                          cutout: '30%',
                        }}
                      />
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
