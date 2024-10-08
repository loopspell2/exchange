import express,{ Request, Response } from 'express';

export const trade = express.Router();

trade.get('/', (req: Request, res: Response) => {
    const { market } = req.query;
    // get from DB
    res.json({});
});
