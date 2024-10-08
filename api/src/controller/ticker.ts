

import { Router } from "express";

export const tickers = Router();

tickers.get("/", async (req, res) => {
    res.json({});
});