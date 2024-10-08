import { Router } from "express";
import { RedisManager } from "../RedisManger";
import { GET_DEPTH } from "../types";

export const depth = Router();

depth.get('/', async (req, res) => {
    const { market } = req.query;
    const response = await RedisManager.getInstance().sendAndAwait({
        type: GET_DEPTH,
        data: {
            market: market as string
        }
    });

    res.json(response.payload);
});