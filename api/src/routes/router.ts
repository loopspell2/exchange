import express from 'express'
import { trade } from '../controller/trade';
import { depth } from '../controller/depth';
import { klines } from '../controller/klines';
import { order } from '../controller/order';
import { tickers } from '../controller/ticker';
import { auth } from '../auth/auth.controller';

const router = express.Router();

router.use('/trade', trade);
router.use('/depth', depth);
router.use('/klines', klines);
router.use('/order', order);
router.use('/tickers', tickers);

router.use('/auth', auth);

export default router;