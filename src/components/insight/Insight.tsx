import React, { Component } from "react";
import cstyles from "../common/Common.module.css";
//import styles from "./Transactions.module.css";
import { AddressBookEntry } from "../appstate";
import ScrollPane from "../scrollPane/ScrollPane";
import Utils from "../../utils/utils";
import { ContextApp } from "../../context/ContextAppState";
import { Pie } from 'react-chartjs-2';
import native from '../../native.node';

type InsightProps = {
};

type InsightState = {
  expandAddress: boolean[];
  data: any;
  loading: boolean;
  tab: 'sent' | 'sends' | 'memobytes';
};

export default class Insight extends Component<InsightProps, InsightState> {
  static contextType = ContextApp;
  constructor(props: InsightProps) {
    super(props);

    this.state = {
      expandAddress: [],
      data: {},
      loading: false,
      tab: 'sent',
    };
  }

  componentDidMount() {
    this.setState({ loading: true });
    let resultStr: string = '';
    switch (this.state.tab) {
      case 'sent':
        resultStr = native.zingolib_execute('value_to_address', '');
        //console.log('################# value', resultStr);
        break;
      case 'sends':
        resultStr = native.zingolib_execute('sends_to_address', '');
        //console.log('################# sends', resultStr);
        break;
      case 'memobytes':
        resultStr = native.zingolib_execute('memobytes_to_address', '');
        //console.log('################# memobytes', resultStr);
        break;
      default:
        break;
    }
    const resultJSON = JSON.parse(resultStr);
    let amounts: { data: number; address: string; tag: string }[] = [];
    const resultJSONEntries: [string, number][] = Object.entries(resultJSON) as [string, number][];
    resultJSONEntries.forEach(([key, value]) => {
      if (!(this.state.tab !== 'sent' && key === 'fee')) {
        // excluding the fee for `sends` and `memobytes`.
        if (value > 0) {
          amounts.push({ data: this.state.tab === 'sent' ? value / 10 ** 8 : value, address: key, tag: '' });
        }
      }
    });
    const randomColors = Utils.generateColorList(amounts.length);
    const newLabels: string[] = [];
    const newBackgroundColor: string[] = [];
    const newHoverBackgroundColor: string[] = [];
    const newData: number[] = amounts
      .sort((a, b) => b.data - a.data)
      .map((item, index) => {
        newLabels.push(item.tag + item.address);
        newBackgroundColor.push(item.address === 'fee' ? 'gray' : randomColors[index]);
        newHoverBackgroundColor.push(item.address === 'fee' ? 'gray' : randomColors[index]);
        return item.data;
      });
    const newExpandAddress = Array(newData.length).fill(false);
    this.setState({
      data: {
        labels: newLabels,
        datasets: [
          {
            data: newData,
            backgroundColor: newBackgroundColor,
            hoverBackgroundColor: newHoverBackgroundColor,
          },
        ],
      },
      expandAddress: newExpandAddress,
      loading: false,
    });
  }

  render() {
    const { addressBook } = this.context; 

    const addressBookMap: Map<string, string> = addressBook.reduce((m: Map<string, string>, obj: AddressBookEntry) => {
      m.set(obj.address, obj.label);
      return m; 
    }, new Map());

    return (
      <div>
        <div className={[cstyles.well].join(" ")}>
          <div className={cstyles.balancebox}>
            <Pie data={this.state.data} />
          </div>
        </div>

        <div className={[cstyles.xlarge, cstyles.marginnegativetitle, cstyles.center].join(" ")}>Financial Insight</div>

        {/* Change the hardcoded height */}
        <ScrollPane offsetHeight={180}>
          {
            /* If no data, show the "loading..." text */
            this.state.loading && <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>Loading...</div>
          }

          {this.state.data && this.state.data.length === 0 && (
            <div className={[cstyles.center, cstyles.margintoplarge].join(" ")}>No Transactions Yet</div>
          )}
        </ScrollPane>

      </div>
    );
  }
}
