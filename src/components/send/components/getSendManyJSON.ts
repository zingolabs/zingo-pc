import Utils from "../../../utils/utils";
import { SendPageState } from "../../appstate";
import SendManyJsonType from "./SendManyJSONType";
  
function getSendManyJSON(sendPageState: SendPageState): SendManyJsonType[] {
const json = sendPageState.toaddrs.flatMap((to) => {
    const memo = (to.memo || "") + (to.memoReplyTo || "");
    const amount = parseInt((to.amount * 10 ** 8).toFixed(0));

    if (memo === "") {
    return { address: to.to, amount, memo: undefined };
    } else if (memo.length <= 512) {
    return { address: to.to, amount, memo };
    } else {
    // If the memo is more than 512 bytes, then we split it into multiple transactions.
    // Each memo will be `(xx/yy)memo_part`. The prefix "(xx/yy)" is 7 bytes long, so
    // we'll split the memo into 512-7 = 505 bytes length
    const splits = Utils.utf16Split(memo, 505);
    const tos = [];

    // The first one contains all the tx value
    tos.push({ address: to.to, amount, memo: `(1/${splits.length})${splits[0]}` });

    for (let i = 1; i < splits.length; i++) {
        tos.push({ address: to.to, amount: 0, memo: `(${i + 1}/${splits.length})${splits[i]}` });
    }

    return tos;
    }
});

console.log("Sending:");
console.log(json);

return json;
}

export default getSendManyJSON;