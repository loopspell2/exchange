import { Client } from 'pg';
import express from 'express';
import { Request, Response } from 'express';
import { RedisManager } from '../RedisManger';

const pgClient = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: 'kuldeep',
    port: 5432,
});

pgClient.connect();
 
export const klines = express.Router();

// klines.get('/', (req: Request, res: Response) => {
//     res.status(200).json({ message: 'Hello World' });
// });

klines.get('/', async (req : Request, res: Response) : Promise< any | void >=> {
    const { market, interval, startTime, endTime } = req.query;

    const start = parseInt(startTime as string);
    const end = parseInt(endTime as string);

    let query;
    switch (interval) {
        case '1m':
            query = `SELECT * FROM klines_1m WHERE bucket >= $1 AND bucket <= $2`;
            break;
        case '1h':
            query = `SELECT * FROM klines_1h WHERE bucket >= $1 AND bucket <= $2`;
            break;
        case '1w':
            query = `SELECT * FROM klines_1w WHERE bucket >= $1 AND bucket <= $2`;
            break;
        default:
            return res.status(400).json({ message: 'Invalid interval' });
    }

    try {
        const result = await pgClient.query(query, [new Date(start * 1000), new Date(end * 1000 )])
        res.json(result.rows.map(x => ({
            close: x.close,
            end: x.bucket,
            high: x.high,
            low: x.low,
            open: x.open,
            quoteVolume: x.quoteVolume,
            start: x.start,
            trades: x.trades,
            volume: x.volume,
        })));
    }catch(err){
        console.error(err);
        res.status(500).json({ message: 'Internal server error' });
    }
});