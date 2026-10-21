import type { Opening } from "../types";
import { opening as c7x } from "./c7x-zhongpao-guohe-che";
import { opening as b2x } from "./b2x-shunpao-zhiche-hengche";
import { opening as b4x } from "./b4x-zhongpao-fangongma";
import { opening as a2x } from "./a2x-feixiang-ju";
import { opening as e0x } from "./e0x-xianren-zhilu";
import { opening as b1x } from "./b1x-zhongpao-liepao";
import { opening as a4x } from "./a4x-qima-ju";

/** 手寫的開局樹原始資料（未合併產線講解），依課程順序。產線腳本從這裡讀。 */
export const rawOpenings: Opening[] = [c7x, b2x, b4x, a2x, e0x, b1x, a4x];
