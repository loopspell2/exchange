import axios from "axios";

const BASE_URL = "http://localhost:3000/api/v1";
const TOTAL_BIDS = 15;
const TOTAL_ASKS = 15;
const MARKET = "TATA_INR";
const USER_ID = "5";

async function main(){
    const price = 1000 + Math.random() * 10;
    const openOrders = await axios.get(`${BASE_URL}/order?userId${USER_ID}&market=${MARKET}`);

    const totalBids = openOrders.data.filter((o : any) => o.side === "buy").length;
    const totalAsks = openOrders.data.filter((o : any) => o.side === "sell").length;

    const cancelledBids = await cancelBidsMoreThan(openOrders.data, price);
    const cancelledAsks = await cancelAsksLessThan(openOrders.data, price);

    let bidsToAdd = TOTAL_BIDS -totalBids -cancelledBids;
    let asksToAdd = TOTAL_ASKS -totalAsks -cancelledAsks;

    while(bidsToAdd > 0 || asksToAdd > 0){
        if(bidsToAdd > 0){
            await axios.post(`${BASE_URL}/order`, {
                market: MARKET,
                price: (price - Math.random() * 1).toFixed(1).toString(),
                quantity: "10",
                side: "buy",
                userId: USER_ID
            });
            bidsToAdd--;
        }

        if(asksToAdd > 0){
            await axios.post(`${BASE_URL}/order`, {
                market: MARKET,
                price: (price + Math.random() * 1).toFixed(1).toString(),
                quantity: "10",
                side: "sell",
                userId: USER_ID
            });
            asksToAdd--;
        }

        await new Promise(resolve => setTimeout(resolve, 1000 ));
        main();
    }
}

async function cancelBidsMoreThan(openOrders : any[], price : number){
    let promises: any[] = [];
    openOrders.map(o => {
        if (o.side === "buy" && (o.price > price || Math.random() < 0.1)){
            promises.push(axios.delete(`${BASE_URL}/order`),{
                data: {
                    orderId: o.orderId,
                    market: MARKET,
                }
            });
        }
    })
    await Promise.all(promises);
    return promises.length;
}

async function cancelAsksLessThan(openOrders : any[], price : number){
    let promises: any[] = [];
    openOrders.map(o => {
        if (o.side === "sell" && (o.price > price || Math.random() < 0.5)){
            promises.push(axios.delete(`${BASE_URL}/order`),{
                data: {
                    orderId: o.orderId,
                    market: MARKET,
                }
            });
        }
    })
    await Promise.all(promises);
    return promises.length;
}

main();