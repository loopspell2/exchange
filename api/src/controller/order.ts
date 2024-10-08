import express from "express";
import { RedisManager } from "../RedisManger";
import { CANCEL_ORDER, CREATE_ORDER, GET_OPEN_ORDERS } from "../types";

export const order = express.Router();

order.post('/', async (req, res) => {
    const {market, price, quantity, side, userId} = req.body;
    console.log(market, price, quantity, side, userId);

    //TODO: can u make the type of the response object right? Right now it is a union.
    const response = await RedisManager.getInstance().sendAndAwait({
        type: CREATE_ORDER,
        data:{
            market,
            price,
            quantity,
            side,
            userId
        }
    });

    res.status(200).json(response.payload);
});

order.delete('/', async(req, res) => {
    const {orderId, market} = req.body;
    const response = await RedisManager.getInstance().sendAndAwait({
        type: CANCEL_ORDER,
        data:{ 
            orderId,
            market
        }
    });
    res.json(response.payload);
})

order.get('/', async (req, res) => {
    const response = await RedisManager.getInstance().sendAndAwait({
        type: GET_OPEN_ORDERS,
        data:{
            userId: req.query.userId as string,
            market: req.query.market as string,
        }
    });
    res.json(response.payload);
});