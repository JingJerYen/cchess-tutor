import type { Opening } from "../types";

/** 第二課：順炮直車對橫車。【手寫草稿，待產線講解取代】 */
export const opening: Opening = {
  id: "b2x-shunpao-zhiche-hengche",
  ecco: "B2x",
  title: "順炮直車對橫車",
  summary:
    "紅方當頭炮，黑方也把同一邊的炮擺到中路，叫「順炮」。雙方都瞄著對方的中路，" +
    "節奏快、對攻多。本課走最常見的「直車對橫車」：紅車直接出到二路，黑車先橫起來再找位置。",
  learnerSide: "r",
  verified: false,
  source: "手寫草稿，依一般開局常識整理；待離線產線驗證後取代。",
  root: [
    {
      move: "炮二平五",
      note: "當頭炮，瞄準對方中卒。",
      children: [
        {
          move: "炮8平5",
          note: "順炮：黑方也把炮擺到中路，互相瞄著對方的中兵卒。",
          children: [
            {
              move: "馬二進三",
              note: "跳馬保護中兵，替車讓路。",
              children: [
                {
                  move: "馬8進7",
                  note: "黑方同樣跳馬保護中卒。",
                  children: [
                    {
                      move: "車一平二",
                      note: "直車：紅車直接出到二路。",
                      children: [
                        {
                          move: "車9進1",
                          note: "橫車：黑車先抬起來一步，準備橫移到好位置。",
                          children: [
                            {
                              move: "馬八進七",
                              note: "紅方跳出另一個馬。",
                              children: [
                                {
                                  move: "車9平4",
                                  note: "黑車平到 4 路（肋道），準備進攻紅方的側翼。",
                                  children: [
                                    {
                                      move: "兵三進一",
                                      note: "挺三兵，替三路馬開路。",
                                      children: [
                                        {
                                          move: "馬2進3",
                                          note: "黑方跳出另一個馬。",
                                          children: [
                                            {
                                              move: "兵七進一",
                                              note: "挺七兵活馬，雙方基本佈置完成。",
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
                          move: "車9平8",
                          kind: "alt",
                          note: "直車：直接把車平到 8 路和紅車對峙，是另一套走法（順炮直車對直車）。",
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
          move: "馬8進7",
          kind: "alt",
          note: "屏風馬的走法，見第一課。",
        },
      ],
    },
  ],
  conclusion: "順炮的開局雙方都很快出動車馬，接下來的中局常常是互相攻擊對方的側翼，誰的子力先到位誰佔便宜。",
};
