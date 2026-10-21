import type { Opening } from "../types";

/** 第六課：中炮對列炮。【手寫草稿，待產線講解取代】 */
export const opening: Opening = {
  id: "b1x-zhongpao-liepao",
  ecco: "B1x",
  title: "中炮對列炮",
  summary:
    "黑方用另一邊的炮擺到中路（炮2平5），和紅方的炮「列」在同一條線上，叫「列炮」。" +
    "和順炮比，黑方的車馬出動方向相反，局面更激烈。",
  learnerSide: "r",
  verified: false,
  source: "手寫草稿，依一般開局常識整理；待離線產線驗證後取代。",
  root: [
    {
      move: "炮二平五",
      note: "當頭炮。",
      children: [
        {
          move: "炮2平5",
          note: "列炮：黑方用右邊的炮擺到中路。",
          children: [
            {
              move: "馬二進三",
              note: "跳馬保護中兵。",
              children: [
                {
                  move: "馬8進7",
                  note: "黑方跳馬保護中卒。",
                  children: [
                    {
                      move: "車一平二",
                      note: "紅車出到二路。",
                      children: [
                        {
                          move: "車9平8",
                          note: "黑車平到 8 路對峙。",
                          children: [
                            {
                              move: "車二進六",
                              note: "過河車，壓制黑方的 7 路馬。",
                              children: [
                                {
                                  move: "馬2進3",
                                  note: "黑方跳出另一個馬。",
                                  children: [
                                    {
                                      move: "馬八進七",
                                      note: "紅方跳出另一個馬。",
                                      children: [
                                        {
                                          move: "車1平2",
                                          note: "黑方出動另一個車。",
                                          children: [
                                            {
                                              move: "車九平八",
                                              note: "紅方出車，雙方佈置完成。",
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
                              move: "車二進四",
                              kind: "alt",
                              note: "巡河車，比過河車穩健。",
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
  conclusion: "列炮局面雙方的炮都在中路，車馬出動以後常常很快短兵相接，先把子出齊的一方佔優。",
};
