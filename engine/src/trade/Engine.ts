import fs from "fs";
import { Fill, Order, Orderbook } from "./Orderbook";
import { CANCEL_ORDER, CREATE_ORDER, GET_DEPTH, GET_OPEN_ORDERS, MessageFromApi, ON_RAMP } from "../types/fromApi";
import { RedisManager } from "../ResdisManager";
import { ORDER_UPDATE, TRADE_ADDED } from "../types";


export const BASE_CURRENCY = "INR";

interface UserBalance {
    [key: string]: {
        available: number,
        locked: number
    }
}

export class Engine {

    private orderbook: Orderbook[] = [];
    private balances: Map<string, UserBalance> = new Map();

    constructor() {
        let snapshot = null;
        try {
            if (process.env.WITH_SNAPSHOT) {
                snapshot = fs.readFileSync("./snapshot.json");
            }
        } catch (e) {
            console.log("No snapshot found");
        }

        if (snapshot) {
            const snapshotSnapshot = JSON.parse(snapshot.toString());
            this.orderbook = snapshotSnapshot.orderbook.map((o: Orderbook) => new Orderbook(o.baseAsset, o.bids, o.asks, o.lastTradeId, o.currentPrice));
            this.balances = new Map(snapshotSnapshot.balances);
        } else {
            this.orderbook = [new Orderbook(`TATA`, [], [], 0, 0)];
        }

        setInterval(() => {
            this.saveSnapshot();
        }, 3 * 1000);
    }

    saveSnapshot() {
        const snapshotSnapshot = {
            orderbooks: this.orderbook.map(o => o.getSnapShot()),
            balances: Array.from(this.balances.entries())
        }
        fs.writeFileSync("./snapshot.json", JSON.stringify(snapshotSnapshot));
    }

    process({ message, clientId }: { message: MessageFromApi, clientId: string }) {

        switch (message.type) {
            case CREATE_ORDER:
                try {
                    const { executedQty, fills, orderId } = this.createOrder(message.data.market, +message.data.price, message.data.quantity, message.data.side, message.data.userId);
                    RedisManager.getInstance().sentToApi(clientId, {
                        type: "ORDER_PLACED",
                        payload: {
                            orderId,
                            executedQty,
                            fills
                        }
                    });
                } catch (e) {
                    console.log(e);
                    RedisManager.getInstance().sentToApi(clientId, {
                        type: "ORDER_CANCELLED",
                        payload: {
                            orderId: "",
                            executedQty: 0,
                            remainingQty: 0,
                        }
                    });
                }
                break;

            case CANCEL_ORDER:
                try {
                    const orderId = message.data.orderId;
                    const cancelMarket = message.data.market;
                    const cancelOrderbook = this.orderbook.find(o => o.ticker() === cancelMarket);
                    const quoteAsset = cancelMarket.split("_")[1];
                    if (!cancelOrderbook) {
                        throw new Error("Invalid market");
                    }
                    const order = cancelOrderbook.asks.find(o => o.orderId === orderId) || cancelOrderbook.bids.find(o => o.orderId === orderId);
                    if (!order) {
                        console.log("No order found");
                        throw new Error("No order found");
                    }
                    if (order.side === 'buy') {
                        const price = cancelOrderbook.cancelBids(order);
                        const leftQuantity = (order.quantity - order.filled) * order.price;
                        const userBalance = this.balances.get(order.userId);
                        if (userBalance) {
                            userBalance[BASE_CURRENCY].available += leftQuantity;
                            userBalance[BASE_CURRENCY].locked -= leftQuantity;
                        }
                        if (price) {
                            this.sendUpdatedDepthAt(price.toString(), cancelMarket);
                        }
                    } else {
                        const price = cancelOrderbook.cancelAsks(order);
                        const leftQuantity = order.quantity - order.filled;
                        const userBalance = this.balances.get(order.userId);
                        if (userBalance) {
                            userBalance[quoteAsset].available += leftQuantity;
                            userBalance[quoteAsset].locked -= leftQuantity;
                        }
                        if (price) {
                            this.sendUpdatedDepthAt(price.toString(), cancelMarket);
                        }
                    }

                    RedisManager.getInstance().sentToApi(clientId, {
                        type: "ORDER_CANCELLED",
                        payload: {
                            orderId,
                            executedQty: 0,
                            remainingQty: 0,
                        }
                    })
                } catch (e) {
                    console.log("Error in cancel order");
                    console.log(e);
                }
                break;

            case GET_OPEN_ORDERS:
                try {
                    const openOrderBook = this.orderbook.find(o => o.ticker() === message.data.market);
                    if (!openOrderBook) {
                        throw new Error("Orderbook not found");
                    }
                    const openOrders = openOrderBook.getOpenOrders(message.data.userId);
                    RedisManager.getInstance().sentToApi(clientId, {
                        type: "OPEN_ORDERS",
                        payload: openOrders,
                    });
                } catch (e) {
                    console.log("Error in get open orders");
                    console.log(e);
                }
                break;

            case ON_RAMP:
                const userId = message.data.userId;
                const amount = Number(message.data.amount);
                this.onRamp(userId, amount);
                break;

            case GET_DEPTH:
                try {
                    const market = message.data.market;
                    const orderbook = this.orderbook.find(o => o.ticker() === market);
                    if (!orderbook) {
                        throw new Error("orderbook not found");
                    }
                    RedisManager.getInstance().sentToApi(clientId, {
                        type: "DEPTH",
                        payload: orderbook.getDepth(),
                    })
                } catch (e) {
                    console.log(e);
                    RedisManager.getInstance().sentToApi(clientId, {
                        type: "DEPTH",
                        payload: {
                            bids: [],
                            asks: []
                        }
                    });
                }
                break;
        }

    }

    createOrder(market: string, price: number, quantity: string, side: "buy" | "sell", userId: string) {
        const orderbook = this.orderbook.find(o => o.ticker() === market);
        const baseAsset = market.split("_")[0];
        const quoteAsset = market.split("_")[1];

        if (!orderbook) {
            throw new Error("Invalid market");
        }

        this.checkAndLockFunds(baseAsset, quoteAsset, side, userId, price, quantity);

        const order: Order = {
            price: Number(price),
            quantity: Number(quantity),
            orderId: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
            filled: 0,
            side,
            userId
        };

        const { fills, executedQty } = orderbook.addOrder(order);
        this.updateBalance(userId, baseAsset, quoteAsset, side, fills, executedQty);
        this.createDbTrades(fills, market, userId);
        this.updateDbOrders(order, executedQty, fills, market);
        this.publishWsDepthUpdate(fills, price, side, market);
        this.publishWsTrades(fills, userId, market);
        return { executedQty, fills, orderId: order.orderId };
    }

    addOrderbook(orderbook: Orderbook) {
        this.orderbook.push(orderbook);
    }

    updateBalance(userId: string, baseAsset: string, quoteAsset: string, side: 'buy' | 'sell', fills: Fill[], executedQty: number) {
        if (side === 'buy') {
            fills.forEach(fill => {
                // update quote asset balance
                const otherUserBalance = this.balances.get(fill.otherUserId);
                if (otherUserBalance) {
                    otherUserBalance[quoteAsset].available += (+fill.price * fill.qty);
                }

                const userBalance = this.balances.get(userId);
                if (userBalance) {
                    userBalance[quoteAsset].locked -= (+fill.price * fill.qty);
                }

                // update base asset balance
                if (otherUserBalance) {
                    otherUserBalance[baseAsset].locked -= fill.qty;
                }
                if (userBalance) {
                    userBalance[baseAsset].available += fill.qty;
                }
            })
        } else {
            fills.forEach(fill => {
                // update quote asset balance
                const otherUserBalance = this.balances.get(fill.otherUserId);
                if (otherUserBalance) {
                    otherUserBalance[quoteAsset].locked -= (+fill.price * fill.qty);
                }

                const userBalance = this.balances.get(userId);
                if (userBalance) {
                    userBalance[quoteAsset].available += (+fill.price * fill.qty);
                }
                // update base asset balance
                if (otherUserBalance) {
                    otherUserBalance[baseAsset].available += fill.qty;
                }
                if (userBalance) {
                    userBalance[baseAsset].locked -= fill.qty;
                }
            })
        }
    }

    checkAndLockFunds(baseAsset: string, quoteAsset: string, side: 'buy' | 'sell', userId: string, price: number, quantity: string) {
        if (side === 'buy') {
            const userBalance = this.balances.get(userId);
            if (userBalance) {
                if (userBalance[quoteAsset].available < (price * Number(quantity))) {
                    throw new Error("Insufficient balance");
                }
                userBalance[quoteAsset].available -= (price * Number(quantity));
                userBalance[quoteAsset].locked += (price * Number(quantity));
            }
        } else {
            const userBalance = this.balances.get(userId);
            if (userBalance) {
                if (userBalance[baseAsset].available < Number(quantity)) {
                    throw new Error("Insufficient balance");
                }
                userBalance[baseAsset].available -= Number(quantity);
                userBalance[baseAsset].locked += Number(quantity)
            }
        }
    }

    createDbTrades(fills: Fill[], market: string, userId: string) {
        fills.forEach(fill => {
            RedisManager.getInstance().pushMessage({
                type: TRADE_ADDED,
                data: {
                    market: market,
                    id: fill.tradeId.toString(),
                    isBuyerMarker: fill.otherUserId === userId, //Todo this is right?
                    price: fill.price.toString(),
                    quantity: fill.qty.toString(),
                    quoteQuantity: (+fill.price * fill.qty).toString(),
                    timestamp: Date.now(),
                }
            });
        });
    }

    updateDbOrders(order: Order, executedQty: number, fills: Fill[], market: string) {
        RedisManager.getInstance().pushMessage({
            type: ORDER_UPDATE,
            data: {
                orderId: order.orderId,
                executedQty: executedQty,
                market: market,
                price: order.price.toString(),
                quantity: order.quantity.toString(),
                side: order.side,
            }
        });

        fills.forEach(fill => {
            RedisManager.getInstance().pushMessage({
                type: ORDER_UPDATE,
                data: {
                    orderId: fill.markerOrderId,
                    executedQty: fill.qty,
                }
            });
        });
    }

    publishWsDepthUpdate(fills: Fill[], price: number, side: 'buy' | 'sell', market: string) {

        const orderbook = this.orderbook.find(o => o.ticker() === market);
        if (!orderbook) {
            return;
        }

        const depth = orderbook.getDepth();
        if (side === 'buy') {
            const updateAsks = depth?.asks.filter(x => fills.map(f => (f.price.toString())).includes(x[0].toString()));
            const updateBids = depth?.bids.find(x => x[0] === (price.toString()));
            console.log("publish ws depth update");
            RedisManager.getInstance().publishMessage(`depth@${market}`, {
                stream: `depth@${market}`,
                data: {
                    a: updateAsks,
                    b: updateBids ? [updateBids] : [],
                    e: "depth"
                }
            });
        }

        if (side === 'sell') {
            const updateAsks = depth?.asks.find(x => x[0] === (price.toString()));
            const updateBids = depth?.bids.filter(x => fills.map(f => (f.price.toString())).includes(x[0].toString()));
            console.log("publish ws depth update");
            RedisManager.getInstance().publishMessage(`depth@${market}`, {
                stream: `depth@${market}`,
                data: {
                    a: updateAsks ? [updateAsks] : [],
                    b: updateBids,
                    e: "depth"
                }
            });
        }
    }

    publishWsTrades(fills: Fill[], userId: string, market: string) {
        fills.forEach(fill => {
            RedisManager.getInstance().publishMessage(`trade@${market}`, {
                stream: `trade@${market}`,
                data: {
                    e: "trade",
                    t: fill.tradeId,
                    m: fill.otherUserId === userId, // TODO: Is this right?
                    p: fill.price.toString(),
                    q: fill.qty.toString(),
                    s: market,
                }
            });
        });
    }

    sendUpdatedDepthAt(price: string, market: string) {
        const orderbook = this.orderbook.find(o => o.ticker() === market);
        if (!orderbook) {
            return;
        }
        const depth = orderbook.getDepth();
        const updateAsks = depth?.asks.find(x => x[0] === price);
        const updateBids = depth?.bids.find(x => x[0] === price);

        RedisManager.getInstance().publishMessage(`depth@${market}`, {
            stream: `depth@${market}`,
            data: {
                a: updateAsks ? [updateAsks] : [],
                b: updateBids ? [updateBids] : [],
                e: "depth"
            }
        });
    }

    onRamp(userId: string, amount: number) {
        const userBalance = this.balances.get(userId);
        if (!userBalance) {
            this.balances.set(userId, {
                [BASE_CURRENCY]: {
                    available: amount,
                    locked: 0,
                }
            });
        } else {
            userBalance[BASE_CURRENCY].available += amount;
        }
    }

    setBaseBalance() {
        this.balances.set("1", {
            [BASE_CURRENCY]: {
                available: 10000000,
                locked: 0,
            },
            "TATA": {
                available: 10000000,
                locked: 0,
            }
        });
        this.balances.set("2", {
            [BASE_CURRENCY]: {
                available: 10000000,
                locked: 0,
            },
            "TATA": {
                available: 10000000,
                locked: 0,
            }
        });
        this.balances.set("5", {
            [BASE_CURRENCY]: {
                available: 10000000,
                locked: 0,
            },
            "TATA": {
                available: 10000000,
                locked: 0,
            }
        });
    }
}