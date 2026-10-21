import type { Opening } from "../types";

/** 第五課：仙人指路對卒底炮。【手寫草稿，待產線講解取代】 */
export const opening: Opening = {
  id: "e0x-xianren-zhilu",
  ecco: "E0x",
  title: "仙人指路對卒底炮",
  summary:
    "紅方第一步挺七兵，叫「仙人指路」：先不表態，看黑方怎麼走再決定佈局。" +
    "黑方最常見的回應是把炮平到 3 路壓住那個兵（卒底炮）。本課走紅方轉中炮、兌七兵的主流線。",
  learnerSide: "r",
  verified: false,
  source: "手寫草稿，依一般開局常識整理；待離線產線驗證後取代。",
  root: [
    {
      move: "兵七進一",
      note: "仙人指路：先挺一步兵，替馬開路，也保留各種佈局的可能。",
      children: [
        {
          move: "炮2平3",
          note: "卒底炮：黑炮平到 3 路，瞄著剛挺起的紅兵。",
          children: [
            {
              move: "炮二平五",
              note: "紅方轉成當頭炮。",
              children: [
                {
                  move: "象3進5",
                  note: "黑方飛象補中，擋住當頭炮的威脅。",
                  children: [
                    {
                      move: "馬二進三",
                      note: "跳馬保護中兵。",
                      children: [
                        {
                          move: "卒3進1",
                          note: "黑方挺 3 卒，和紅方的七兵對頂。",
                          children: [
                            {
                              move: "兵七進一",
                              note: "紅兵吃掉 3 卒。",
                              children: [
                                {
                                  move: "象5進3",
                                  note: "黑象吃回紅兵，兌掉一對兵卒。",
                                  children: [
                                    {
                                      move: "車一平二",
                                      note: "紅車出到二路。",
                                      children: [
                                        {
                                          move: "馬8進7",
                                          note: "黑方跳馬。",
                                          children: [
                                            {
                                              move: "馬八進九",
                                              note: "紅方左馬跳邊，避開黑方 3 路炮的瞄準。",
                                              children: [
                                                {
                                                  move: "車9平8",
                                                  note: "黑車出動，和紅車對峙，雙方佈置完成。",
                                                },
                                              ],
                                            },
                                          ],
                                        },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          move: "卒7進1",
          kind: "alt",
          note: "對兵局：黑方也挺一步卒，同樣先不表態。",
        },
        {
          move: "象3進5",
          kind: "alt",
          note: "先飛象也很常見，穩健。",
        },
      ],
    },
  ],
  conclusion: "仙人指路的重點是靈活：紅方看黑方的佈局再決定自己走中炮還是飛相，初學者先學會這條轉中炮的主流線就夠用。",
};
